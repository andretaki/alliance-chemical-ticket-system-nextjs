import { Metadata } from 'next';
import DirectQuoteCreationClient from '@/components/DirectQuoteCreationClient';

export const metadata: Metadata = {
  title: 'Create Quote - Alliance Chemical',
  description: 'Create a new quote directly, without requiring a pre-existing ticket.',
};

export default function CreateQuotePage() {
  return (
    <div className="container py-4">
      <DirectQuoteCreationClient />
    </div>
  );
} 