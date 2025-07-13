import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { 
  searchShipStationCustomerByEmail, 
  searchShipStationCustomerByName,
  convertShipStationToShopifyFormat,
  type ShipStationCustomerInfo
} from '@/lib/shipstationCustomerService';

export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const url = new URL(req.url);
    const searchQuery = url.searchParams.get('query');
    const searchType = url.searchParams.get('type') || 'auto'; // auto, email, name, phone

    if (!searchQuery || searchQuery.trim().length < 3) {
      return NextResponse.json({ error: 'Query must be at least 3 characters' }, { status: 400 });
    }

    const query = searchQuery.trim();
    console.log(`[ShipStation Customer Search] Searching for "${query}" with type "${searchType}"`);

    let shipStationCustomers: ShipStationCustomerInfo[] = [];
    let searchMethod = 'not_found';

    // Determine search type
    const finalSearchType = searchType === 'auto' ? detectSearchType(query) : searchType;

    try {
      if (finalSearchType === 'email') {
        console.log(`[ShipStation Customer Search] Searching by email: ${query}`);
        const customer = await searchShipStationCustomerByEmail(query);
        if (customer) {
          shipStationCustomers = [customer];
          searchMethod = 'email_found';
        }
      } else if (finalSearchType === 'name') {
        console.log(`[ShipStation Customer Search] Searching by name: ${query}`);
        const customers = await searchShipStationCustomerByName(query);
        if (customers.length > 0) {
          shipStationCustomers = customers;
          searchMethod = 'name_found';
        }
      } else {
        // For phone or unknown types, try both email and name search
        console.log(`[ShipStation Customer Search] Trying multiple search methods for: ${query}`);
        
        // First try as email if it contains @
        if (query.includes('@')) {
          const customer = await searchShipStationCustomerByEmail(query);
          if (customer) {
            shipStationCustomers = [customer];
            searchMethod = 'email_found';
          }
        }
        
        // If no results from email, try name search
        if (shipStationCustomers.length === 0) {
          const customers = await searchShipStationCustomerByName(query);
          if (customers.length > 0) {
            shipStationCustomers = customers;
            searchMethod = 'name_found';
          }
        }
      }

      // Convert to Shopify-compatible format
      const convertedCustomers = shipStationCustomers.map(convertShipStationToShopifyFormat);

      console.log(`[ShipStation Customer Search] Found ${convertedCustomers.length} customers using method: ${searchMethod}`);

      return NextResponse.json({
        customers: convertedCustomers,
        searchMethod,
        searchType: finalSearchType,
        query: query,
        source: 'shipstation',
        message: convertedCustomers.length > 0 
          ? `Found ${convertedCustomers.length} customer(s) in ShipStation` 
          : 'No customers found in ShipStation',
        limitation: shipStationCustomers.length === 0 
          ? 'Customer not found in ShipStation. They may not have placed any orders through this system.'
          : undefined
      });

    } catch (error: any) {
      console.error('[ShipStation Customer Search] Search error:', error);
      return NextResponse.json({
        customers: [],
        searchMethod: 'error',
        searchType: finalSearchType,
        query: query,
        source: 'shipstation',
        error: 'Failed to search ShipStation',
        message: 'Unable to search ShipStation at this time'
      });
    }

  } catch (error: any) {
    console.error('[ShipStation Customer Search] General error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to search ShipStation customers' },
      { status: 500 }
    );
  }
}

/**
 * Detect the type of search based on the query
 */
function detectSearchType(query: string): string {
  const cleanQuery = query.trim();
  
  // Email pattern
  if (/@/.test(cleanQuery)) {
    return 'email';
  }
  
  // Phone number patterns
  const digitCount = (cleanQuery.match(/\d/g) || []).length;
  if (digitCount >= 10 && /[\d\s\-\(\)\.]{8,}/.test(cleanQuery) && !/[a-zA-Z]/.test(cleanQuery)) {
    return 'phone';
  }
  
  // Default to name search
  return 'name';
} 