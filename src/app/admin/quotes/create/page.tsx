import { Metadata } from 'next';
import QuoteCreationWizard from '@/components/quote-creation-wizard/QuoteCreationWizard';

export const metadata: Metadata = {
  title: 'Create Quote - Alliance Chemical',
  description: 'Create a new quote for a customer.',
};

export default function CreateQuotePage() {
  return (
    <div className="container py-4">
      <QuoteCreationWizard />
    </div>
  );
} 