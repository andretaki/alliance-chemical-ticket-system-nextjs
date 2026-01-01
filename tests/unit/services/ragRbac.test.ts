import { canViewRagRow } from '@/services/rag/ragRbac';
import type { ViewerScope } from '@/services/rag/ragTypes';

describe('ragRbac.canViewRagRow', () => {
  const baseScope: ViewerScope = {
    userId: 'user-1',
    role: 'user',
    isAdmin: false,
    isManager: false,
    isExternal: false,
    allowInternal: true,
    allowedCustomerIds: [101],
    allowedDepartments: ['sales'],
  };

  it('allows internal items only when customer is in scope and internal is allowed', () => {
    expect(
      canViewRagRow(baseScope, {
        customerId: 101,
        sensitivity: 'internal',
        metadata: {},
      })
    ).toBe(true);

    expect(
      canViewRagRow({ ...baseScope, allowInternal: false }, {
        customerId: 101,
        sensitivity: 'internal',
        metadata: {},
      })
    ).toBe(false);

    expect(
      canViewRagRow(baseScope, {
        customerId: 999,
        sensitivity: 'internal',
        metadata: {},
      })
    ).toBe(false);
  });

  it('enforces department tags', () => {
    expect(
      canViewRagRow(baseScope, {
        customerId: 101,
        sensitivity: 'public',
        metadata: { dept: 'purchasing' },
      })
    ).toBe(false);

    expect(
      canViewRagRow({ ...baseScope, allowedDepartments: ['purchasing'] }, {
        customerId: 101,
        sensitivity: 'public',
        metadata: { dept: 'purchasing' },
      })
    ).toBe(true);
  });
});
