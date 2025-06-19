export const AI_SUGGESTION_MARKERS = [
  "**AI Suggested Reply:**", "**Order Status Found - Suggested Reply:**",
  "**Suggested Reply (Request for Lot #):**", "**Order Status Reply:**",
  "**Suggested Reply (SDS Document):**", "**Suggested Reply (COC Information):**",
  "**Suggested Reply (Document Request):**", "**AI Order Status Reply:**", "**AI COA Reply:**",
  "**AI Welcome Email Suggestion:**", "**AI Follow-Up Actions:**", "**AI Onboarding Checklist:**",
  "**AI Response Templates:**", "**AI Customer Service Tips:**", "**AI Cost Savings:**"
];

export const isAISuggestionNote = (text: string | null): boolean => !!text && AI_SUGGESTION_MARKERS.some(marker => text.startsWith(marker));

export const extractAISuggestionContent = (text: string | null): string => {
  if (!text) return '';
  for (const marker of AI_SUGGESTION_MARKERS) {
    if (text.startsWith(marker)) return text.substring(marker.length).trim();
  }
  return text;
}; 