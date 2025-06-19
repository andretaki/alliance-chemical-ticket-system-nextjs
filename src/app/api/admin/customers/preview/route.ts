import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { aiCustomerCommunicationService } from '@/services/aiCustomerCommunicationService';
import { z } from 'zod';

const previewSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  customerType: z.enum(['retail', 'wholesale', 'distributor']),
});

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = previewSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        details: validationResult.error.errors
      }, { status: 400 });
    }

    const { firstName, lastName, customerType } = validationResult.data;

    // Generate quick welcome message preview
    const customerName = `${firstName} ${lastName}`;
    const preview = await aiCustomerCommunicationService.generateQuickWelcomeMessage(
      customerName,
      customerType
    );

    if (!preview) {
      return NextResponse.json({
        success: false,
        error: 'Unable to generate preview at this time'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      preview: preview
    });

  } catch (error: any) {
    console.error('[CustomerPreview] Error generating preview:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'An unexpected error occurred'
    }, { status: 500 });
  }
} 