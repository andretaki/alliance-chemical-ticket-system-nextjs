import type { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { aiCustomerCommunicationService, CustomerProfile } from '@/services/aiCustomerCommunicationService';
import { apiSuccess, apiError } from '@/lib/apiResponse';

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const { session, error } = await getServerSession();
    if (error) {
      return apiError('unauthorized', error, null, { status: 401 });
    }
    if (!session || session.user?.role !== 'admin') {
      return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
    }

    const body = await request.json();
    const { customerProfile } = body;

    // Validate required fields
    if (!customerProfile || !customerProfile.firstName || !customerProfile.lastName || !customerProfile.email) {
      return apiError('validation_error', 'Customer profile with firstName, lastName, and email is required', null, { status: 400 });
    }

    // Validate customer profile structure
    const profile: CustomerProfile = {
      firstName: customerProfile.firstName,
      lastName: customerProfile.lastName,
      email: customerProfile.email,
      company: customerProfile.company || undefined,
      customerType: customerProfile.customerType || 'retail',
      shippingAddress: {
        city: customerProfile.shippingAddress?.city || 'Not specified',
        province: customerProfile.shippingAddress?.province || 'Not specified',
        country: customerProfile.shippingAddress?.country || 'United States'
      }
    };

    console.log(`[AICustomerSuggestions] Generating suggestions for ${profile.firstName} ${profile.lastName} (${profile.customerType})`);

    // Generate AI suggestions
    const suggestions = await aiCustomerCommunicationService.generateCustomerCommunicationSuggestions(profile);

    if (!suggestions) {
      console.error('[AICustomerSuggestions] Failed to generate AI suggestions');
      return apiError('ai_error', 'Failed to generate AI suggestions. Please try again or contact support if the issue persists.', null, { status: 500 });
    }

    console.log(`[AICustomerSuggestions] Successfully generated suggestions for ${profile.firstName} ${profile.lastName}`);

    return apiSuccess({ suggestions });

  } catch (error: any) {
    console.error('[AICustomerSuggestions] Error:', error);

    // Handle specific error types
    if (error.message?.includes('API key')) {
      return apiError('configuration_error', 'AI service configuration error. Please contact support.', null, { status: 500 });
    }

    return apiError('internal_error', error.message || 'An unexpected error occurred while generating AI suggestions', null, { status: 500 });
  }
}

// Optional: Add a GET endpoint for testing/health check
export async function GET() {
  try {
    const { session, error } = await getServerSession();
    if (error) {
      return apiError('unauthorized', error, null, { status: 401 });
    }
    if (!session || session.user?.role !== 'admin') {
      return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
    }

    return apiSuccess({
      message: 'AI Customer Suggestions API is active',
      available: true
    });

  } catch (error: any) {
    console.error('[AICustomerSuggestions] Health check error:', error);
    return apiError('internal_error', error.message || 'Service unavailable', null, { status: 500 });
  }
} 