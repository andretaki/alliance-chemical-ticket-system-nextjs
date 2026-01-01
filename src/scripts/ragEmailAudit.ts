import { graphClient, getUserEmail } from '@/lib/graphService';
import { cleanEmailText } from '@/services/rag/ragCleaning';
import { extractIdentifiers } from '@/services/rag/ragIntent';

type GraphMessage = {
  id: string;
  subject?: string | null;
  body?: { content?: string | null } | null;
  bodyPreview?: string | null;
  receivedDateTime?: string | null;
  webLink?: string | null;
};

const NOISE_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'quoted_reply', regex: /^\s*>/m },
  { label: 'original_message', regex: /original message/i },
  { label: 'forwarded', regex: /forwarded message/i },
  { label: 'confidentiality', regex: /confidential|privileged/i },
  { label: 'unsubscribe', regex: /unsubscribe/i },
];

function detectNoise(text: string): string[] {
  return NOISE_PATTERNS.filter((pattern) => pattern.regex.test(text)).map((pattern) => pattern.label);
}

function collectIdentifiers(text: string): Set<string> {
  const ids = extractIdentifiers(text);
  const values = [
    ...ids.orderNumbers,
    ...ids.invoiceNumbers,
    ...ids.poNumbers,
    ...ids.trackingNumbers,
    ...ids.skus,
  ];
  return new Set(values.map((value) => value.toLowerCase()));
}

async function main() {
  const limit = Number(process.env.RAG_EMAIL_AUDIT_LIMIT || 50);
  const mailbox = process.env.RAG_EMAIL_AUDIT_MAILBOX || getUserEmail();
  const filter = process.env.RAG_EMAIL_AUDIT_FILTER;
  const search = process.env.RAG_EMAIL_AUDIT_SEARCH;

  if (!mailbox) {
    console.error('Missing mailbox. Set RAG_EMAIL_AUDIT_MAILBOX or SHARED_MAILBOX_ADDRESS.');
    process.exit(1);
  }

  let request = graphClient
    .api(`/users/${mailbox}/messages`)
    .top(limit)
    .select('id,subject,body,bodyPreview,receivedDateTime,webLink')
    .orderby('receivedDateTime desc');

  if (filter) {
    request = request.filter(filter);
  }

  if (search) {
    request = request.search(`"${search}"`).header('ConsistencyLevel', 'eventual');
  }

  const response = await request.get();
  const messages = (response?.value || []) as GraphMessage[];

  const flagged: Array<{
    id: string;
    subject: string;
    removedRatio: number;
    noise: string[];
    missingIdentifiers: string[];
    webLink?: string | null;
  }> = [];

  let totalRemovedRatio = 0;
  let totalProcessed = 0;

  for (const message of messages) {
    const original = (message.body?.content || message.bodyPreview || '').trim();
    if (!original) continue;

    const cleaned = cleanEmailText(original);
    const originalLen = original.length;
    const cleanedLen = cleaned.length;
    const removedRatio = originalLen ? 1 - cleanedLen / originalLen : 0;
    totalRemovedRatio += removedRatio;
    totalProcessed += 1;

    const noise = detectNoise(cleaned);
    const originalIds = collectIdentifiers(original);
    const cleanedIds = collectIdentifiers(cleaned);
    const missingIdentifiers = Array.from(originalIds).filter((value) => !cleanedIds.has(value));

    if (noise.length || missingIdentifiers.length) {
      flagged.push({
        id: message.id,
        subject: message.subject || '(no subject)',
        removedRatio,
        noise,
        missingIdentifiers,
        webLink: message.webLink,
      });
    }
  }

  const avgRemovedRatio = totalProcessed ? totalRemovedRatio / totalProcessed : 0;

  console.log(JSON.stringify({
    mailbox,
    totalFetched: messages.length,
    totalProcessed,
    avgRemovedRatio: Number(avgRemovedRatio.toFixed(3)),
    flaggedCount: flagged.length,
    flaggedSamples: flagged.slice(0, 15),
  }, null, 2));
}

main().catch((error) => {
  console.error('[ragEmailAudit] Failed:', error);
  process.exit(1);
});
