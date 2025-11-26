// Temporary stub - Replace with shadcn/ui toast
export function toast({ title, description, variant }: { title?: string; description?: string; variant?: 'default' | 'destructive' }) {
  console.log('[Toast]', { title, description, variant });
  // TODO: Implement actual toast system
}

export function useToast() {
  return { toast };
}
