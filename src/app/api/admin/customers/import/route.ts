import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth-helpers';
import { apiSuccess, apiError } from '@/lib/apiResponse';
import { customerRepository } from '@/repositories/CustomerRepository';
import { rateLimiters } from '@/lib/rateLimiting';
import { logInfo, logError } from '@/utils/logger';
import type { Provider } from '@/services/crm/identityService';

/**
 * Bulk Customer Import API
 *
 * POST /api/admin/customers/import
 *
 * Accepts an array of customer records and upserts them using identity resolution.
 * Deduplicates automatically - existing customers are linked, not duplicated.
 *
 * Returns a detailed report of the import operation.
 */

// Single customer record schema
const customerRecordSchema = z.object({
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  provider: z.enum(['shopify', 'amazon', 'qbo', 'shipstation', 'manual']).default('manual'),
  externalId: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
}).refine(
  (data) => data.email || data.phone || data.externalId,
  { message: 'At least one of email, phone, or externalId is required' }
);

// Import request schema
const importRequestSchema = z.object({
  customers: z.array(customerRecordSchema).min(1, 'At least one customer is required').max(1000, 'Maximum 1000 customers per import'),
  dryRun: z.boolean().default(false),
});

type CustomerRecord = z.infer<typeof customerRecordSchema>;

interface ImportResult {
  created: number;
  updated: number;
  linked: number;
  skipped: number;
  errors: Array<{ index: number; record: CustomerRecord; error: string }>;
  customers: Array<{ index: number; customerId: number; action: 'created' | 'updated' | 'linked' | 'skipped' }>;
}

export async function POST(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await rateLimiters.admin.middleware(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Auth check - admin only
  const authResult = await requireAdmin();
  if (authResult.error) {
    return apiError('unauthorized', authResult.error, undefined, { status: authResult.status });
  }

  try {
    const body = await request.json();
    const validation = importRequestSchema.safeParse(body);

    if (!validation.success) {
      return apiError('validation_error', 'Invalid import data', validation.error.errors, { status: 400 });
    }

    const { customers: records, dryRun } = validation.data;

    logInfo('admin.customers.import.start', {
      count: records.length,
      dryRun,
    });

    const result: ImportResult = {
      created: 0,
      updated: 0,
      linked: 0,
      skipped: 0,
      errors: [],
      customers: [],
    };

    // Process each customer record
    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      try {
        // Skip if no identifying information
        if (!record.email && !record.phone && !record.externalId) {
          result.skipped++;
          result.customers.push({ index: i, customerId: 0, action: 'skipped' });
          continue;
        }

        if (dryRun) {
          // In dry run mode, just validate and check if customer would be created or linked
          const existing = await checkExistingCustomer(record);
          if (existing) {
            result.linked++;
            result.customers.push({ index: i, customerId: existing, action: 'linked' });
          } else {
            result.created++;
            result.customers.push({ index: i, customerId: 0, action: 'created' });
          }
          continue;
        }

        // Use identity resolution to create or link customer
        const upsertResult = await customerRepository.upsertCustomerWithMetrics({
          provider: record.provider as Provider,
          externalId: record.externalId || undefined,
          email: record.email || undefined,
          phone: record.phone || undefined,
          firstName: record.firstName || undefined,
          lastName: record.lastName || undefined,
          company: record.company || undefined,
          metadata: {
            ...record.metadata,
            importedAt: new Date().toISOString(),
            importSource: 'bulk_import',
          },
        });

        if (!upsertResult || !upsertResult.customerId) {
          result.errors.push({
            index: i,
            record,
            error: 'Failed to resolve or create customer',
          });
          continue;
        }

        // Categorize the result based on action
        const action = upsertResult.action === 'ambiguous' ? 'linked' : upsertResult.action;
        if (action === 'created') {
          result.created++;
        } else if (action === 'linked') {
          result.linked++;
        } else {
          result.updated++;
        }
        result.customers.push({ index: i, customerId: upsertResult.customerId, action });

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        result.errors.push({
          index: i,
          record,
          error: errorMessage,
        });
        logError('admin.customers.import.record_error', {
          index: i,
          email: record.email,
          error: errorMessage,
        });
      }
    }

    logInfo('admin.customers.import.complete', {
      dryRun,
      created: result.created,
      updated: result.updated,
      linked: result.linked,
      skipped: result.skipped,
      errors: result.errors.length,
    });

    return apiSuccess({
      dryRun,
      summary: {
        total: records.length,
        created: result.created,
        updated: result.updated,
        linked: result.linked,
        skipped: result.skipped,
        errors: result.errors.length,
      },
      errors: result.errors,
      customers: result.customers,
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logError('admin.customers.import.error', { error: errorMessage });
    return apiError('import_error', 'Failed to import customers', errorMessage, { status: 500 });
  }
}

/**
 * Check if a customer already exists (used for dry run mode).
 * Returns customer ID if found, null otherwise.
 */
async function checkExistingCustomer(record: CustomerRecord): Promise<number | null> {
  try {
    const emails = record.email ? [record.email] : [];
    const phones = record.phone ? [record.phone] : [];

    if (emails.length === 0 && phones.length === 0) {
      return null;
    }

    const existingMap = await customerRepository.findExistingByEmailsOrPhones(emails, phones);

    // Check email match first
    if (record.email && existingMap.has(record.email.toLowerCase())) {
      return existingMap.get(record.email.toLowerCase()) || null;
    }

    // Check phone match
    if (record.phone) {
      const normalizedPhone = record.phone.replace(/\D/g, '').slice(-10);
      if (existingMap.has(normalizedPhone)) {
        return existingMap.get(normalizedPhone) || null;
      }
    }

    return null;
  } catch {
    return null;
  }
}
