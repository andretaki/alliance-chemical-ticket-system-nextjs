import type { RagIntent } from './ragTypes';

export interface RagIdentifiers {
  orderNumbers: string[];
  invoiceNumbers: string[];
  trackingNumbers: string[];
  skus: string[];
  poNumbers: string[];
}

const ID_SEPARATOR = '\\s*(?:#|no\\.?|number)?\\s*[-:]?\\s*';
const ORDER_REGEX = new RegExp(`\\b(?:order|ord)${ID_SEPARATOR}([A-Z0-9][A-Z0-9-]{3,})\\b`, 'gi');
const INVOICE_REGEX = new RegExp(`\\b(?:invoice|inv)${ID_SEPARATOR}([A-Z0-9][A-Z0-9-]{3,})\\b`, 'gi');
const PO_REGEX = new RegExp(`\\b(?:p\\.?o\\.?|po)${ID_SEPARATOR}([A-Z0-9][A-Z0-9-]{3,})\\b`, 'gi');
const TRACKING_PREFIX_REGEX = new RegExp(`\\b(?:tracking|track|trk)${ID_SEPARATOR}([A-Z0-9]{8,})\\b`, 'gi');
const TRACKING_TOKEN_REGEX = /\b(1Z[0-9A-Z]{8,}|9[0-9]{15,21}|[0-9]{12,22}|[A-Z0-9]{12,})\b/g;
const SKU_REGEX = /\bSKU\s*[:#-]?\s*([A-Z0-9-]{3,})\b/gi;
const HASH_ONLY_REGEX = /^\s*#([A-Z0-9][A-Z0-9-]{3,})\s*$/i;
const TRACKING_KEYWORDS = /\b(tracking|track|shipment|carrier|delivery|waybill)\b/i;

export function extractIdentifiers(queryText: string): RagIdentifiers {
  const orderNumbers: string[] = [];
  const invoiceNumbers: string[] = [];
  const trackingNumbers: string[] = [];
  const skus: string[] = [];
  const poNumbers: string[] = [];

  const hashOnlyMatch = queryText.match(HASH_ONLY_REGEX);
  if (hashOnlyMatch?.[1]) {
    orderNumbers.push(hashOnlyMatch[1]);
  }

  let match: RegExpExecArray | null;
  while ((match = ORDER_REGEX.exec(queryText)) !== null) {
    const value = match[1];
    if (value) orderNumbers.push(value);
  }

  while ((match = INVOICE_REGEX.exec(queryText)) !== null) {
    const value = match[1];
    if (value) invoiceNumbers.push(value);
  }

  while ((match = PO_REGEX.exec(queryText)) !== null) {
    const value = match[1];
    if (value) poNumbers.push(value);
  }

  while ((match = SKU_REGEX.exec(queryText)) !== null) {
    const value = match[1];
    if (value) skus.push(value);
  }

  while ((match = TRACKING_PREFIX_REGEX.exec(queryText)) !== null) {
    const value = match[1];
    if (value) trackingNumbers.push(value);
  }

  const trackingMatches = queryText.match(TRACKING_TOKEN_REGEX) || [];
  const hasTrackingKeyword = TRACKING_KEYWORDS.test(queryText);
  trackingMatches.forEach((token) => {
    if (/^1Z/i.test(token)) {
      trackingNumbers.push(token);
      return;
    }
    if (/[A-Z]/i.test(token) && token.length >= 12) {
      trackingNumbers.push(token);
      return;
    }
    if (hasTrackingKeyword) {
      trackingNumbers.push(token);
    }
  });

  return {
    orderNumbers: Array.from(new Set(orderNumbers)),
    invoiceNumbers: Array.from(new Set(invoiceNumbers)),
    trackingNumbers: Array.from(new Set(trackingNumbers)),
    skus: Array.from(new Set(skus)),
    poNumbers: Array.from(new Set(poNumbers)),
  };
}

export function classifyIntent(queryText: string, identifiers: RagIdentifiers): RagIntent {
  const text = queryText.toLowerCase();

  if (
    identifiers.orderNumbers.length ||
    identifiers.invoiceNumbers.length ||
    identifiers.trackingNumbers.length ||
    identifiers.skus.length ||
    identifiers.poNumbers.length
  ) {
    return 'identifier_lookup';
  }

  if (/\b(policy|sop|procedure|process|guideline)\b/.test(text)) {
    return 'policy_sop';
  }

  if (/\b(ship|shipping|shipment|tracking|carrier|delivery|order status)\b/.test(text) || /where(?:'s| is) my order/.test(text)) {
    return 'logistics_shipping';
  }

  if (/\b(invoice|payment|balance|terms|ar|credit|past due|estimate|quote|quotation)\b/.test(text)) {
    return 'payments_terms';
  }

  if (/\b(history|previous|past orders|account|customer)\b/.test(text)) {
    return 'account_history';
  }

  if (/\b(error|issue|problem|not working|broken|troubleshoot)\b/.test(text)) {
    return 'troubleshooting';
  }

  return 'account_history';
}
