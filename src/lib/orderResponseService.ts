import { getOrderTrackingInfo, OrderTrackingInfo, ShipmentInfo } from './shipstationService';

// Regex patterns to detect common order ID formats
const ORDER_ID_PATTERNS = [
  /\b\d{3}-\d{7}-\d{7}\b/, // Amazon pattern (e.g., 113-9584588-3153007)
  /\b#?(\d{4,})\b/,        // Shopify/generic numeric IDs (e.g., #4487 or 4487)
  /\border\s*#?\s*(\d{4,})\b/i, // "Order #12345" or "order 12345"
  /\border\s*number\s*#?\s*(\d{4,})\b/i, // "Order number #12345"
];

// LTL Carrier information mapping
interface CarrierInfo {
  name: string;
  trackingUrl: string;
  estimatedDays: string;
  isLTL: boolean;
}

const CARRIER_INFO: Record<string, CarrierInfo> = {
  // LTL carriers
  'xpo': { 
    name: 'XPO Logistics', 
    trackingUrl: 'https://www.xpo.com/track/', 
    estimatedDays: '5-7 business days',
    isLTL: true
  },
  'rlc': { 
    name: 'RL Carriers', 
    trackingUrl: 'https://www2.rlcarriers.com/freight/shipping/shipment-tracing', 
    estimatedDays: '5-7 business days',
    isLTL: true
  },
  'saia': { 
    name: 'Saia', 
    trackingUrl: 'https://www.saia.com/track', 
    estimatedDays: '5-7 business days',
    isLTL: true
  },
  'sefl': { 
    name: 'Southeastern Freight Lines', 
    trackingUrl: 'https://www.sefl.com/Tracing/index.jsp', 
    estimatedDays: '5-7 business days',
    isLTL: true
  },
  'abf': { 
    name: 'ABF Freight', 
    trackingUrl: 'https://arcb.com/tools/tracking.html', 
    estimatedDays: '5-7 business days',
    isLTL: true
  },
  'central': { 
    name: 'Central Transport', 
    trackingUrl: 'https://www.centraltransport.com/tools/tracking.aspx', 
    estimatedDays: '5-7 business days',
    isLTL: true
  },
  
  // Regular carriers
  'usps': { 
    name: 'USPS', 
    trackingUrl: 'https://tools.usps.com/go/TrackConfirmAction', 
    estimatedDays: '3-5 business days',
    isLTL: false
  },
  'fedex': { 
    name: 'FedEx', 
    trackingUrl: 'https://www.fedex.com/apps/fedextrack/?action=track', 
    estimatedDays: '1-3 business days',
    isLTL: false
  },
  'ups': { 
    name: 'UPS', 
    trackingUrl: 'https://www.ups.com/track', 
    estimatedDays: '1-3 business days',
    isLTL: false
  },
  'dhl': { 
    name: 'DHL', 
    trackingUrl: 'https://www.dhl.com/us-en/home/tracking.html', 
    estimatedDays: '3-7 business days',
    isLTL: false
  }
};

// Default fallback for unknown carriers
const DEFAULT_CARRIER_INFO: CarrierInfo = {
  name: 'our shipping partner',
  trackingUrl: '',
  estimatedDays: '5-10 business days',
  isLTL: false
};

/**
 * Extract potential order IDs from text
 */
export function extractOrderIds(text: string): string[] {
  if (!text) return [];
  
  const orderIds: string[] = [];
  
  // Try each pattern
  ORDER_ID_PATTERNS.forEach(pattern => {
    const matches = text.match(new RegExp(pattern, 'g'));
    if (matches) {
      matches.forEach(match => {
        // Clean up the match by removing any non-alphanumeric characters except dashes
        const cleanedMatch = match.replace(/[^a-zA-Z0-9\-]/g, '');
        if (cleanedMatch && !orderIds.includes(cleanedMatch)) {
          orderIds.push(cleanedMatch);
        }
      });
    }
  });
  
  return orderIds;
}

/**
 * Check if the ticket/message text is asking about order status
 */
export function isOrderStatusInquiry(text: string): boolean {
  if (!text) return false;
  
  const lowercaseText = text.toLowerCase();
  const statusKeywords = [
    'status of my order', 'order status', 
    'where is my order', 'when will my order', 
    'has my order shipped', 'track my order',
    'tracking information', 'shipping status',
    'my package', 'my shipment', 'delivery status',
    // Add more flexible patterns
    'about order', 'regarding order', 'order update',
    'shipped', 'delivery', 'tracking'
  ];
  
  // Check if any status keywords are present
  const hasStatusKeyword = statusKeywords.some(keyword => 
    lowercaseText.includes(keyword));
  
  // Check if any order ID patterns are present
  const hasOrderId = ORDER_ID_PATTERNS.some(pattern => 
    pattern.test(lowercaseText));
  
  // More flexible logic: if there's an order ID and ANY indication of inquiry about status/shipping
  if (hasOrderId) {
    // If we have an order ID, look for ANY status-related terms or just general inquiry patterns
    const hasAnyStatusTerm = hasStatusKeyword || 
      lowercaseText.includes('update') ||
      lowercaseText.includes('status') ||
      lowercaseText.includes('when') ||
      lowercaseText.includes('where') ||
      lowercaseText.includes('shipped') ||
      lowercaseText.includes('delivery') ||
      lowercaseText.includes('track') ||
      lowercaseText.includes('received') ||
      lowercaseText.includes('arrive') ||
      // Even simple inquiry patterns
      lowercaseText.includes('about') ||
      lowercaseText.includes('regarding') ||
      lowercaseText.includes('concerning');
    
    if (hasAnyStatusTerm) return true;
  }
  
  // Original strict conditions for explicit status questions
  return (hasStatusKeyword && hasOrderId) || 
         lowercaseText.includes('status of order') ||
         lowercaseText.includes('where is order');
}

/**
 * Get carrier information based on carrier code
 */
export function getCarrierInfo(carrierCode: string): CarrierInfo {
  if (!carrierCode) return DEFAULT_CARRIER_INFO;
  
  // Normalize carrier code by converting to lowercase and removing spaces
  const normalizedCode = carrierCode.toLowerCase().replace(/\s+/g, '');
  
  // Check for each known carrier
  for (const [code, info] of Object.entries(CARRIER_INFO)) {
    if (normalizedCode.includes(code)) {
      return info;
    }
  }
  
  return DEFAULT_CARRIER_INFO;
}

/**
 * Generate a tracking link based on carrier and tracking number
 */
export function generateTrackingLink(carrierInfo: CarrierInfo, trackingNumber: string): string {
  if (!trackingNumber || !carrierInfo.trackingUrl) {
    return '';
  }
  
  // Different carriers have different URL formats
  if (carrierInfo.name === 'USPS') {
    return `${carrierInfo.trackingUrl}?tLabels=${trackingNumber}`;
  } else if (carrierInfo.name === 'FedEx') {
    return `${carrierInfo.trackingUrl}&tracknumbers=${trackingNumber}`;
  } else if (carrierInfo.name === 'UPS') {
    return `${carrierInfo.trackingUrl}?tracknum=${trackingNumber}`;
  } else if (carrierInfo.name === 'DHL') {
    return `${carrierInfo.trackingUrl}?tracking-id=${trackingNumber}`;
  } else if (carrierInfo.isLTL) {
    // For LTL carriers, just return the base URL as most require form submission
    return carrierInfo.trackingUrl;
  }
  
  // Generic fallback - append tracking number to URL
  return `${carrierInfo.trackingUrl}?tracking=${trackingNumber}`;
}

/**
 * Generate an appropriate response for a shipped order
 */
export function generateShippedOrderResponse(
  customerName: string,
  orderNumber: string,
  orderInfo: OrderTrackingInfo
): string {
  console.log(`OrderResponseService DEBUG: generateShippedOrderResponse called`, {
    customerName,
    orderNumber,
    orderFound: orderInfo.found,
    hasShipments: !!(orderInfo.shipments && orderInfo.shipments.length > 0),
    shipmentsCount: orderInfo.shipments?.length || 0,
    orderStatus: orderInfo.orderStatus
  });
  
  if (!orderInfo.found || !orderInfo.shipments || orderInfo.shipments.length === 0) {
    console.log(`OrderResponseService DEBUG: Returning empty string - missing data`);
    return '';
  }
  
  // Get the most recent shipment
  const shipment = orderInfo.shipments[0];
  const carrierInfo = getCarrierInfo(shipment.carrier);
  const trackingLink = generateTrackingLink(carrierInfo, shipment.trackingNumber);
  
  console.log(`OrderResponseService DEBUG: Shipment details`, {
    carrier: shipment.carrier,
    trackingNumber: shipment.trackingNumber,
    shipDate: shipment.shipDate,
    carrierName: carrierInfo.name,
    trackingLink: trackingLink
  });
  
  // Format the ship date
  const shipDate = new Date(shipment.shipDate);
  const formattedShipDate = shipDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  // Construct the response based on carrier type
  let response = '';
  
  if (carrierInfo.isLTL) {
    // LTL shipment response
    response += `Thank you for your inquiry about order #${orderNumber}. I'm pleased to confirm that your order has shipped via ${carrierInfo.name} LTL Freight on ${formattedShipDate}.\n\n`;
    response += `Your shipment has been assigned PRO/tracking number: **${shipment.trackingNumber}**\n\n`;
    response += `LTL shipments typically take ${carrierInfo.estimatedDays}. You can track your shipment status at:\n${carrierInfo.trackingUrl}\n\n`;
    response += `For this carrier, you'll need to enter your PRO number (${shipment.trackingNumber}) on their website to see the current status.\n\n`;
  } else {
    // Regular shipment response
    response += `Thank you for your inquiry about order #${orderNumber}. I'm pleased to confirm that your order has shipped via ${carrierInfo.name} on ${formattedShipDate}.\n\n`;
    response += `Your tracking number is: **${shipment.trackingNumber}**\n\n`;
    
    if (trackingLink) {
      response += `You can track your package at:\n${trackingLink}\n\n`;
    }
    
    response += `Standard ${carrierInfo.name} shipments typically arrive within ${carrierInfo.estimatedDays} from the ship date.\n\n`;
  }
  
  response += `If you have any questions about your shipment or if there's anything else I can assist you with, please don't hesitate to ask.`;
  
  console.log(`OrderResponseService DEBUG: Generated response (length: ${response.length}):`, response.substring(0, 100));
  return response;
}

/**
 * Generate a processing/unshipped order response
 */
export function generateProcessingOrderResponse(
  customerName: string,
  orderNumber: string,
  orderInfo: OrderTrackingInfo
): string {
  let response = '';
  
  // Different responses based on order status
  if (orderInfo.orderStatus === 'awaiting_payment') {
    response += `Thank you for your inquiry about order #${orderNumber}. Our records show this order is currently awaiting payment confirmation.\n\n`;
    response += `Once payment is confirmed, your order will move to our processing queue. If you've recently completed payment, please allow 24-48 hours for our systems to update.\n\n`;
  } else if (orderInfo.orderStatus === 'awaiting_shipment' || orderInfo.orderStatus === 'on_hold') {
    response += `Thank you for your inquiry about order #${orderNumber}. Your order is currently in our processing queue${orderInfo.orderStatus === 'on_hold' ? ' (on hold)' : ''}.\n\n`;
    
    if (orderInfo.orderDate) {
      const orderDate = new Date(orderInfo.orderDate);
      const formattedOrderDate = orderDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
      response += `Your order was placed on ${formattedOrderDate} and is being prepared for shipment.\n\n`;
    }
    
    response += `Standard processing typically takes 1-3 business days. Once your order ships, you'll receive a confirmation email with tracking information.\n\n`;
  } else {
    // Generic response for other statuses
    response += `Thank you for your inquiry about order #${orderNumber}. Our records show this order is currently being processed.\n\n`;
    response += `You'll receive a shipping confirmation email with tracking details as soon as your order leaves our facility.\n\n`;
  }
  
  response += `If you have any questions or concerns, please don't hesitate to let me know.`;
  
  return response;
}

/**
 * Removes greeting lines from a response to avoid duplication with email template
 */
function removeGreeting(response: string): string {
  // Remove "Hi {customerName}," or other common greeting patterns
  return response.replace(/^Hi .*?,\s*\n+/i, '')
                .replace(/^Hello .*?,\s*\n+/i, '')
                .replace(/^Dear .*?,\s*\n+/i, '');
}

/**
 * Check for order status and generate an automated response if applicable
 * Returns the response text or null if no automated response is appropriate
 */
export async function checkOrderAndGenerateResponse(
  customerName: string,
  subject: string,
  body: string
): Promise<{ responseText: string | null; orderFound: boolean; orderNumber?: string }> {
  // Check if this is an order status inquiry
  if (!isOrderStatusInquiry(subject + ' ' + body)) {
    return { responseText: null, orderFound: false };
  }
  
  // Extract potential order IDs from the ticket
  const combinedText = subject + ' ' + body;
  const orderIds = extractOrderIds(combinedText);
  
  if (orderIds.length === 0) {
    console.log('OrderResponseService: No order IDs found in the text');
    return { responseText: null, orderFound: false };
  }
  
  console.log(`OrderResponseService: Found ${orderIds.length} potential order IDs: ${orderIds.join(', ')}`);
  
  // Check each order ID with ShipStation until we find a match
  for (const orderId of orderIds) {
    console.log(`OrderResponseService: Checking order ID ${orderId} with ShipStation`);
    const orderInfo = await getOrderTrackingInfo(orderId);
    
    if (orderInfo && orderInfo.found) {
      console.log(`OrderResponseService: Found order ${orderId} with status ${orderInfo.orderStatus}`);
      
      let responseText: string | null = null;
      
      // Generate response based on order status
      if (orderInfo.orderStatus === 'shipped' && orderInfo.shipments && orderInfo.shipments.length > 0) {
        // Order has shipped - generate shipped response
        responseText = generateShippedOrderResponse(customerName, orderId, orderInfo);
      } else if (orderInfo.orderStatus) {
        // Order exists but hasn't shipped - generate processing response
        responseText = generateProcessingOrderResponse(customerName, orderId, orderInfo);
      }
      
      // Remove greeting to avoid duplication with email template
      if (responseText) {
        responseText = removeGreeting(responseText);
      }
      
      return { 
        responseText, 
        orderFound: true,
        orderNumber: orderId
      };
    }
  }
  
  // No valid orders found
  console.log('OrderResponseService: No valid orders found in ShipStation');
  return { responseText: null, orderFound: false };
} 