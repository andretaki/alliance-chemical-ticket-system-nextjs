const REPLY_SPLIT_PATTERNS: RegExp[] = [
  /^\s*On\s.+?wrote:\s*$/im,
  /^\s*From:\s.+/im,
  /^\s*Sent:\s.+/im,
  /^\s*To:\s.+/im,
  /^\s*Subject:\s.+/im,
  /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^\s*---+\s*Forwarded message\s*---+\s*$/im,
  /^\s*Begin forwarded message\s*:?\s*$/im,
  /^\s*Forwarded message\s*:?\s*$/im,
  /^\s*Auto(?:matic)?\s*reply\s*:?\s*$/im,
];

const SIGNATURE_MARKERS: RegExp[] = [
  /^\s*--\s*$/m,
  /^\s*__+\s*$/m,
  /^\s*thanks[,!]?\s*$/im,
  /^\s*best[\s,]*$/im,
  /^\s*regards[\s,]*$/im,
  /^\s*sent from my\s/i,
  /^\s*confidentiality notice/i,
  /^\s*this email and any attachments/i,
  /^\s*disclaimer:/i,
];

const AUTO_REPLY_LINES: RegExp[] = [
  /^\s*out of office/i,
  /^\s*i am currently out of the office/i,
  /^\s*this is an automated message/i,
];

const HTML_BREAKS = /<\s*br\s*\/?>/gi;
const HTML_PARAGRAPHS = /<\s*\/?p\s*>/gi;

export function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[\u00A0]/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

export function stripHtml(input: string): string {
  return input
    .replace(HTML_BREAKS, '\n')
    .replace(HTML_PARAGRAPHS, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripQuotedLines(lines: string[]): string[] {
  return lines.filter((line) => !/^\s*>/.test(line));
}

function truncateAtSignature(lines: string[]): string[] {
  const maxScanStart = Math.max(0, lines.length - 15);
  for (let i = maxScanStart; i < lines.length; i += 1) {
    const line = lines[i];
    if (SIGNATURE_MARKERS.some((pattern) => pattern.test(line))) {
      return lines.slice(0, i).filter((l) => l.trim() !== '');
    }
  }
  return lines;
}

function splitAtReplyBoundary(lines: string[]): string[] {
  for (let i = 0; i < lines.length; i += 1) {
    if (REPLY_SPLIT_PATTERNS.some((pattern) => pattern.test(lines[i]))) {
      return lines.slice(0, i);
    }
  }
  return lines;
}

function stripAutoReplyLines(lines: string[]): string[] {
  return lines.filter((line) => !AUTO_REPLY_LINES.some((pattern) => pattern.test(line)));
}

export function cleanEmailText(input: string): string {
  const raw = normalizeWhitespace(stripHtml(input || ''));
  if (!raw) return '';

  let lines = raw.split('\n');
  lines = stripQuotedLines(lines);
  lines = splitAtReplyBoundary(lines);
  lines = stripAutoReplyLines(lines);
  lines = truncateAtSignature(lines);

  return normalizeWhitespace(lines.join('\n'));
}

export function cleanTicketText(input: string): string {
  return normalizeWhitespace(stripHtml(input || ''));
}

export function cleanStructuredText(input: string): string {
  return normalizeWhitespace(input || '');
}
