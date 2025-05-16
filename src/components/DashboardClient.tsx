'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import DashboardStatsSection from './DashboardStatsSection';
import EmailProcessingButton from './EmailProcessingButton';
import StatusChartClient from './charts/StatusChartClient';
import PriorityChartClient from './charts/PriorityChartClient';
import TypeChartClient from './charts/TypeChartClient';
import TicketListClient from './TicketListClient';

export default function DashboardClient() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // Client-side authentication check
  useEffect(() => {
    if (status === 'unauthenticated') {
      console.log('User not authenticated, redirecting to sign-in page');
      router.push('/auth/signin?callbackUrl=/dashboard');
    }
  }, [status, router]);

  if (status === 'loading') {
    return <div className="p-4">Loading dashboard...</div>;
  }

  if (status === 'unauthenticated') {
    return null; // Don't render anything, redirect will happen from useEffect
  }

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h2 fw-bold text-primary mb-0">Dashboard Overview</h1>
        <button className="btn btn-outline-primary rounded-pill px-3 py-2 d-flex align-items-center">
          <i className="bi bi-arrow-clockwise me-2"></i> Refresh Data
        </button>
      </div>
      
      {/* Stats Cards Section */}
      <DashboardStatsSection />
      
      {/* Email Processing Section */}
      <div className="mb-4">
        <EmailProcessingButton />
      </div>

      {/* Charts Section */}
      <div className="row g-4 mb-4">
        <div className="col-lg-4">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white border-0 pt-3">
              <h5 className="card-title fw-semibold">Status Distribution</h5>
            </div>
            <div className="card-body">
              <StatusChartClient />
            </div>
          </div>
        </div>
        <div className="col-lg-4">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white border-0 pt-3">
              <h5 className="card-title fw-semibold">Priority Breakdown</h5>
            </div>
            <div className="card-body">
              <PriorityChartClient />
            </div>
          </div>
        </div>
        <div className="col-lg-4">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white border-0 pt-3">
              <h5 className="card-title fw-semibold">Issue Types</h5>
            </div>
            <div className="card-body">
              <TypeChartClient />
            </div>
          </div>
        </div>
      </div>
      
      {/* Ticket List Section */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white border-0 d-flex justify-content-between align-items-center pt-3">
          <h5 className="card-title fw-semibold mb-0">Recent Tickets</h5>
          <a href="/tickets" className="text-decoration-none text-primary">View All</a>
        </div>
        <div className="card-body p-0">
          <TicketListClient limit={5} showSearch={false} />
        </div>
      </div>
    </div>
  );
} 