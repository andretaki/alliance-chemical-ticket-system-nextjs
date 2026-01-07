import {
  calls,
  contacts,
  crmTasks,
  customerIdentities,
  customerScores,
  customers,
  db,
  interactions,
  opportunities,
  orders,
  orderItems,
  qboCustomerSnapshots,
  qboEstimates,
  qboInvoices,
  ragSources,
  shipstationShipments,
  shipments,
  tickets,
  users,
} from '@/lib/db';
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import type { CustomerOverview } from '@/lib/contracts';
import {
  identityService,
  type AddressInput,
  type IdentityInput,
  type ResolutionResult,
} from '@/services/crm/identityService';
import { orderRepository } from '@/repositories/OrderRepository';

export interface MergeCandidate {
  id: number;
  primaryEmail: string | null;
  primaryPhone: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  matchedOn: Array<'email' | 'phone'>;
}

export class CustomerRepository {
  resolveOrCreateCustomer(input: IdentityInput) {
    return identityService.resolveOrCreateCustomer(input);
  }

  resolveOrCreateCustomerWithAddressHash(
    input: Omit<IdentityInput, 'email' | 'phone'>,
    address?: AddressInput
  ) {
    return identityService.resolveOrCreateCustomerWithAddressHash(input, address);
  }

  resolveCustomerAdvanced(input: IdentityInput, address?: AddressInput): Promise<ResolutionResult> {
    return identityService.resolveCustomerAdvanced(input, address);
  }

  upsertCustomerWithMetrics(input: IdentityInput, address?: AddressInput) {
    return identityService.upsertCustomerWithMetrics(input, address);
  }

  recordInteraction(input: {
    customerId: number;
    ticketId?: number | null;
    commentId?: number | null;
    channel: string;
    direction?: 'inbound' | 'outbound';
    metadata?: Record<string, unknown>;
  }) {
    return identityService.recordInteraction(input);
  }

  findByAddressHash(provider: IdentityInput['provider'], addressHash: string) {
    return identityService.findByAddressHash(provider, addressHash);
  }

  /**
   * Smart customer search with two-stage pipeline.
   *
   * Stage A (Candidates): Fast indexed lookups with explicit thresholds
   * - Uses GIN trigram indexes on search_name, company
   * - Array membership for emails (= ANY(all_emails))
   * - FTS on tsv
   *
   * Stage B (Ranking): Score candidates with GREATEST() to avoid double-counting
   * - exact_email > exact_name > prefix > name_similarity > company > fts
   * - Returns match_reasons[] and debug_scores for observability
   *
   * Uses customer_search_documents read model (denormalized, trigger-maintained)
   * Falls back to basic search if customer_search_documents doesn't exist.
   */
  async searchCustomers(query: string, options: { limit?: number; type?: 'auto' | 'email' | 'phone' | 'name' } = {}) {
    const { limit = 20, type = 'auto' } = options;
    const trimmedQuery = query.trim();

    // Don't search empty queries
    if (!trimmedQuery) {
      return { customers: [], searchType: type, totalCount: 0 };
    }

    // Try advanced search first, fallback to basic if it fails
    try {
      console.log('[CustomerRepository] Attempting advanced search...');
      const result = await this.searchCustomersAdvanced(trimmedQuery, { limit, type });
      console.log('[CustomerRepository] Advanced search succeeded');
      return result;
    } catch (error: unknown) {
      // Fall back to basic search on any error (table doesn't exist, type inference issues, etc.)
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('[CustomerRepository] Advanced search failed, falling back to basic search. Error:', errorMessage);
      try {
        const basicResult = await this.searchCustomersBasic(trimmedQuery, { limit, type });
        console.log('[CustomerRepository] Basic search succeeded, found', basicResult.customers.length, 'customers');
        return basicResult;
      } catch (basicError) {
        console.error('[CustomerRepository] Basic search also failed:', basicError);
        throw basicError;
      }
    }
  }

  /**
   * Basic customer search (fallback) - searches customers table directly.
   * Use when customer_search_documents table doesn't exist.
   */
  private async searchCustomersBasic(query: string, options: { limit?: number; type?: 'auto' | 'email' | 'phone' | 'name' } = {}) {
    const { limit = 20, type = 'auto' } = options;
    const searchTerm = `%${query}%`;
    const normalizedSearch = `%${query.replace(/\s+/g, '').toLowerCase()}%`;

    // Detect search type if auto
    let searchType = type;
    if (type === 'auto') {
      if (query.includes('@')) {
        searchType = 'email';
      } else if (/^\+?[\d\s\-\(\)\.]{7,}$/.test(query.replace(/\s/g, ''))) {
        searchType = 'phone';
      } else {
        searchType = 'name';
      }
    }

    // Build search conditions based on type
    const buildConditions = () => {
      if (searchType === 'email') {
        return or(
          ilike(customers.primaryEmail, searchTerm),
          sql`EXISTS (
            SELECT 1 FROM ticketing_prod.customer_identities ci
            WHERE ci.customer_id = ${customers.id}
            AND LOWER(ci.email) LIKE LOWER(${searchTerm})
          )`
        );
      }
      if (searchType === 'phone') {
        const normalizedPhone = query.replace(/\D/g, '');
        const phonePattern = `%${normalizedPhone.slice(-10)}%`;
        return or(
          sql`REGEXP_REPLACE(${customers.primaryPhone}, '[^0-9]', '', 'g') LIKE ${phonePattern}`,
          sql`EXISTS (
            SELECT 1 FROM ticketing_prod.customer_identities ci
            WHERE ci.customer_id = ${customers.id}
            AND REGEXP_REPLACE(ci.phone, '[^0-9]', '', 'g') LIKE ${phonePattern}
          )`
        );
      }
      // Name search - search firstName, lastName, company, and normalized name
      return or(
        ilike(customers.firstName, searchTerm),
        ilike(customers.lastName, searchTerm),
        ilike(customers.company, searchTerm),
        sql`CONCAT(${customers.firstName}, ' ', ${customers.lastName}) ILIKE ${searchTerm}`,
        // Normalized search: remove spaces from full name and compare ("andretaki" matches "Andre Taki")
        sql`LOWER(REPLACE(CONCAT(COALESCE(${customers.firstName}, ''), COALESCE(${customers.lastName}, '')), ' ', '')) LIKE ${normalizedSearch}`,
        sql`EXISTS (
          SELECT 1 FROM ticketing_prod.customer_identities ci
          WHERE ci.customer_id = ${customers.id}
          AND (ci.email ILIKE ${searchTerm} OR ci.phone ILIKE ${searchTerm})
        )`
      );
    };

    // Execute search query
    const results = await db
      .select({
        id: customers.id,
        primaryEmail: customers.primaryEmail,
        primaryPhone: customers.primaryPhone,
        firstName: customers.firstName,
        lastName: customers.lastName,
        company: customers.company,
        isVip: customers.isVip,
        createdAt: customers.createdAt,
      })
      .from(customers)
      .where(buildConditions())
      .orderBy(desc(customers.updatedAt))
      .limit(limit);

    // Fetch linked providers for each customer
    const customerIds = results.map(r => r.id);
    const identities = customerIds.length > 0
      ? await db.query.customerIdentities.findMany({
          where: inArray(customerIdentities.customerId, customerIds),
          columns: { customerId: true, provider: true },
        })
      : [];

    // Group identities by customer
    const identitiesByCustomer = new Map<number, string[]>();
    for (const identity of identities) {
      if (!identity.customerId) continue;
      const existing = identitiesByCustomer.get(identity.customerId) || [];
      existing.push(identity.provider);
      identitiesByCustomer.set(identity.customerId, existing);
    }

    return {
      customers: results.map(customer => ({
        id: customer.id,
        primaryEmail: customer.primaryEmail,
        primaryPhone: customer.primaryPhone,
        firstName: customer.firstName,
        lastName: customer.lastName,
        company: customer.company,
        isVip: customer.isVip,
        source: 'unified' as const,
        linkedProviders: [...new Set(identitiesByCustomer.get(customer.id) || [])],
      })),
      searchType,
      totalCount: results.length,
    };
  }

  /**
   * Advanced search using customer_search_documents (trigger-maintained read model).
   */
  private async searchCustomersAdvanced(query: string, options: { limit?: number; type?: 'auto' | 'email' | 'phone' | 'name' } = {}) {
    const { limit = 20, type = 'auto' } = options;

    // Normalized variants for different matching strategies
    const exactTerm = query.toLowerCase();
    const normalizedQuery = query.replace(/\s+/g, '').toLowerCase(); // "andretaki"
    const tokenizedQuery = query.toLowerCase(); // "andre taki" (preserves spaces)

    // Split query into parts for first/last name matching (e.g., "andre taki" -> ["andre", "taki"])
    const queryParts = query.toLowerCase().split(/\s+/).filter(p => p.length > 0);
    const firstPart = queryParts[0] || '';
    const lastPart = queryParts.length > 1 ? queryParts[queryParts.length - 1] : '';

    // Detect search type (determines which fields to prioritize)
    let searchType = type;
    if (type === 'auto') {
      if (query.includes('@')) {
        searchType = 'email';
      } else if (/^\+?[\d\s\-\(\)\.]{7,}$/.test(query.replace(/\s/g, ''))) {
        searchType = 'phone';
      } else {
        searchType = 'name';
      }
    }

    // Phone normalization (digits only, last 10)
    const normalizedPhone = query.replace(/\D/g, '');
    const phonePattern = normalizedPhone.length >= 7 ? `%${normalizedPhone.slice(-10)}%` : null;

    // Build the WHERE clause based on search type
    const whereClause = searchType === 'email'
      ? sql`(
          lower(primary_email) = p.exact_term OR
          p.exact_term = ANY(all_emails) OR
          similarity(lower(primary_email), p.exact_term) > 0.25
        )`
      : searchType === 'phone' && phonePattern
      ? sql`(
          p.phone_pattern_short = ANY(all_phones) OR
          search_phones LIKE p.phone_pattern
        )`
      : sql`(
          lower(primary_email) = p.exact_term OR
          p.exact_term = ANY(all_emails) OR
          similarity(search_name, p.normalized_query) > 0.2 OR
          word_similarity(search_name_tokens, p.tokenized_query) > 0.25 OR
          similarity(lower(company), p.exact_term) > 0.25 OR
          tsv @@ websearch_to_tsquery('simple', p.trimmed_query)
        )`;

    const results = await db.execute<{
      customer_id: number;
      first_name: string | null;
      last_name: string | null;
      company: string | null;
      primary_email: string | null;
      primary_phone: string | null;
      is_vip: boolean;
      customer_updated_at: Date | null;
      identity_providers: string[];
      final_score: number;
      matched_field: string;
      match_reasons: string[];
      debug_scores: Record<string, number>;
    }>(sql`
      WITH params AS (
        -- Pre-define all search parameters with explicit types
        SELECT
          ${exactTerm}::text AS exact_term,
          ${normalizedQuery}::text AS normalized_query,
          ${tokenizedQuery}::text AS tokenized_query,
          ${query}::text AS trimmed_query,
          ${exactTerm + '%'}::text AS prefix_pattern,
          ${phonePattern || ''}::text AS phone_pattern,
          ${normalizedPhone.slice(-10) || ''}::text AS phone_pattern_short,
          ${firstPart}::text AS first_part,
          ${lastPart}::text AS last_part,
          ${queryParts.length > 1}::boolean AS has_two_parts
      ),
      candidates AS (
        -- Stage A: Fast candidate retrieval using explicit thresholds (no % operator)
        SELECT DISTINCT customer_id
        FROM ticketing_prod.customer_search_documents, params p
        WHERE ${whereClause}
        LIMIT 200  -- Cap candidates for performance
      ),
      scored AS (
        -- Stage B: Scoring on candidate set with GREATEST() to avoid double-counting
        SELECT
          d.customer_id,
          d.first_name,
          d.last_name,
          d.company,
          d.primary_email,
          d.primary_phone,
          d.is_vip,
          d.customer_updated_at,
          d.identity_providers,

          -- ========== TIER-BASED SCORING SYSTEM ==========
          -- Tier 1 (10-15): Exact matches - ALWAYS WIN
          -- Tier 2 (5-9):   Strong partial matches
          -- Tier 3 (0-5):   Fuzzy matches - CAPPED so they can NEVER beat Tier 1
          (
            -- ========== TIER 1: EXACT MATCHES (10+ points) ==========

            -- Exact full name match: "andre taki" = "Andre Taki" → 15 points
            CASE WHEN p.has_two_parts AND
                      lower(d.first_name) = p.first_part AND
                      lower(d.last_name) = p.last_part
                 THEN 15.0 ELSE 0.0 END +

            -- Reversed full name: "taki andre" = "Andre Taki" → 14 points
            CASE WHEN p.has_two_parts AND
                      lower(d.first_name) = p.last_part AND
                      lower(d.last_name) = p.first_part
                 THEN 14.0 ELSE 0.0 END +

            -- Exact email match → 13 points
            CASE WHEN lower(d.primary_email) = p.exact_term
                 THEN 13.0 ELSE 0.0 END +

            -- Exact phone match → 12 points
            ${phonePattern ? sql`CASE WHEN d.search_phones LIKE p.phone_pattern THEN 12.0 ELSE 0.0 END` : sql`0.0::numeric`} +

            -- Exact email in identities (secondary email) → 11 points
            CASE WHEN p.exact_term = ANY(d.all_emails) AND lower(d.primary_email) != p.exact_term
                 THEN 11.0 ELSE 0.0 END +

            -- Exact single-word name match (first OR last) → 10 points
            CASE WHEN NOT p.has_two_parts AND
                      (lower(d.first_name) = p.exact_term OR lower(d.last_name) = p.exact_term)
                 THEN 10.0 ELSE 0.0 END +

            -- ========== TIER 2: STRONG PARTIAL MATCHES (5-9 points) ==========

            -- Both parts match as prefixes: "and tak" matches "Andre Taki" → 7 points
            CASE WHEN p.has_two_parts AND
                      lower(d.first_name) LIKE (p.first_part || '%') AND
                      lower(d.last_name) LIKE (p.last_part || '%') AND
                      NOT (lower(d.first_name) = p.first_part AND lower(d.last_name) = p.last_part)
                 THEN 7.0 ELSE 0.0 END +

            -- Single word prefix on first or last name → 5 points
            CASE WHEN NOT p.has_two_parts AND
                      (lower(d.first_name) LIKE (p.exact_term || '%') OR
                       lower(d.last_name) LIKE (p.exact_term || '%')) AND
                      lower(d.first_name) != p.exact_term AND
                      lower(d.last_name) != p.exact_term
                 THEN 5.0 ELSE 0.0 END +

            -- ========== TIER 3: FUZZY MATCHES (0-5 points, CAPPED) ==========
            -- These can NEVER outrank exact matches (max total: 5.5)

            -- Name similarity (capped at 3 points)
            LEAST(
              GREATEST(
                COALESCE(strict_word_similarity(d.search_name_tokens, p.tokenized_query), 0),
                COALESCE(word_similarity(d.search_name_tokens, p.tokenized_query), 0),
                COALESCE(similarity(d.search_name, p.normalized_query), 0)
              ) * 4.0,
              3.0
            ) +

            -- Email similarity (capped at 1 point)
            CASE WHEN lower(d.primary_email) != p.exact_term
                      AND NOT (p.exact_term = ANY(COALESCE(d.all_emails, '{}')))
                 THEN LEAST(COALESCE(similarity(lower(d.primary_email), p.exact_term), 0) * 2.0, 1.0)
                 ELSE 0.0 END +

            -- Company similarity (capped at 1 point)
            LEAST(COALESCE(similarity(lower(d.company), p.exact_term), 0) * 2.0, 1.0) +

            -- FTS rank (capped at 0.5 points)
            LEAST(COALESCE(ts_rank_cd(d.tsv, websearch_to_tsquery('simple', p.trimmed_query)), 0) * 2.0, 0.5)
          ) AS final_score,

          -- Primary matched field for UI display
          CASE
            WHEN p.has_two_parts AND lower(d.first_name) = p.first_part AND lower(d.last_name) = p.last_part THEN 'exact_full_name'
            WHEN p.has_two_parts AND lower(d.first_name) = p.last_part AND lower(d.last_name) = p.first_part THEN 'exact_full_name'
            WHEN p.has_two_parts AND lower(d.first_name) LIKE (p.first_part || '%') AND lower(d.last_name) LIKE (p.last_part || '%') THEN 'name'
            WHEN lower(d.primary_email) = p.exact_term THEN 'email'
            WHEN p.exact_term = ANY(d.all_emails) THEN 'email'
            WHEN NOT p.has_two_parts AND (lower(d.first_name) = p.exact_term OR lower(d.last_name) = p.exact_term) THEN 'name'
            ${phonePattern ? sql`WHEN d.search_phones LIKE p.phone_pattern THEN 'phone'` : sql``}
            WHEN GREATEST(
              COALESCE(word_similarity(d.search_name_tokens, p.tokenized_query), 0),
              COALESCE(similarity(d.search_name, p.normalized_query), 0)
            ) > 0.4 THEN 'name'
            WHEN similarity(lower(d.company), p.exact_term) > 0.4 THEN 'company'
            ELSE 'fts'
          END AS matched_field,

          -- Match reasons array with point values for debugging
          ARRAY_REMOVE(ARRAY[
            CASE WHEN p.has_two_parts AND lower(d.first_name) = p.first_part AND lower(d.last_name) = p.last_part THEN 'exact_full_name:15' END,
            CASE WHEN p.has_two_parts AND lower(d.first_name) = p.last_part AND lower(d.last_name) = p.first_part THEN 'reversed_name:14' END,
            CASE WHEN lower(d.primary_email) = p.exact_term THEN 'exact_email:13' END,
            ${phonePattern ? sql`CASE WHEN d.search_phones LIKE p.phone_pattern THEN 'exact_phone:12' END` : sql`NULL::text`},
            CASE WHEN p.exact_term = ANY(d.all_emails) AND lower(d.primary_email) != p.exact_term THEN 'identity_email:11' END,
            CASE WHEN NOT p.has_two_parts AND (lower(d.first_name) = p.exact_term OR lower(d.last_name) = p.exact_term) THEN 'exact_single_name:10' END,
            CASE WHEN p.has_two_parts AND lower(d.first_name) LIKE (p.first_part || '%') AND lower(d.last_name) LIKE (p.last_part || '%') AND NOT (lower(d.first_name) = p.first_part AND lower(d.last_name) = p.last_part) THEN 'prefix_both:7' END,
            CASE WHEN NOT p.has_two_parts AND (lower(d.first_name) LIKE (p.exact_term || '%') OR lower(d.last_name) LIKE (p.exact_term || '%')) AND lower(d.first_name) != p.exact_term AND lower(d.last_name) != p.exact_term THEN 'prefix_single:5' END,
            CASE WHEN word_similarity(d.search_name_tokens, p.tokenized_query) > 0.3 THEN 'fuzzy_name:0-3' END,
            CASE WHEN similarity(lower(d.company), p.exact_term) > 0.2 THEN 'fuzzy_company:0-1' END,
            CASE WHEN ts_rank_cd(d.tsv, websearch_to_tsquery('simple', p.trimmed_query)) > 0.01 THEN 'fts:0-0.5' END
          ], NULL) AS match_reasons,

          -- Debug scores for tuning (JSON object)
          jsonb_build_object(
            'name_word_sim', COALESCE(word_similarity(d.search_name_tokens, p.tokenized_query), 0),
            'name_strict_sim', COALESCE(strict_word_similarity(d.search_name_tokens, p.tokenized_query), 0),
            'name_trgm', COALESCE(similarity(d.search_name, p.normalized_query), 0),
            'email_trgm', COALESCE(similarity(lower(d.primary_email), p.exact_term), 0),
            'company_trgm', COALESCE(similarity(lower(d.company), p.exact_term), 0),
            'fts_rank', COALESCE(ts_rank_cd(d.tsv, websearch_to_tsquery('simple', p.trimmed_query)), 0)
          ) AS debug_scores
        FROM ticketing_prod.customer_search_documents d
        CROSS JOIN params p
        INNER JOIN candidates c ON c.customer_id = d.customer_id
      )
      SELECT *
      FROM scored
      WHERE final_score > 0.1  -- Filter out very weak matches
      ORDER BY
        final_score DESC,
        is_vip DESC,
        customer_updated_at DESC NULLS LAST,
        customer_id DESC
      LIMIT ${limit}
    `);

    // Transform results
    const resultRows = results as unknown as Array<{
      customer_id: number;
      first_name: string | null;
      last_name: string | null;
      company: string | null;
      primary_email: string | null;
      primary_phone: string | null;
      is_vip: boolean;
      customer_updated_at: Date | null;
      identity_providers: string[];
      final_score: number;
      matched_field: string;
      match_reasons: string[];
      debug_scores: Record<string, number>;
    }>;

    const customers = resultRows.map(row => ({
      id: row.customer_id,
      primaryEmail: row.primary_email,
      primaryPhone: row.primary_phone,
      firstName: row.first_name,
      lastName: row.last_name,
      company: row.company,
      isVip: row.is_vip,
      source: 'unified' as const,
      linkedProviders: row.identity_providers || [],
      score: row.final_score,
      matchedField: row.matched_field as 'email' | 'phone' | 'name' | 'company' | 'fts',
      matchReasons: row.match_reasons || [],
      debugScores: row.debug_scores,
    }));

    return {
      customers,
      searchType,
      totalCount: customers.length,
    };
  }

  /**
   * Check if a customer with given email/phone already exists in our unified DB.
   * Used for deduplication when showing external search results.
   */
  async findExistingByEmailsOrPhones(emails: string[], phones: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (emails.length === 0 && phones.length === 0) return result;

    const conditions = [];
    if (emails.length > 0) {
      // Use drizzle's inArray for proper array handling (avoids type inference issues)
      const lowercaseEmails = emails.map(e => e.toLowerCase());
      conditions.push(inArray(sql`LOWER(${customers.primaryEmail})`, lowercaseEmails));
      conditions.push(sql`EXISTS (
        SELECT 1 FROM ticketing_prod.customer_identities ci
        WHERE ci.customer_id = ${customers.id}
        AND LOWER(ci.email) IN (${sql.join(lowercaseEmails.map(e => sql`${e}`), sql`, `)})
      )`);
    }
    if (phones.length > 0) {
      // For LIKE ANY, construct array literal manually (postgres.js doesn't auto-serialize arrays for LIKE)
      const normalizedPhones = phones.map(p => p.replace(/\D/g, '').slice(-10));
      // Build PostgreSQL array literal: ARRAY['%123%', '%456%']::text[]
      const arrayLiteral = `ARRAY[${normalizedPhones.map(p => `'%${p}%'`).join(', ')}]::text[]`;
      conditions.push(sql`REGEXP_REPLACE(${customers.primaryPhone}, '[^0-9]', '', 'g') LIKE ANY(${sql.raw(arrayLiteral)})`);
    }

    const matches = await db
      .select({
        id: customers.id,
        email: customers.primaryEmail,
        phone: customers.primaryPhone,
      })
      .from(customers)
      .where(or(...conditions));

    for (const match of matches) {
      if (match.email) result.set(match.email.toLowerCase(), match.id);
      if (match.phone) result.set(match.phone.replace(/\D/g, '').slice(-10), match.id);
    }

    return result;
  }

  async getOverviewById(customerId: number): Promise<CustomerOverview | null> {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId),
      with: {
        identities: true,
      },
    });

    if (!customer) return null;

    const [
      recentOrders,
      openTickets,
      lateOrdersCount,
      totalOrders,
      snapshot,
      contactList,
      frequentProducts,
      opportunitiesList,
      recentCalls,
      scores,
      openTasksList,
    ] = await Promise.all([
      orderRepository.getRecentOrdersWithItems(customerId, 5),
      db.query.tickets.findMany({
        where: and(eq(tickets.customerId, customerId), ne(tickets.status, 'closed')),
        orderBy: [desc(tickets.updatedAt)],
        limit: 10,
      }),
      orderRepository.countLateOrders(customerId),
      orderRepository.countTotalOrders(customerId),
      db.query.qboCustomerSnapshots.findFirst({
        where: eq(qboCustomerSnapshots.customerId, customerId),
      }),
      db.query.contacts.findMany({
        where: eq(contacts.customerId, customerId),
        orderBy: [asc(contacts.name)],
      }),
      orderRepository.getFrequentProducts(customerId, 5),
      db
        .select({
          id: opportunities.id,
          title: opportunities.title,
          stage: opportunities.stage,
          estimatedValue: opportunities.estimatedValue,
          currency: opportunities.currency,
          updatedAt: opportunities.updatedAt,
          ownerName: users.name,
        })
        .from(opportunities)
        .leftJoin(users, eq(users.id, opportunities.ownerId))
        .where(and(eq(opportunities.customerId, customerId), inArray(opportunities.stage, ['lead', 'quote_sent'])))
        .orderBy(desc(opportunities.updatedAt))
        .limit(10),
      db
        .select({
          id: calls.id,
          direction: calls.direction,
          fromNumber: calls.fromNumber,
          toNumber: calls.toNumber,
          startedAt: calls.startedAt,
          endedAt: calls.endedAt,
          durationSeconds: calls.durationSeconds,
          ticketId: calls.ticketId,
          opportunityId: calls.opportunityId,
          recordingUrl: calls.recordingUrl,
          notes: calls.notes,
          contactName: contacts.name,
        })
        .from(calls)
        .leftJoin(contacts, eq(contacts.id, calls.contactId))
        .where(eq(calls.customerId, customerId))
        .orderBy(desc(calls.startedAt))
        .limit(10),
      db.query.customerScores.findFirst({
        where: eq(customerScores.customerId, customerId),
      }),
      db
        .select({
          id: crmTasks.id,
          type: crmTasks.type,
          reason: crmTasks.reason,
          status: crmTasks.status,
          dueAt: crmTasks.dueAt,
          opportunityId: crmTasks.opportunityId,
          opportunityTitle: opportunities.title,
          ticketId: crmTasks.ticketId,
          createdAt: crmTasks.createdAt,
        })
        .from(crmTasks)
        .leftJoin(opportunities, eq(opportunities.id, crmTasks.opportunityId))
        .where(and(eq(crmTasks.customerId, customerId), eq(crmTasks.status, 'open')))
        .orderBy(asc(crmTasks.dueAt), desc(crmTasks.createdAt))
        .limit(10),
    ]);

    const openTicketsCount = openTickets.length;

    return {
      id: customer.id,
      primaryEmail: customer.primaryEmail,
      primaryPhone: customer.primaryPhone,
      firstName: customer.firstName,
      lastName: customer.lastName,
      company: customer.company,
      isVip: customer.isVip,
      creditRiskLevel: customer.creditRiskLevel,
      identities: customer.identities.map((identity) => ({
        id: identity.id,
        provider: identity.provider,
        externalId: identity.externalId,
        email: identity.email,
        phone: identity.phone,
      })),
      contacts: contactList.map((contact) => ({
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        role: contact.role,
        notes: contact.notes,
      })),
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        provider: order.provider,
        externalId: order.externalId ?? null,
        status: order.status,
        financialStatus: order.financialStatus,
        currency: order.currency,
        total: order.total?.toString() || '0',
        placedAt: order.placedAt ? order.placedAt.toISOString() : null,
        dueAt: order.dueAt ? order.dueAt.toISOString() : null,
        paidAt: order.paidAt ? order.paidAt.toISOString() : null,
        lateFlag: order.lateFlag,
        items: (order.items || []).map((item) => ({
          id: item.id,
          sku: item.sku,
          title: item.title,
          quantity: item.quantity,
          price: item.price?.toString() || '0',
        })),
      })),
      openTickets: openTickets.map((ticket) => ({
        id: ticket.id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        updatedAt: ticket.updatedAt.toISOString(),
      })),
      openOpportunities: opportunitiesList.map((opp) => ({
        id: opp.id,
        title: opp.title,
        stage: opp.stage,
        estimatedValue: opp.estimatedValue ? opp.estimatedValue.toString() : null,
        currency: opp.currency,
        ownerName: opp.ownerName ?? null,
        updatedAt: opp.updatedAt?.toISOString
          ? opp.updatedAt.toISOString()
          : new Date(opp.updatedAt as any).toISOString(),
      })),
      recentCalls: recentCalls.map((call) => ({
        id: call.id,
        direction: call.direction,
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
        startedAt: call.startedAt instanceof Date ? call.startedAt.toISOString() : call.startedAt,
        endedAt: call.endedAt instanceof Date ? call.endedAt.toISOString() : call.endedAt ? String(call.endedAt) : null,
        durationSeconds: call.durationSeconds ?? null,
        contactName: call.contactName ?? null,
        ticketId: call.ticketId ?? null,
        opportunityId: call.opportunityId ?? null,
        recordingUrl: call.recordingUrl ?? null,
        notes: call.notes ?? null,
      })),
      qboSnapshot: snapshot
        ? {
            balance: snapshot.balance?.toString() || '0',
            currency: snapshot.currency,
            terms: snapshot.terms,
            lastInvoiceDate: snapshot.lastInvoiceDate ? snapshot.lastInvoiceDate.toISOString() : null,
            lastPaymentDate: snapshot.lastPaymentDate ? snapshot.lastPaymentDate.toISOString() : null,
            snapshotTakenAt: snapshot.snapshotTakenAt ? snapshot.snapshotTakenAt.toISOString() : new Date().toISOString(),
          }
        : null,
      frequentProducts: frequentProducts.map((row) => ({
        sku: row.sku,
        title: row.title,
        quantity: Number(row.quantity || 0),
        lastOrderedAt: row.lastOrderedAt ? row.lastOrderedAt.toISOString() : null,
      })),
      lateOrdersCount,
      openTicketsCount,
      totalOrders,
      scores: scores
        ? {
            healthScore: scores.healthScore,
            churnRisk: scores.churnRisk,
            ltv: scores.ltv?.toString() ?? null,
            last12MonthsRevenue: scores.last12MonthsRevenue?.toString() ?? null,
            rScore: scores.rScore,
            fScore: scores.fScore,
            mScore: scores.mScore,
            lastCalculatedAt: scores.lastCalculatedAt ? scores.lastCalculatedAt.toISOString() : null,
          }
        : null,
      openTasks: openTasksList.map((task) => ({
        id: task.id,
        type: task.type,
        reason: task.reason ?? null,
        status: task.status,
        dueAt: task.dueAt instanceof Date ? task.dueAt.toISOString() : task.dueAt ? String(task.dueAt) : null,
        opportunityId: task.opportunityId ?? null,
        opportunityTitle: task.opportunityTitle ?? null,
        ticketId: task.ticketId ?? null,
        createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : String(task.createdAt),
      })),
    };
  }

  /**
   * Get Customer 360 view with detailed breakdowns by provider.
   * This provides a more comprehensive view than getOverviewById,
   * grouping orders, identities, and interactions by provider/channel.
   */
  async getCustomer360(customerId: number) {
    const [
      customer,
      identities,
      customerOrders,
      customerShipments,
      customerTickets,
      customerInteractions,
      stats,
    ] = await Promise.all([
      db.query.customers.findFirst({
        where: eq(customers.id, customerId),
      }),
      db.query.customerIdentities.findMany({
        where: eq(customerIdentities.customerId, customerId),
        orderBy: desc(customerIdentities.createdAt),
      }),
      db.query.orders.findMany({
        where: eq(orders.customerId, customerId),
        orderBy: desc(orders.placedAt),
        limit: 50,
        with: { items: true },
      }),
      db.query.shipments.findMany({
        where: eq(shipments.customerId, customerId),
        orderBy: desc(shipments.shipDate),
        limit: 20,
      }),
      db.query.tickets.findMany({
        where: eq(tickets.customerId, customerId),
        orderBy: desc(tickets.updatedAt),
        limit: 20,
      }),
      db.query.interactions.findMany({
        where: eq(interactions.customerId, customerId),
        orderBy: desc(interactions.occurredAt),
        limit: 50,
      }),
      db.select({
        totalOrders: sql<number>`COUNT(DISTINCT ${orders.id})`,
        totalSpend: sql<string>`COALESCE(SUM(${orders.total}), 0)`,
        avgOrderValue: sql<string>`COALESCE(AVG(${orders.total}), 0)`,
        firstOrderDate: sql<Date | null>`MIN(${orders.placedAt})`,
        lastOrderDate: sql<Date | null>`MAX(${orders.placedAt})`,
      })
        .from(orders)
        .where(eq(orders.customerId, customerId)),
    ]);

    if (!customer) return null;

    // Group orders by provider
    const ordersByProvider = customerOrders.reduce((acc, order) => {
      const provider = order.provider || 'unknown';
      if (!acc[provider]) acc[provider] = [];
      acc[provider].push(order);
      return acc;
    }, {} as Record<string, typeof customerOrders>);

    // Group identities by provider
    const identitiesByProvider = identities.reduce((acc, identity) => {
      const provider = identity.provider || 'unknown';
      if (!acc[provider]) acc[provider] = [];
      acc[provider].push(identity);
      return acc;
    }, {} as Record<string, typeof identities>);

    // Calculate provider coverage
    const providers = [...new Set(identities.map(i => i.provider))];
    const hasEmail = identities.some(i => i.email);
    const hasPhone = identities.some(i => i.phone);
    const hasAddressHash = identities.some(i => i.externalId?.startsWith('address_hash:'));

    const orderStats = stats[0] || {
      totalOrders: 0,
      totalSpend: '0',
      avgOrderValue: '0',
      firstOrderDate: null,
      lastOrderDate: null,
    };

    return {
      customer: {
        id: customer.id,
        primaryEmail: customer.primaryEmail,
        primaryPhone: customer.primaryPhone,
        firstName: customer.firstName,
        lastName: customer.lastName,
        company: customer.company,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      identities: {
        all: identities.map(i => ({
          id: i.id,
          provider: i.provider,
          externalId: i.externalId,
          email: i.email,
          phone: i.phone,
          metadata: i.metadata,
          createdAt: i.createdAt,
        })),
        byProvider: identitiesByProvider,
        providers,
        coverage: {
          hasEmail,
          hasPhone,
          hasAddressHash,
          providerCount: providers.length,
        },
      },
      orders: {
        all: customerOrders.map(o => ({
          id: o.id,
          provider: o.provider,
          externalId: o.externalId,
          orderNumber: o.orderNumber,
          status: o.status,
          financialStatus: o.financialStatus,
          total: o.total,
          currency: o.currency,
          placedAt: o.placedAt,
          paidAt: o.paidAt,
          lateFlag: o.lateFlag,
          items: o.items.map(item => ({
            sku: item.sku,
            title: item.title,
            quantity: item.quantity,
            price: item.price,
          })),
        })),
        byProvider: Object.fromEntries(
          Object.entries(ordersByProvider).map(([provider, providerOrders]) => [
            provider,
            {
              count: providerOrders.length,
              total: providerOrders.reduce((sum, o) => sum + parseFloat(o.total || '0'), 0).toFixed(2),
              orders: providerOrders.map(o => ({
                id: o.id,
                orderNumber: o.orderNumber,
                total: o.total,
                status: o.status,
                placedAt: o.placedAt,
              })),
            },
          ])
        ),
        stats: orderStats,
      },
      shipments: customerShipments.map(s => ({
        id: s.id,
        provider: s.provider,
        orderId: s.orderId,
        trackingNumber: s.trackingNumber,
        carrierCode: s.carrierCode,
        status: s.status,
        shipDate: s.shipDate,
        estimatedDeliveryDate: s.estimatedDeliveryDate,
        actualDeliveryDate: s.actualDeliveryDate,
      })),
      tickets: customerTickets.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        type: t.type,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      interactions: {
        recent: customerInteractions.slice(0, 20).map(i => ({
          id: i.id,
          channel: i.channel,
          direction: i.direction,
          occurredAt: i.occurredAt,
          metadata: i.metadata,
        })),
        byChannel: customerInteractions.reduce((acc, i) => {
          const channel = i.channel || 'unknown';
          acc[channel] = (acc[channel] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        totalCount: customerInteractions.length,
      },
      summary: {
        name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.company || 'Unknown',
        primaryEmail: customer.primaryEmail,
        primaryPhone: customer.primaryPhone,
        totalOrders: customerOrders.length,
        totalSpend: orderStats.totalSpend,
        avgOrderValue: orderStats.avgOrderValue,
        daysSinceLastOrder: orderStats.lastOrderDate
          ? Math.floor((Date.now() - new Date(orderStats.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24))
          : null,
        openTickets: customerTickets.filter(t => t.status !== 'closed').length,
        linkedProviders: providers,
      },
    };
  }

  async findMergeCandidates(customerId: number): Promise<MergeCandidate[]> {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId),
    });
    if (!customer) return [];

    const identities = await db.query.customerIdentities.findMany({
      where: eq(customerIdentities.customerId, customerId),
    });

    const emailSet = new Set<string>();
    const phoneSet = new Set<string>();
    if (customer.primaryEmail) emailSet.add(customer.primaryEmail);
    if (customer.primaryPhone) phoneSet.add(customer.primaryPhone);
    identities.forEach((identity) => {
      if (identity.email) emailSet.add(identity.email);
      if (identity.phone) phoneSet.add(identity.phone);
    });

    const emails = Array.from(emailSet);
    const phones = Array.from(phoneSet);
    if (emails.length === 0 && phones.length === 0) return [];

    const identityFilters = [];
    if (emails.length > 0) identityFilters.push(inArray(customerIdentities.email, emails));
    if (phones.length > 0) identityFilters.push(inArray(customerIdentities.phone, phones));

    const customerFilters = [];
    if (emails.length > 0) customerFilters.push(inArray(customers.primaryEmail, emails));
    if (phones.length > 0) customerFilters.push(inArray(customers.primaryPhone, phones));

    const identityMatches = identityFilters.length
      ? await db
          .select({
            customerId: customerIdentities.customerId,
            email: customerIdentities.email,
            phone: customerIdentities.phone,
          })
          .from(customerIdentities)
          .where(and(ne(customerIdentities.customerId, customerId), or(...identityFilters)))
      : [];

    const customerMatches = customerFilters.length
      ? await db
          .select({
            id: customers.id,
            primaryEmail: customers.primaryEmail,
            primaryPhone: customers.primaryPhone,
          })
          .from(customers)
          .where(and(ne(customers.id, customerId), or(...customerFilters)))
      : [];

    const candidateIds = new Set<number>();
    identityMatches.forEach((match) => {
      if (match.customerId) candidateIds.add(match.customerId);
    });
    customerMatches.forEach((match) => candidateIds.add(match.id));

    if (candidateIds.size === 0) return [];

    const candidates = await db.query.customers.findMany({
      where: inArray(customers.id, Array.from(candidateIds)),
    });

    const matchedOnMap = new Map<number, Set<'email' | 'phone'>>();
    identityMatches.forEach((match) => {
      if (!match.customerId) return;
      const entry = matchedOnMap.get(match.customerId) ?? new Set<'email' | 'phone'>();
      if (match.email && emailSet.has(match.email)) entry.add('email');
      if (match.phone && phoneSet.has(match.phone)) entry.add('phone');
      matchedOnMap.set(match.customerId, entry);
    });
    customerMatches.forEach((match) => {
      const entry = matchedOnMap.get(match.id) ?? new Set<'email' | 'phone'>();
      if (match.primaryEmail && emailSet.has(match.primaryEmail)) entry.add('email');
      if (match.primaryPhone && phoneSet.has(match.primaryPhone)) entry.add('phone');
      matchedOnMap.set(match.id, entry);
    });

    return candidates.map((candidate) => ({
      id: candidate.id,
      primaryEmail: candidate.primaryEmail,
      primaryPhone: candidate.primaryPhone,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      company: candidate.company,
      matchedOn: Array.from(matchedOnMap.get(candidate.id) ?? []),
    }));
  }

  async mergeCustomers(primaryCustomerId: number, mergeCustomerIds: number[]) {
    const uniqueMergeIds = Array.from(new Set(mergeCustomerIds)).filter((id) => id !== primaryCustomerId);
    if (uniqueMergeIds.length === 0) {
      return { mergedCount: 0 };
    }

    return db.transaction(async (tx) => {
      await tx.update(customerIdentities)
        .set({ customerId: primaryCustomerId })
        .where(inArray(customerIdentities.customerId, uniqueMergeIds));

      await tx.update(contacts)
        .set({ customerId: primaryCustomerId })
        .where(inArray(contacts.customerId, uniqueMergeIds));

      await tx.update(orders)
        .set({ customerId: primaryCustomerId })
        .where(inArray(orders.customerId, uniqueMergeIds));

      await tx.update(tickets)
        .set({ customerId: primaryCustomerId })
        .where(inArray(tickets.customerId, uniqueMergeIds));

      await tx.update(interactions)
        .set({ customerId: primaryCustomerId })
        .where(inArray(interactions.customerId, uniqueMergeIds));

      await tx.update(opportunities)
        .set({ customerId: primaryCustomerId })
        .where(inArray(opportunities.customerId, uniqueMergeIds));

      await tx.update(calls)
        .set({ customerId: primaryCustomerId })
        .where(inArray(calls.customerId, uniqueMergeIds));

      await tx.update(crmTasks)
        .set({ customerId: primaryCustomerId })
        .where(inArray(crmTasks.customerId, uniqueMergeIds));

      await tx.update(qboInvoices)
        .set({ customerId: primaryCustomerId })
        .where(inArray(qboInvoices.customerId, uniqueMergeIds));

      await tx.update(qboEstimates)
        .set({ customerId: primaryCustomerId })
        .where(inArray(qboEstimates.customerId, uniqueMergeIds));

      await tx.update(shipstationShipments)
        .set({ customerId: primaryCustomerId })
        .where(inArray(shipstationShipments.customerId, uniqueMergeIds));

      await tx.update(shipments)
        .set({ customerId: primaryCustomerId })
        .where(inArray(shipments.customerId, uniqueMergeIds));

      await tx.update(ragSources)
        .set({ customerId: primaryCustomerId })
        .where(inArray(ragSources.customerId, uniqueMergeIds));

      const primarySnapshot = await tx.query.qboCustomerSnapshots.findFirst({
        where: eq(qboCustomerSnapshots.customerId, primaryCustomerId),
      });
      if (!primarySnapshot) {
        await tx.update(qboCustomerSnapshots)
          .set({ customerId: primaryCustomerId })
          .where(inArray(qboCustomerSnapshots.customerId, uniqueMergeIds));
      } else {
        await tx.delete(qboCustomerSnapshots)
          .where(inArray(qboCustomerSnapshots.customerId, uniqueMergeIds));
      }

      const primaryScores = await tx.query.customerScores.findFirst({
        where: eq(customerScores.customerId, primaryCustomerId),
      });
      if (!primaryScores) {
        await tx.update(customerScores)
          .set({ customerId: primaryCustomerId })
          .where(inArray(customerScores.customerId, uniqueMergeIds));
      } else {
        await tx.delete(customerScores)
          .where(inArray(customerScores.customerId, uniqueMergeIds));
      }

      await tx.delete(customers).where(inArray(customers.id, uniqueMergeIds));

      return { mergedCount: uniqueMergeIds.length };
    });
  }
}

export const customerRepository = new CustomerRepository();
