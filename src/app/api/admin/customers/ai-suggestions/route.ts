import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { aiCustomerCommunicationService, CustomerProfile } from '@/services/aiCustomerCommunicationService';

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const { session, error } = await getServerSession();
        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { customerProfile } = body;

    // Validate required fields
    if (!customerProfile || !customerProfile.firstName || !customerProfile.lastName || !customerProfile.email) {
      return NextResponse.json({
        success: false,
        error: 'Customer profile with firstName, lastName, and email is required'
      }, { status: 400 });
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
      return NextResponse.json({
        success: false,
        error: 'Failed to generate AI suggestions. Please try again or contact support if the issue persists.'
      }, { status: 500 });
    }

    console.log(`[AICustomerSuggestions] Successfully generated suggestions for ${profile.firstName} ${profile.lastName}`);

    return NextResponse.json({
      success: true,
      suggestions: suggestions
    });

  } catch (error: any) {
    console.error('[AICustomerSuggestions] Error:', error);
    
    // Handle specific error types
    if (error.message?.includes('API key')) {
      return NextResponse.json({
        success: false,
        error: 'AI service configuration error. Please contact support.'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: false,
      error: error.message || 'An unexpected error occurred while generating AI suggestions'
    }, { status: 500 });
  }
}

// Optional: Add a GET endpoint for testing/health check
export async function GET(request: NextRequest) {
  try {
    const { session, error } = await getServerSession();
        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      message: 'AI Customer Suggestions API is active',
      available: true
    });

  } catch (error: any) {
    console.error('[AICustomerSuggestions] Health check error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Service unavailable'
    }, { status: 500 });
  }
} 