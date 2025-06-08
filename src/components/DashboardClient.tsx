'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardStatsSection from './DashboardStatsSection';
import EmailProcessingButton from './EmailProcessingButton';
import StatusChartClient from './charts/StatusChartClient';
import PriorityChartClient from './charts/PriorityChartClient';
import TypeChartClient from './charts/TypeChartClient';
import TicketListClient from './TicketListClient';
import SimpleOrderSearch from './dashboard/SimpleOrderSearch';
import { OrderSearchResult } from '@/types/orderSearch';

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
    return null; // Don't render anything, redirect will happen from useEffect
  }

  if (status === 'unauthenticated') {
    return null; // Don't render anything, redirect will happen from useEffect
  }

  // State to hold search results from SimpleOrderSearch
  const [searchResults, setSearchResults] = useState<OrderSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Callback function for the search component to pass up its results
  const handleSearchResults = (results: OrderSearchResult[]) => {
    setSearchResults(results);
  };

  return (
    <div className="p-4">
      <div className="container-fluid p-4">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h1 className="h2 fw-bold text-primary mb-0">Dashboard Overview</h1>
          <button className="btn btn-outline-primary rounded-pill px-3 py-2 d-flex align-items-center">
            <i className="bi bi-arrow-clockwise me-2"></i> Refresh Data
          </button>
        </div>
        
        {/* NEW: Simple Order Search Section */}
        <div className="row mb-4">
          <div className="col-12">
            <SimpleOrderSearch
              onResults={handleSearchResults}
              onSearching={setIsSearching}
              onDebouncedQueryChange={setDebouncedQuery}
            />
          </div>
        </div>
        {/* Conditional Rendering for Search Results */}
        {isSearching && (
          <div className="text-center py-4">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Searching...</span>
            </div>
          </div>
        )}
        {searchResults.length > 0 && !isSearching && (
          <div className="mb-4">
            <h3 className="h5 mb-3">Search Results</h3>
            {/* You could create a dedicated component to render these results elegantly */}
            <div className="list-group">
              {searchResults.map((order) => (
                <a
                  key={order.shopifyOrderGID}
                  href={order.shopifyAdminUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="list-group-item list-group-item-action"
                >
                  <div className="d-flex w-100 justify-content-between">
                    <h5 className="mb-1">{order.shopifyOrderName}</h5>
                    <small>{new Date(order.createdAt).toLocaleDateString()}</small>
                  </div>
                  <p className="mb-1">
                    {order.customerFullName} ({order.customerEmail})
                  </p>
                  <small>
                    Status: {order.fulfillmentStatus} | Total: ${order.totalPrice}
                  </small>
                </a>
              ))}
            </div>
          </div>
        )}
        {debouncedQuery.length >= 3 && !isSearching && searchResults.length === 0 && (
          <div className="alert alert-info text-center">No orders found for your search.</div>
        )}
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
            <Link href="/tickets" className="text-decoration-none text-primary">View All</Link>
          </div>
          <div className="card-body p-0">
            <TicketListClient limit={5} showSearch={false} />
          </div>
        </div>
      </div>
    </div>
  );
} 