import { extractIdentifiers } from '@/services/rag/ragIntent';

describe('rag identifier extraction', () => {
  it('extracts order, invoice, and PO numbers with explicit prefixes', () => {
    const identifiers = extractIdentifiers('Order 12345, Invoice #INV-1001, PO-98765 status');
    expect(identifiers.orderNumbers).toContain('12345');
    expect(identifiers.invoiceNumbers).toContain('INV-1001');
    expect(identifiers.poNumbers).toContain('98765');
  });

  it('extracts tracking numbers and preserves alphanumeric tokens', () => {
    const identifiers = extractIdentifiers('Tracking 1Z999AA123456789 for shipment');
    expect(identifiers.trackingNumbers).toContain('1Z999AA123456789');
  });

  it('avoids false positives without context', () => {
    const identifiers = extractIdentifiers('In 2024, we had strong growth. Call extension #12345.');
    expect(identifiers.orderNumbers).toHaveLength(0);
    expect(identifiers.invoiceNumbers).toHaveLength(0);
    expect(identifiers.poNumbers).toHaveLength(0);
  });

  it('accepts hash-only queries as identifiers', () => {
    const identifiers = extractIdentifiers('#12345');
    expect(identifiers.orderNumbers).toContain('12345');
  });
});
