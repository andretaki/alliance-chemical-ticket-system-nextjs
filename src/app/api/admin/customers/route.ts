import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { ShopifyService } from '@/services/shopify/ShopifyService';
import { aiCustomerCommunicationService, CustomerProfile } from '@/services/aiCustomerCommunicationService';
import { z } from 'zod';

// Validation schema for customer creation
const createCustomerSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  company: z.string().optional(),
  shippingAddress: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    company: z.string().optional(),
    address1: z.string().min(1, 'Address is required'),
    address2: z.string().optional(),
    city: z.string().min(1, 'City is required'),
    province: z.string().optional(),
    country: z.string().min(1, 'Country is required'),
    zip: z.string().min(1, 'ZIP code is required'),
    phone: z.string().optional(),
  }),
  billingAddress: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    company: z.string().optional(),
    address1: z.string().min(1, 'Address is required'),
    address2: z.string().optional(),
    city: z.string().min(1, 'City is required'),
    province: z.string().optional(),
    country: z.string().min(1, 'Country is required'),
    zip: z.string().min(1, 'ZIP code is required'),
    phone: z.string().optional(),
  }),
  useSameAddressForBilling: z.boolean(),
  customerType: z.enum(['retail', 'wholesale', 'distributor']),
  tags: z.string().optional(),
  notes: z.string().optional(),
});

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

    // Parse and validate request body
    const body = await request.json();
    const validationResult = createCustomerSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        details: validationResult.error.errors
      }, { status: 400 });
    }

    const customerData = validationResult.data;

    // Prepare tags array
    const tags = ['AdminCreated', `Type:${customerData.customerType}`];
    if (customerData.tags) {
      const additionalTags = customerData.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);
      tags.push(...additionalTags);
    }

    // Prepare customer note
    let note = 'Customer manually created via admin interface.';
    if (customerData.notes) {
      note += ` Notes: ${customerData.notes}`;
    }
    if (customerData.company) {
      note += ` Company: ${customerData.company}`;
    }

    // Initialize Shopify service
    const shopifyService = new ShopifyService();

    // Create customer in Shopify
    const shopifyResult = await shopifyService.createCustomer({
      email: customerData.email.toLowerCase().trim(),
      firstName: customerData.firstName.trim(),
      lastName: customerData.lastName.trim(),
      phone: customerData.phone?.trim() || undefined,
      tags,
      note: note.trim()
    });

    if (!shopifyResult.success) {
      return NextResponse.json({
        success: false,
        error: shopifyResult.error || 'Failed to create customer in Shopify'
      }, { status: 500 });
    }

    // If customer was created successfully, add addresses
    if (!shopifyResult.alreadyExists && shopifyResult.customerId) {
      try {
        // Add shipping address
        await shopifyService.addCustomerAddress(
          shopifyResult.customerId,
          {
            firstName: customerData.shippingAddress.firstName || customerData.firstName,
            lastName: customerData.shippingAddress.lastName || customerData.lastName,
            company: customerData.shippingAddress.company || customerData.company || '',
            address1: customerData.shippingAddress.address1,
            address2: customerData.shippingAddress.address2 || '',
            city: customerData.shippingAddress.city,
            province: customerData.shippingAddress.province || '',
            country: customerData.shippingAddress.country,
            zip: customerData.shippingAddress.zip,
            phone: customerData.shippingAddress.phone || customerData.phone || ''
          },
          true // Set as default address
        );

        // Add billing address if different from shipping
        if (!customerData.useSameAddressForBilling) {
          await shopifyService.addCustomerAddress(
            shopifyResult.customerId,
            {
              firstName: customerData.billingAddress.firstName || customerData.firstName,
              lastName: customerData.billingAddress.lastName || customerData.lastName,
              company: customerData.billingAddress.company || customerData.company || '',
              address1: customerData.billingAddress.address1,
              address2: customerData.billingAddress.address2 || '',
              city: customerData.billingAddress.city,
              province: customerData.billingAddress.province || '',
              country: customerData.billingAddress.country,
              zip: customerData.billingAddress.zip,
              phone: customerData.billingAddress.phone || customerData.phone || ''
            },
            false // Not the default address
          );
        }
      } catch (addressError) {
        console.error('Error adding customer addresses:', addressError);
        // Don't fail the entire operation if address creation fails
        // The customer was still created successfully
      }
    }

    // Log the successful creation
    console.log(`[AdminCustomerCreation] Customer ${shopifyResult.alreadyExists ? 'found' : 'created'}: ${customerData.email} (ID: ${shopifyResult.customerId})`);

    return NextResponse.json({
      success: true,
      customerId: shopifyResult.customerId,
      customer: shopifyResult.customer,
      alreadyExists: shopifyResult.alreadyExists
    });

  } catch (error: any) {
    console.error('[AdminCustomerCreation] Error creating customer:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'An unexpected error occurred'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const { session, error } = await getServerSession();
        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // This endpoint could be used to list customers or get customer details
    // For now, return a basic status
    return NextResponse.json({
      success: true,
      message: 'Customer API endpoint is active'
    });

  } catch (error: any) {
    console.error('[AdminCustomerAPI] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'An unexpected error occurred'
    }, { status: 500 });
  }
} 