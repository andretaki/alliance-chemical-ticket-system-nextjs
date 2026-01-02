'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/layout/EmptyState';
import { Package, ShoppingCart, Store, Truck, ChevronDown, ChevronRight, Ship } from 'lucide-react';
import type { Order } from '@/lib/contracts';

interface UnifiedOrdersPanelProps {
  orders: Order[];
}

const providerConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  shopify: { icon: Store, label: 'Shopify', color: 'text-green-600 dark:text-green-400' },
  amazon: { icon: Package, label: 'Amazon', color: 'text-orange-600 dark:text-orange-400' },
  amazon_fba: { icon: Ship, label: 'Amazon FBA', color: 'text-orange-500 dark:text-orange-300' },
  qbo: { icon: ShoppingCart, label: 'QuickBooks', color: 'text-blue-600 dark:text-blue-400' },
  shipstation: { icon: Truck, label: 'ShipStation', color: 'text-purple-600 dark:text-purple-400' },
  klaviyo: { icon: ShoppingCart, label: 'Klaviyo', color: 'text-pink-600 dark:text-pink-400' },
  self_reported: { icon: Package, label: 'Self-Reported', color: 'text-teal-600 dark:text-teal-400' },
  manual: { icon: Package, label: 'Manual', color: 'text-gray-600 dark:text-gray-400' },
};

function formatCurrency(value: string | null, currency?: string | null) {
  if (!value) return '$0.00';
  const num = parseFloat(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(num);
}

function formatDate(date: string | null) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getStatusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'fulfilled':
    case 'paid':
      return 'success';
    case 'partial':
    case 'partially_paid':
      return 'warning';
    case 'cancelled':
    case 'void':
      return 'danger';
    default:
      return 'neutral';
  }
}

interface ProviderSectionProps {
  provider: string;
  orders: Order[];
  defaultExpanded?: boolean;
}

function ProviderSection({ provider, orders, defaultExpanded = false }: ProviderSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const config = providerConfig[provider] || { icon: Package, label: provider, color: 'text-gray-600' };
  const Icon = config.icon;

  const totalSpend = orders.reduce((sum, o) => sum + parseFloat(o.total || '0'), 0);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-background ${config.color}`}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="text-left">
            <h4 className="font-medium text-foreground">{config.label}</h4>
            <p className="text-xs text-muted-foreground">
              {orders.length} order{orders.length !== 1 ? 's' : ''} &middot; {formatCurrency(totalSpend.toFixed(2))} total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" size="sm">{orders.length}</Badge>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="divide-y divide-border">
          {orders.map((order) => (
            <div key={order.id} className="p-4 bg-background hover:bg-muted/20 transition-colors">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">
                      {order.orderNumber || `Order #${order.id}`}
                    </span>
                    {order.externalId && order.externalId !== order.orderNumber && (
                      <span className="text-xs text-muted-foreground font-mono">
                        ({order.externalId.substring(0, 12)}...)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDate(order.placedAt)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-foreground">
                    {formatCurrency(order.total, order.currency)}
                  </p>
                  <div className="flex items-center gap-2 justify-end mt-1">
                    <StatusPill tone={getStatusTone(order.status)} size="sm">
                      {order.status}
                    </StatusPill>
                    <StatusPill tone={getStatusTone(order.financialStatus)} size="sm">
                      {order.financialStatus}
                    </StatusPill>
                  </div>
                </div>
              </div>

              {order.items.length > 0 && (
                <div className="mt-3 space-y-1">
                  {order.items.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-foreground/80 truncate max-w-[200px]">
                        {item.title || item.sku || 'Unknown item'}
                      </span>
                      <span className="text-muted-foreground">
                        x{item.quantity} @ {formatCurrency(item.price)}
                      </span>
                    </div>
                  ))}
                  {order.items.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      +{order.items.length - 3} more item{order.items.length - 3 !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function UnifiedOrdersPanel({ orders }: UnifiedOrdersPanelProps) {
  // Group orders by provider
  const grouped = orders.reduce((acc, order) => {
    const provider = order.provider || 'unknown';
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(order);
    return acc;
  }, {} as Record<string, Order[]>);

  const providerOrder = ['shopify', 'amazon', 'amazon_fba', 'qbo', 'shipstation', 'klaviyo', 'self_reported', 'manual'];
  const sortedProviders = Object.keys(grouped).sort((a, b) => {
    const aIdx = providerOrder.indexOf(a);
    const bIdx = providerOrder.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  const totalOrders = orders.length;
  const totalSpend = orders.reduce((sum, o) => sum + parseFloat(o.total || '0'), 0);

  if (orders.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">
              <Truck className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">Unified Orders</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No orders found"
            description="Orders will appear here once synced from commerce platforms."
            icon={Package}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">
              <Truck className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">Unified Orders</CardTitle>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {totalOrders} order{totalOrders !== 1 ? 's' : ''}
            </span>
            <Badge variant="secondary">{formatCurrency(totalSpend.toFixed(2))}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedProviders.map((provider, idx) => (
          <ProviderSection
            key={provider}
            provider={provider}
            orders={grouped[provider]}
            defaultExpanded={idx === 0}
          />
        ))}
      </CardContent>
    </Card>
  );
}
