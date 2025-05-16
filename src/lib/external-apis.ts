export async function formatShopifyOrderForLLM(
    order: ShopifyOrder
): Promise<{ text: string; metadata: Record<string, any> }> {
    console.log(`[FORMAT_SHOPIFY_ORDER] Formatting Shopify Order Name: ${order.name} (ID: ${order.id})`);
    
    let text = `# Shopify Order ${order.name} (ID: ${order.id})\n\n`;
    text += `Order Number: ${order.order_number}\n`;
    text += `Created At: ${new Date(order.created_at).toLocaleString()}\n`;
    if (order.processed_at) {
        text += `Processed At: ${new Date(order.processed_at).toLocaleString()}\n`;
    }
    text += `Financial Status: ${order.financial_status || 'N/A'}\n`;
    text += `Fulfillment Status: ${order.fulfillment_status || 'N/A'}\n`;
    text += `Currency: ${order.currency}\n`;
    text += `Total Price: ${order.current_total_price || '0.00'}\n`;
    if (order.subtotal_price) text += `Subtotal Price: ${order.subtotal_price}\n`;
    if (order.total_tax) text += `Total Tax: ${order.total_tax}\n`;
    if (order.total_discounts) text += `Total Discounts: ${order.total_discounts}\n`;
    if (order.total_shipping_price_set?.shop_money?.amount) {
        text += `Total Shipping: ${order.total_shipping_price_set.shop_money.amount}\n`;
    }

    if (order.customer?.id) {
        text += `\n## Customer Information\n`;
        text += `Customer ID: ${order.customer.id}\n`;
        if (order.email) text += `Email: ${order.email}\n`;
        if (order.phone) text += `Phone: ${order.phone}\n`;
    }

    const formatAddress = (addr: any, type: string) => {
        if (!addr) return '';
        let addrText = `\n## ${type} Address\n`;
        if (addr.name) addrText += `${addr.name}\n`;
        else if (addr.first_name || addr.last_name) addrText += `${addr.first_name || ''} ${addr.last_name || ''}\n`.trimStart();
        if (addr.company) addrText += `${addr.company}\n`;
        if (addr.address1) addrText += `${addr.address1}\n`;
        if (addr.address2) addrText += `${addr.address2}\n`;
        if (addr.city) addrText += `${addr.city}, `;
        if (addr.province_code || addr.province) addrText += `${addr.province_code || addr.province} `;
        if (addr.zip) addrText += `${addr.zip}\n`;
        else if (addr.city || addr.province_code || addr.province) addrText += `\n`;
        if (addr.country_code || addr.country) addrText += `${addr.country_code || addr.country}\n`;
        if (addr.phone) addrText += `Phone: ${addr.phone}\n`;
        return addrText;
    };

    if (order.shipping_address) {
        text += formatAddress(order.shipping_address, "Shipping");
    }
    if (order.billing_address && JSON.stringify(order.billing_address) !== JSON.stringify(order.shipping_address)) {
        text += formatAddress(order.billing_address, "Billing");
    }

    if (order.line_items && order.line_items.length > 0) {
        text += "\n## Line Items\n";
        order.line_items.forEach((item, index) => {
            text += `${index + 1}. ${item.title || item.name || 'Unnamed Item'}\n`;
            text += `   - SKU: ${item.sku || 'N/A'}\n`;
            text += `   - Quantity: ${item.quantity}\n`;
            text += `   - Price: ${item.price}\n`;
            if (item.total_discount) text += `   - Total Discount: ${item.total_discount}\n`;
            if (item.variant_title) text += `   - Variant: ${item.variant_title}\n`;
            text += "\n";
        });
    }

    if (order.note) {
        text += `\n## Order Note\n${order.note}\n`;
    }
    if (order.tags) {
        text += `\n## Tags\n${order.tags}\n`;
    }

    const metadata = {
        shopifyOrderId: String(order.id),
        orderName: order.name,
        orderNumber: String(order.order_number),
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        totalPrice: order.current_total_price,
        currency: order.currency,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        customerEmail: order.email,
        itemCount: order.line_items?.length ?? 0,
        tags: order.tags,
    };
    console.log(`[FORMAT_SHOPIFY_ORDER] ✅ Successfully formatted Shopify Order ${order.name}`);
    return { text, metadata };
} 