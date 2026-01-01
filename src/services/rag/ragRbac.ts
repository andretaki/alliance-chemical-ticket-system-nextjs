import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { getCurrentUserWithRole } from '@/lib/auth-utils';
import { db, crmTasks, opportunities, ticketComments, tickets, ragSources } from '@/lib/db';
import type { RagSensitivity, ViewerScope } from './ragTypes';

function extractDepartments(user: { role: string; ticketingRole?: string | null } & Record<string, any>): string[] {
  const departments: string[] = [];
  const ticketingRole = user.ticketingRole ? String(user.ticketingRole).toLowerCase() : '';
  if (ticketingRole.includes('purchasing')) departments.push('purchasing');
  if (ticketingRole.includes('ar') || ticketingRole.includes('account')) departments.push('ar');

  const sessionDept = (user as any).department ?? (user as any).departments;
  if (typeof sessionDept === 'string') departments.push(sessionDept.toLowerCase());
  if (Array.isArray(sessionDept)) {
    sessionDept.forEach((dept) => {
      if (typeof dept === 'string') departments.push(dept.toLowerCase());
    });
  }

  if (user.role === 'admin') departments.push('*');
  return Array.from(new Set(departments));
}

async function fetchScopedCustomerIds(userId: string): Promise<number[]> {
  const [ticketRows, commentRows, taskRows, opportunityRows] = await Promise.all([
    db.select({ customerId: tickets.customerId })
      .from(tickets)
      .where(or(eq(tickets.assigneeId, userId), eq(tickets.reporterId, userId))),
    db.select({ customerId: tickets.customerId })
      .from(ticketComments)
      .leftJoin(tickets, eq(ticketComments.ticketId, tickets.id))
      .where(eq(ticketComments.commenterId, userId)),
    db.select({ customerId: crmTasks.customerId })
      .from(crmTasks)
      .where(eq(crmTasks.assignedToId, userId)),
    db.select({ customerId: opportunities.customerId })
      .from(opportunities)
      .where(eq(opportunities.ownerId, userId)),
  ]);

  const ids = new Set<number>();
  [...ticketRows, ...commentRows, ...taskRows, ...opportunityRows].forEach((row) => {
    if (row.customerId != null) ids.add(row.customerId);
  });
  return Array.from(ids);
}

export async function getViewerScope(): Promise<ViewerScope | null> {
  const user = await getCurrentUserWithRole();
  if (!user) return null;

  const isAdmin = user.role === 'admin';
  const isManager = user.role === 'manager';
  const allowInternal = !user.isExternal;

  const allowedCustomerIds = isAdmin || isManager ? [] : await fetchScopedCustomerIds(user.id);

  return {
    userId: user.id,
    role: user.role,
    isAdmin,
    isManager,
    isExternal: user.isExternal,
    allowInternal,
    allowedCustomerIds,
    allowedDepartments: extractDepartments(user),
  };
}

export function buildRagAccessWhere(scope: ViewerScope, options?: {
  includeInternal?: boolean;
  customerId?: number | null;
  ticketId?: number | null;
  allowGlobal?: boolean;
  enforceTicketId?: boolean;
}) {
  const enforceTicketId = options?.enforceTicketId ?? true;
  const includeInternal = Boolean(scope.allowInternal && options?.includeInternal);
  const conditions: SQL[] = [];
  const hasContext = Boolean(options?.customerId || (options?.ticketId && enforceTicketId));
  const allowGlobal = options?.allowGlobal ?? false;

  if (!hasContext) {
    if (!(scope.isAdmin || scope.isManager)) return sql`FALSE`;
    if (!allowGlobal) return sql`FALSE`;
  }

  if (options?.customerId) {
    conditions.push(sql`${ragSources.customerId} = ${options.customerId}`);
  }
  if (options?.ticketId && enforceTicketId) {
    conditions.push(sql`${ragSources.ticketId} = ${options.ticketId}`);
  }

  if (scope.isAdmin || scope.isManager) {
    if (!includeInternal) {
      conditions.push(eq(ragSources.sensitivity, 'public'));
    }
    return conditions.length ? and(...conditions) : sql`TRUE`;
  }

  if (scope.allowedCustomerIds.length === 0) {
    return sql`FALSE`;
  }

  const customerScope = inArray(ragSources.customerId, scope.allowedCustomerIds);
  const sensitivityAllowed = includeInternal
    ? or(
        eq(ragSources.sensitivity, 'public'),
        and(eq(ragSources.sensitivity, 'internal'), customerScope)
      )
    : eq(ragSources.sensitivity, 'public');

  const departmentAllowed = scope.allowedDepartments.includes('*')
    ? sql`TRUE`
    : scope.allowedDepartments.length === 0
      ? sql`${ragSources.metadata}->>'dept' IS NULL`
      : sql`(${ragSources.metadata}->>'dept' IS NULL OR ${ragSources.metadata}->>'dept' = ANY(ARRAY[${sql.join(scope.allowedDepartments.map(d => sql`${d}`), sql`, `)}]::text[]))`;

  conditions.push(customerScope);
  if (sensitivityAllowed) {
    conditions.push(sensitivityAllowed);
  }
  conditions.push(departmentAllowed);
  conditions.push(sql`NOT (${ragSources.customerId} IS NULL)`);

  return and(...conditions);
}

export function canViewRagRow(scope: ViewerScope, row: {
  customerId: number | null;
  sensitivity: RagSensitivity | null;
  metadata: Record<string, any>;
}, options?: { includeInternal?: boolean }): boolean {
  const includeInternal = Boolean(scope.allowInternal && options?.includeInternal);
  if (row.sensitivity === 'internal' && !includeInternal) return false;
  if (scope.isAdmin || scope.isManager) return true;
  if (row.customerId == null) return false;
  if (!scope.allowedCustomerIds.includes(row.customerId)) return false;
  const dept = typeof row.metadata?.dept === 'string' ? row.metadata.dept.toLowerCase() : null;
  if (!dept) return true;
  if (scope.allowedDepartments.includes('*')) return true;
  return scope.allowedDepartments.includes(dept);
}
