import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db, orderItems, orders, qboCustomerSnapshots, qboEstimates, qboInvoices, shipstationShipments, shipments } from '@/lib/db';
import type { RagIdentifiers } from './ragIntent';
import type { RagIntent, RagTruthResult, ViewerScope } from './ragTypes';

function normalizeToken(value: string): string {
  return value.trim();
}

function buildCustomerScopeCondition(scope: ViewerScope, column: any) {
  if (scope.isAdmin || scope.isManager) return sql`TRUE`;
  if (!scope.allowedCustomerIds.length) return sql`FALSE`;
  return inArray(column, scope.allowedCustomerIds);
}

function applyCustomerFilter(scopeCondition: any, column: any, customerId?: number | null) {
  if (!customerId) return scopeCondition;
  return and(scopeCondition, eq(column, customerId));
}

export async function structuredLookup(params: {
  identifiers: RagIdentifiers;
  intent: RagIntent;
  scope: ViewerScope;
  customerId?: number | null;
}): Promise<RagTruthResult[]> {
  const { identifiers, intent, scope, customerId } = params;
  const results: RagTruthResult[] = [];
  const hasIdentifiers =
    identifiers.orderNumbers.length > 0 ||
    identifiers.invoiceNumbers.length > 0 ||
    identifiers.trackingNumbers.length > 0 ||
    identifiers.skus.length > 0 ||
    identifiers.poNumbers.length > 0;

  const orderScope = applyCustomerFilter(buildCustomerScopeCondition(scope, orders.customerId), orders.customerId, customerId);
  const invoiceScope = applyCustomerFilter(buildCustomerScopeCondition(scope, qboInvoices.customerId), qboInvoices.customerId, customerId);
  const estimateScope = applyCustomerFilter(buildCustomerScopeCondition(scope, qboEstimates.customerId), qboEstimates.customerId, customerId);
  const shipmentScope = applyCustomerFilter(buildCustomerScopeCondition(scope, shipstationShipments.customerId), shipstationShipments.customerId, customerId);
  const unifiedShipmentScope = applyCustomerFilter(buildCustomerScopeCondition(scope, shipments.customerId), shipments.customerId, customerId);

  if (identifiers.orderNumbers.length) {
    const orderConditions = identifiers.orderNumbers.flatMap((value) => [
      ilike(orders.orderNumber, normalizeToken(value)),
      ilike(orders.externalId, normalizeToken(value)),
    ]);
    const rows = await db.query.orders.findMany({
      where: and(orderScope, or(...orderConditions)),
      with: { items: true },
      limit: 10,
    });

    rows.forEach((order) => {
      const label = order.orderNumber || order.externalId || String(order.id);
      results.push({
        type: 'order',
        label: `Order ${label}`,
        sourceUri: order.customerId ? `/customers/${order.customerId}` : null,
        snippet: `Order ${label}: status ${order.status}, financial ${order.financialStatus}, total ${order.currency} ${order.total}.`,
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          provider: order.provider,
          status: order.status,
          financialStatus: order.financialStatus,
          currency: order.currency,
          total: order.total,
          placedAt: order.placedAt,
          paidAt: order.paidAt,
          items: order.items?.map((item) => ({ sku: item.sku, title: item.title, quantity: item.quantity })) || [],
        },
        score: { finalScore: 1 },
      });
    });

    const shipmentConditions = identifiers.orderNumbers.map((value) => ilike(shipstationShipments.orderNumber, normalizeToken(value)));
    const ssShipments = await db.query.shipstationShipments.findMany({
      where: and(shipmentScope, or(...shipmentConditions)),
      limit: 10,
    });

    ssShipments.forEach((shipment) => {
      const label = shipment.orderNumber || String(shipment.shipstationShipmentId);
      results.push({
        type: 'shipment',
        label: `Shipment ${label}`,
        sourceUri: shipment.customerId ? `/customers/${shipment.customerId}` : null,
        snippet: `Shipment ${label}: tracking ${shipment.trackingNumber || '—'}, status ${shipment.status || 'unknown'}.`,
        data: {
          shipmentId: shipment.shipstationShipmentId,
          orderNumber: shipment.orderNumber,
          trackingNumber: shipment.trackingNumber,
          carrierCode: shipment.carrierCode,
          serviceCode: shipment.serviceCode,
          shipDate: shipment.shipDate,
          deliveryDate: shipment.deliveryDate,
          status: shipment.status,
        },
        score: { finalScore: 1 },
      });
    });

    // Also query unified shipments table (includes Amazon FBA, etc.)
    const unifiedShipmentConditions = identifiers.orderNumbers.map((value) => ilike(shipments.orderNumber, normalizeToken(value)));
    const unifiedShipmentsRows = await db.query.shipments.findMany({
      where: and(unifiedShipmentScope, or(...unifiedShipmentConditions)),
      limit: 10,
    });

    unifiedShipmentsRows.forEach((shipment) => {
      const label = shipment.orderNumber || shipment.externalId || String(shipment.id);
      results.push({
        type: 'shipment',
        label: `Shipment ${label} (${shipment.provider})`,
        sourceUri: shipment.customerId ? `/customers/${shipment.customerId}` : null,
        snippet: `Shipment ${label}: provider ${shipment.provider}, tracking ${shipment.trackingNumber || '—'}, status ${shipment.status || 'unknown'}.`,
        data: {
          shipmentId: shipment.id,
          externalId: shipment.externalId,
          provider: shipment.provider,
          orderNumber: shipment.orderNumber,
          trackingNumber: shipment.trackingNumber,
          carrierCode: shipment.carrierCode,
          serviceCode: shipment.serviceCode,
          shipDate: shipment.shipDate,
          estimatedDeliveryDate: shipment.estimatedDeliveryDate,
          actualDeliveryDate: shipment.actualDeliveryDate,
          status: shipment.status,
        },
        score: { finalScore: 1 },
      });
    });
  }

  if (identifiers.invoiceNumbers.length) {
    const invoiceConditions = identifiers.invoiceNumbers.flatMap((value) => [
      ilike(qboInvoices.docNumber, normalizeToken(value)),
      ilike(qboInvoices.qboInvoiceId, normalizeToken(value)),
    ]);
    const rows = await db.query.qboInvoices.findMany({
      where: and(invoiceScope, or(...invoiceConditions)),
      limit: 10,
    });

    rows.forEach((invoice) => {
      const label = invoice.docNumber || invoice.qboInvoiceId;
      results.push({
        type: 'invoice',
        label: `Invoice ${label}`,
        sourceUri: invoice.customerId ? `/customers/${invoice.customerId}` : null,
        snippet: `Invoice ${label}: balance ${invoice.currency} ${invoice.balance}, total ${invoice.currency} ${invoice.totalAmount}.`,
        data: {
          qboInvoiceId: invoice.qboInvoiceId,
          invoiceNumber: invoice.docNumber,
          status: invoice.status,
          balance: invoice.balance,
          total: invoice.totalAmount,
          currency: invoice.currency,
          dueDate: invoice.dueDate,
        },
        score: { finalScore: 1 },
      });
    });
  }

  if (identifiers.poNumbers.length) {
    const estimateConditions = identifiers.poNumbers.flatMap((value) => [
      ilike(qboEstimates.docNumber, normalizeToken(value)),
      ilike(qboEstimates.qboEstimateId, normalizeToken(value)),
    ]);
    const rows = await db.query.qboEstimates.findMany({
      where: and(estimateScope, or(...estimateConditions)),
      limit: 10,
    });

    rows.forEach((estimate) => {
      const label = estimate.docNumber || estimate.qboEstimateId;
      results.push({
        type: 'estimate',
        label: `Estimate ${label}`,
        sourceUri: estimate.customerId ? `/customers/${estimate.customerId}` : null,
        snippet: `Estimate ${label}: total ${estimate.currency} ${estimate.totalAmount}, status ${estimate.status || 'unknown'}.`,
        data: {
          qboEstimateId: estimate.qboEstimateId,
          estimateNumber: estimate.docNumber,
          status: estimate.status,
          total: estimate.totalAmount,
          currency: estimate.currency,
          expirationDate: estimate.expirationDate,
        },
        score: { finalScore: 1 },
      });
    });
  }

  if (identifiers.trackingNumbers.length) {
    // Query legacy ShipStation shipments table
    const trackingConditions = identifiers.trackingNumbers.map((value) => ilike(shipstationShipments.trackingNumber, normalizeToken(value)));
    const ssTrackingRows = await db.query.shipstationShipments.findMany({
      where: and(shipmentScope, or(...trackingConditions)),
      limit: 10,
    });

    ssTrackingRows.forEach((shipment) => {
      const label = shipment.orderNumber || String(shipment.shipstationShipmentId);
      results.push({
        type: 'shipment',
        label: `Shipment ${label}`,
        sourceUri: shipment.customerId ? `/customers/${shipment.customerId}` : null,
        snippet: `Shipment ${label}: tracking ${shipment.trackingNumber || '—'}, status ${shipment.status || 'unknown'}.`,
        data: {
          shipmentId: shipment.shipstationShipmentId,
          orderNumber: shipment.orderNumber,
          trackingNumber: shipment.trackingNumber,
          carrierCode: shipment.carrierCode,
          serviceCode: shipment.serviceCode,
          shipDate: shipment.shipDate,
          deliveryDate: shipment.deliveryDate,
          status: shipment.status,
        },
        score: { finalScore: 1 },
      });
    });

    // Query unified shipments table (includes Amazon FBA, etc.)
    const unifiedTrackingConditions = identifiers.trackingNumbers.map((value) => ilike(shipments.trackingNumber, normalizeToken(value)));
    const unifiedTrackingRows = await db.query.shipments.findMany({
      where: and(unifiedShipmentScope, or(...unifiedTrackingConditions)),
      limit: 10,
    });

    unifiedTrackingRows.forEach((shipment) => {
      const label = shipment.orderNumber || shipment.externalId || String(shipment.id);
      results.push({
        type: 'shipment',
        label: `Shipment ${label} (${shipment.provider})`,
        sourceUri: shipment.customerId ? `/customers/${shipment.customerId}` : null,
        snippet: `Shipment ${label}: provider ${shipment.provider}, tracking ${shipment.trackingNumber || '—'}, status ${shipment.status || 'unknown'}.`,
        data: {
          shipmentId: shipment.id,
          externalId: shipment.externalId,
          provider: shipment.provider,
          orderNumber: shipment.orderNumber,
          trackingNumber: shipment.trackingNumber,
          carrierCode: shipment.carrierCode,
          serviceCode: shipment.serviceCode,
          shipDate: shipment.shipDate,
          estimatedDeliveryDate: shipment.estimatedDeliveryDate,
          actualDeliveryDate: shipment.actualDeliveryDate,
          status: shipment.status,
        },
        score: { finalScore: 1 },
      });
    });
  }

  if (identifiers.skus.length) {
    const skuRows = await db.select({
      orderId: orderItems.orderId,
      sku: orderItems.sku,
      title: orderItems.title,
    })
      .from(orderItems)
      .where(inArray(orderItems.sku, identifiers.skus));

    const orderIds = Array.from(new Set(skuRows.map((row) => row.orderId)));
    if (orderIds.length) {
      const orderRows = await db.query.orders.findMany({
        where: and(orderScope, inArray(orders.id, orderIds)),
        limit: 10,
      });
      orderRows.forEach((order) => {
        const label = order.orderNumber || order.externalId || String(order.id);
        results.push({
          type: 'order',
          label: `Order ${label}`,
          sourceUri: order.customerId ? `/customers/${order.customerId}` : null,
          snippet: `Order ${label}: status ${order.status}, financial ${order.financialStatus}, total ${order.currency} ${order.total}.`,
          data: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            provider: order.provider,
            status: order.status,
            financialStatus: order.financialStatus,
            currency: order.currency,
            total: order.total,
            matchedSkus: identifiers.skus,
          },
          score: { finalScore: 1 },
        });
      });
    }
  }

  if (intent === 'payments_terms' && customerId) {
    const snapshot = await db.query.qboCustomerSnapshots.findFirst({
      where: eq(qboCustomerSnapshots.customerId, customerId),
    });
    if (snapshot && (scope.isAdmin || scope.isManager || scope.allowedCustomerIds.includes(customerId))) {
      results.push({
        type: 'qbo_customer',
        label: 'Customer AR Snapshot',
        sourceUri: `/customers/${customerId}`,
        snippet: `Customer balance ${snapshot.currency} ${snapshot.balance}, terms ${snapshot.terms || '—'}.`,
        data: {
          balance: snapshot.balance,
          currency: snapshot.currency,
          terms: snapshot.terms,
          lastInvoiceDate: snapshot.lastInvoiceDate,
          lastPaymentDate: snapshot.lastPaymentDate,
        },
        score: { finalScore: 1 },
      });
    }
  }

  if (!hasIdentifiers && customerId) {
    if (intent === 'logistics_shipping' && results.length === 0) {
      const recentOrders = await db.query.orders.findMany({
        where: orderScope,
        orderBy: desc(orders.updatedAt),
        with: { items: true },
        limit: 3,
      });

      recentOrders.forEach((order) => {
        const label = order.orderNumber || order.externalId || String(order.id);
        results.push({
          type: 'order',
          label: `Order ${label}`,
          sourceUri: order.customerId ? `/customers/${order.customerId}` : null,
          snippet: `Order ${label}: status ${order.status}, financial ${order.financialStatus}, total ${order.currency} ${order.total}.`,
          data: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            provider: order.provider,
            status: order.status,
            financialStatus: order.financialStatus,
            currency: order.currency,
            total: order.total,
            placedAt: order.placedAt,
            items: order.items?.map((item) => ({ sku: item.sku, title: item.title, quantity: item.quantity })) || [],
          },
          score: { finalScore: 0.9 },
        });
      });

      const recentShipments = await db.query.shipstationShipments.findMany({
        where: shipmentScope,
        orderBy: desc(shipstationShipments.shipDate),
        limit: 3,
      });

      recentShipments.forEach((shipment) => {
        const label = shipment.orderNumber || String(shipment.shipstationShipmentId);
        results.push({
          type: 'shipment',
          label: `Shipment ${label}`,
          sourceUri: shipment.customerId ? `/customers/${shipment.customerId}` : null,
          snippet: `Shipment ${label}: tracking ${shipment.trackingNumber || '—'}, status ${shipment.status || 'unknown'}.`,
          data: {
            shipmentId: shipment.shipstationShipmentId,
            orderNumber: shipment.orderNumber,
            trackingNumber: shipment.trackingNumber,
            carrierCode: shipment.carrierCode,
            serviceCode: shipment.serviceCode,
            shipDate: shipment.shipDate,
            deliveryDate: shipment.deliveryDate,
            status: shipment.status,
          },
          score: { finalScore: 0.9 },
        });
      });

      // Also fetch from unified shipments (includes Amazon FBA, etc.)
      const recentUnifiedShipments = await db.query.shipments.findMany({
        where: unifiedShipmentScope,
        orderBy: desc(shipments.shipDate),
        limit: 3,
      });

      recentUnifiedShipments.forEach((shipment) => {
        const label = shipment.orderNumber || shipment.externalId || String(shipment.id);
        results.push({
          type: 'shipment',
          label: `Shipment ${label} (${shipment.provider})`,
          sourceUri: shipment.customerId ? `/customers/${shipment.customerId}` : null,
          snippet: `Shipment ${label}: provider ${shipment.provider}, tracking ${shipment.trackingNumber || '—'}, status ${shipment.status || 'unknown'}.`,
          data: {
            shipmentId: shipment.id,
            externalId: shipment.externalId,
            provider: shipment.provider,
            orderNumber: shipment.orderNumber,
            trackingNumber: shipment.trackingNumber,
            carrierCode: shipment.carrierCode,
            serviceCode: shipment.serviceCode,
            shipDate: shipment.shipDate,
            estimatedDeliveryDate: shipment.estimatedDeliveryDate,
            actualDeliveryDate: shipment.actualDeliveryDate,
            status: shipment.status,
          },
          score: { finalScore: 0.9 },
        });
      });
    }

    if (intent === 'payments_terms') {
      const recentInvoices = await db.query.qboInvoices.findMany({
        where: invoiceScope,
        orderBy: desc(qboInvoices.updatedAt),
        limit: 5,
      });

      recentInvoices.forEach((invoice) => {
        const label = invoice.docNumber || invoice.qboInvoiceId;
        results.push({
          type: 'invoice',
          label: `Invoice ${label}`,
          sourceUri: invoice.customerId ? `/customers/${invoice.customerId}` : null,
          snippet: `Invoice ${label}: balance ${invoice.currency} ${invoice.balance}, total ${invoice.currency} ${invoice.totalAmount}.`,
          data: {
            qboInvoiceId: invoice.qboInvoiceId,
            invoiceNumber: invoice.docNumber,
            status: invoice.status,
            balance: invoice.balance,
            total: invoice.totalAmount,
            currency: invoice.currency,
            dueDate: invoice.dueDate,
          },
          score: { finalScore: 0.9 },
        });
      });

      const recentEstimates = await db.query.qboEstimates.findMany({
        where: estimateScope,
        orderBy: desc(qboEstimates.updatedAt),
        limit: 5,
      });

      recentEstimates.forEach((estimate) => {
        const label = estimate.docNumber || estimate.qboEstimateId;
        results.push({
          type: 'estimate',
          label: `Estimate ${label}`,
          sourceUri: estimate.customerId ? `/customers/${estimate.customerId}` : null,
          snippet: `Estimate ${label}: total ${estimate.currency} ${estimate.totalAmount}, status ${estimate.status || 'unknown'}.`,
          data: {
            qboEstimateId: estimate.qboEstimateId,
            estimateNumber: estimate.docNumber,
            status: estimate.status,
            total: estimate.totalAmount,
            currency: estimate.currency,
            expirationDate: estimate.expirationDate,
          },
          score: { finalScore: 0.9 },
        });
      });
    }
  }

  return results;
}
