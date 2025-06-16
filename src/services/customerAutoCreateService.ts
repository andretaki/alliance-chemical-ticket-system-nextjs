import { ShopifyService } from './shopify/ShopifyService';

export interface CustomerCreateData {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  ticketId?: number;
  source?: 'ticket' | 'email' | 'quote_form' | 'phone';
}

export interface CustomerCreateResult {
  success: boolean;
  customerId?: string;
  customer?: any;
  alreadyExists?: boolean;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

export class CustomerAutoCreateService {
  private shopifyService: ShopifyService;

  constructor() {
    this.shopifyService = new ShopifyService();
  }

  /**
   * Automatically create a customer in Shopify if they don't already exist
   * This is called when tickets are created from customer inquiries
   */
  public async createCustomerFromTicket(data: CustomerCreateData): Promise<CustomerCreateResult> {
    try {
      // Validate required data
      if (!data.email || !this.isValidEmail(data.email)) {
        console.log(`[CustomerAutoCreate] Skipping customer creation - invalid email: ${data.email}`);
        return {
          success: false,
          skipped: true,
          skipReason: 'Invalid or missing email address'
        };
      }

      // Prepare customer data for Shopify
      const customerData = this.prepareCustomerData(data);
      
      console.log(`[CustomerAutoCreate] Attempting to create customer from ticket: ${data.email} (Ticket: ${data.ticketId})`);
      
      // Use the ShopifyService to create or check customer
      const result = await this.shopifyService.createCustomer(customerData);
      
      if (result.success) {
        if (result.alreadyExists) {
          console.log(`[CustomerAutoCreate] Customer already exists in Shopify: ${data.email} (ID: ${result.customerId})`);
        } else {
          console.log(`[CustomerAutoCreate] Customer created successfully in Shopify: ${data.email} (ID: ${result.customerId})`);
        }
        
        return {
          success: true,
          customerId: result.customerId,
          customer: result.customer,
          alreadyExists: result.alreadyExists
        };
      } else {
        console.error(`[CustomerAutoCreate] Failed to create customer: ${data.email} - ${result.error}`);
        return {
          success: false,
          error: result.error
        };
      }

    } catch (error: any) {
      console.error('[CustomerAutoCreate] Error in createCustomerFromTicket:', error);
      return {
        success: false,
        error: error.message || 'Unknown error occurred'
      };
    }
  }

  /**
   * Prepare customer data for Shopify creation
   */
  private prepareCustomerData(data: CustomerCreateData) {
    // Parse name if provided as a single string
    let firstName = data.firstName;
    let lastName = data.lastName;
    
    // If we don't have separate first/last name but have a full name, try to parse it
    if (!firstName && !lastName && data.firstName) {
      const nameParts = data.firstName.trim().split(' ');
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' ');
    }

    // Prepare tags to track where this customer came from
    const tags = ['TicketSystem'];
    if (data.source) {
      tags.push(`Source:${data.source}`);
    }
    if (data.ticketId) {
      tags.push(`Ticket:${data.ticketId}`);
    }

    // Prepare note with context
    let note = 'Customer added automatically from ticket system.';
    if (data.ticketId) {
      note += ` Created from Ticket #${data.ticketId}.`;
    }
    if (data.source) {
      note += ` Source: ${data.source}.`;
    }
    if (data.company) {
      note += ` Company: ${data.company}.`;
    }

    const customerData = {
      email: data.email.toLowerCase().trim(),
      firstName: firstName?.trim() || undefined,
      lastName: lastName?.trim() || undefined,
      phone: data.phone?.trim() || undefined,
      tags,
      note: note.trim()
    };

    console.log(`[CustomerAutoCreate] Prepared customer data:`, customerData);
    return customerData;
  }

  /**
   * Basic email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Check if automatic customer creation is enabled
   * This could be moved to a config file or environment variable
   */
  public isAutoCreateEnabled(): boolean {
    return process.env.SHOPIFY_AUTO_CREATE_CUSTOMERS !== 'false';
  }

  /**
   * Batch create customers (useful for migrating existing ticket data)
   */
  public async batchCreateCustomers(customers: CustomerCreateData[]): Promise<{
    success: number;
    failed: number;
    skipped: number;
    results: CustomerCreateResult[];
  }> {
    const results: CustomerCreateResult[] = [];
    let success = 0;
    let failed = 0;
    let skipped = 0;

    console.log(`[CustomerAutoCreate] Starting batch creation of ${customers.length} customers`);

    for (const customer of customers) {
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const result = await this.createCustomerFromTicket(customer);
      results.push(result);

      if (result.success) {
        success++;
      } else if (result.skipped) {
        skipped++;
      } else {
        failed++;
      }
    }

    console.log(`[CustomerAutoCreate] Batch creation completed: ${success} success, ${failed} failed, ${skipped} skipped`);
    
    return {
      success,
      failed,
      skipped,
      results
    };
  }
}

// Create and export a singleton instance
export const customerAutoCreateService = new CustomerAutoCreateService(); 