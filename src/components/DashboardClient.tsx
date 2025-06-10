'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import DashboardStatsSection from './DashboardStatsSection';
import StatusChartClient from './charts/StatusChartClient';
import PriorityChartClient from './charts/PriorityChartClient';
import TypeChartClient from './charts/TypeChartClient';
import TicketListClient from './TicketListClient';
import SimpleOrderSearch from './dashboard/SimpleOrderSearch';

export default function DashboardClient() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin?callbackUrl=/dashboard');
    }
  }, [status, router]);

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '80vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h2 fw-bold text-primary mb-0">Dashboard</h1>
      </div>

      <div className="row mb-4">
        <div className="col-12">
          {/* The new, self-contained search component */}
          <SimpleOrderSearch />
        </div>
      </div>

      <DashboardStatsSection />
      
      <div className="row g-4 mb-4">
        <div className="col-lg-4"><StatusChartClient /></div>
        <div className="col-lg-4"><PriorityChartClient /></div>
        <div className="col-lg-4"><TypeChartClient /></div>
      </div>
      
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white border-0 d-flex justify-content-between align-items-center pt-3">
          <h5 className="card-title fw-semibold mb-0">Recent Tickets</h5>
          <Link href="/tickets" className="text-decoration-none text-primary">View All</Link>
        </div>
        <div className="card-body p-0">
          <TicketListClient limit={5} showSearch={false} />
        </div>
      </div>
    </div>
  );
} 