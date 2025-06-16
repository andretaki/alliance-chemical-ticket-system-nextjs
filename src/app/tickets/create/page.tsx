import { Metadata } from 'next';
import CreateTicketClient from '@/components/CreateTicketClient';

export const metadata: Metadata = {
  title: 'Create New Ticket - Issue Tracker',
  description: 'Submit a new support ticket or issue.',
};

export default function CreateTicketPage() {
  return (
    <div className="container py-4">
      {/* You could add breadcrumbs or other page-specific elements here */}
      <CreateTicketClient />
    </div>
  );
} 