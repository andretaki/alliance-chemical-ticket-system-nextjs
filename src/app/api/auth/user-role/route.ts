import { getCurrentUserWithRole } from '@/lib/auth-utils';
import { apiSuccess, apiError } from '@/lib/apiResponse';

export async function GET() {
  try {
    const user = await getCurrentUserWithRole();

    if (!user) {
      // BYPASS AUTH - Return mock admin user for development
      return apiSuccess({
        role: 'admin',
        approvalStatus: 'approved',
        isExternal: false
      });
    }

    return apiSuccess({
      role: user.role,
      approvalStatus: user.approvalStatus,
      isExternal: user.isExternal
    });
  } catch (error) {
    console.error('Error fetching user role:', error);
    return apiError('internal_error', 'Internal server error', null, { status: 500 });
  }
}