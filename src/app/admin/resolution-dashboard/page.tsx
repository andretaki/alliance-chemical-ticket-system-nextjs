import { Metadata } from 'next';
import ResolutionMetricsPanel from '@/components/resolution/ResolutionMetricsPanel';
import AutoResolvedTicketsTable from '@/components/resolution/AutoResolvedTicketsTable';
import ResolutionConfigPanel from '@/components/resolution/ResolutionConfigPanel';

export const metadata: Metadata = {
  title: 'Resolution Management | Alliance Chemical Ticketing',
  description: 'Manage AI-powered ticket resolution settings and view auto-closure statistics'
};

export default function ResolutionDashboardPage() {
  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Resolution Management</h1>
      </div>
      
      <div className="row">
        <div className="col-lg-8">
          <ResolutionMetricsPanel />
          <AutoResolvedTicketsTable />
        </div>
        <div className="col-lg-4">
          <ResolutionConfigPanel />
        </div>
      </div>
    </div>
  );
} 