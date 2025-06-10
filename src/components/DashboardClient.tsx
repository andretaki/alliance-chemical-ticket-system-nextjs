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
      <div className="loading-overlay">
        <div className="loading-content">
          <div className="loading-spinner">
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
          </div>
          <div className="loading-text">
            <h3>Loading Dashboard</h3>
            <p>Preparing your workspace...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modern-dashboard-container">
      {/* Animated Background */}
      <div className="dashboard-background">
        <div className="bg-gradient-1"></div>
        <div className="bg-gradient-2"></div>
        <div className="bg-pattern"></div>
      </div>

      {/* Main Dashboard Content */}
      <div className="dashboard-content">
        {/* Header Section */}
        <div className="dashboard-header">
          <div className="header-content">
            <div className="header-main">
              <h1 className="dashboard-title">
                <span className="title-gradient">Dashboard</span>
                <div className="title-underline"></div>
              </h1>
              <p className="dashboard-subtitle">
                Welcome back, {session?.user?.name || 'User'}! Here&apos;s your command center.
              </p>
            </div>
            <div className="header-actions">
              <Link href="/tickets/create" className="cta-button">
                <span className="button-icon">
                  <i className="fas fa-plus"></i>
                </span>
                <span className="button-text">New Ticket</span>
                <div className="button-glow"></div>
              </Link>
            </div>
          </div>
        </div>

        {/* Order Search Section */}
        <div className="search-section">
          <div className="search-card">
            <div className="search-header">
              <h2>Quick Order Search</h2>
              <div className="search-icon">
                <i className="fas fa-search"></i>
              </div>
            </div>
            <SimpleOrderSearch />
          </div>
        </div>

        {/* Stats Section */}
        <div className="stats-section">
          <div className="section-header">
            <h2>Overview</h2>
            <div className="section-line"></div>
          </div>
          <DashboardStatsSection />
        </div>
        
        {/* Charts Section */}
        <div className="charts-section">
          <div className="section-header">
            <h2>Analytics</h2>
            <div className="section-line"></div>
          </div>
          <div className="charts-grid">
            <div className="chart-card">
              <StatusChartClient />
            </div>
            <div className="chart-card">
              <PriorityChartClient />
            </div>
            <div className="chart-card">
              <TypeChartClient />
            </div>
          </div>
        </div>
        
        {/* Recent Tickets Section */}
        <div className="tickets-section">
          <div className="section-header">
            <h2>Recent Activity</h2>
            <div className="section-line"></div>
            <Link href="/tickets" className="view-all-link">
              <span>View All</span>
              <i className="fas fa-arrow-right"></i>
            </Link>
          </div>
          <div className="tickets-card">
            <TicketListClient limit={5} showSearch={false} />
          </div>
        </div>
      </div>

      <style jsx>{`
        .modern-dashboard-container {
          min-height: 100vh;
          position: relative;
          overflow-x: hidden;
          background: #0a0a0f;
        }

        .dashboard-background {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: -1;
        }

        .bg-gradient-1 {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: radial-gradient(circle at 20% 20%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
                      radial-gradient(circle at 80% 80%, rgba(255, 119, 198, 0.3) 0%, transparent 50%);
          animation: gradientShift 8s ease-in-out infinite;
        }

        .bg-gradient-2 {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: radial-gradient(circle at 60% 40%, rgba(64, 224, 208, 0.2) 0%, transparent 50%);
          animation: gradientShift 10s ease-in-out infinite reverse;
        }

        .bg-pattern {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-image: 
            radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0);
          background-size: 40px 40px;
          opacity: 0.5;
          animation: patternMove 20s linear infinite;
        }

        @keyframes gradientShift {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.1) rotate(180deg); }
        }

        @keyframes patternMove {
          0% { transform: translate(0, 0); }
          100% { transform: translate(40px, 40px); }
        }

        .loading-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }

        .loading-content {
          text-align: center;
          color: white;
        }

        .loading-spinner {
          position: relative;
          width: 80px;
          height: 80px;
          margin: 0 auto 2rem;
        }

        .spinner-ring {
          position: absolute;
          width: 100%;
          height: 100%;
          border: 3px solid transparent;
          border-top: 3px solid white;
          border-radius: 50%;
          animation: spin 1.2s linear infinite;
        }

        .spinner-ring:nth-child(2) {
          animation-delay: 0.15s;
          border-top-color: rgba(255,255,255,0.8);
        }

        .spinner-ring:nth-child(3) {
          animation-delay: 0.3s;
          border-top-color: rgba(255,255,255,0.6);
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .loading-text h3 {
          font-size: 1.5rem;
          margin: 0 0 0.5rem 0;
          font-weight: 600;
        }

        .loading-text p {
          margin: 0;
          opacity: 0.8;
        }

        .dashboard-content {
          position: relative;
          z-index: 1;
          padding: 2rem;
          max-width: 1400px;
          margin: 0 auto;
        }

        .dashboard-header {
          margin-bottom: 3rem;
          animation: slideInDown 0.8s ease-out;
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          flex-wrap: wrap;
          gap: 2rem;
        }

        .dashboard-title {
          font-size: 4rem;
          font-weight: 900;
          margin: 0;
          line-height: 1;
          position: relative;
        }

        .title-gradient {
          background: linear-gradient(135deg, #fff 0%, #c7d2fe 50%, #a5b4fc 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.02em;
        }

        .title-underline {
          height: 4px;
          background: linear-gradient(90deg, #667eea, #764ba2);
          border-radius: 2px;
          margin-top: 0.5rem;
          animation: expandWidth 1s ease-out 0.5s forwards;
          width: 0;
        }

        @keyframes expandWidth {
          to { width: 100%; }
        }

        .dashboard-subtitle {
          font-size: 1.2rem;
          color: rgba(255, 255, 255, 0.8);
          margin: 1rem 0 0 0;
          font-weight: 300;
        }

        .cta-button {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 2rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          text-decoration: none;
          border-radius: 16px;
          font-weight: 600;
          font-size: 1.1rem;
          transition: all 0.3s ease;
          border: 1px solid rgba(255, 255, 255, 0.2);
          overflow: hidden;
        }

        .cta-button:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 40px rgba(102, 126, 234, 0.4);
          color: white;
        }

        .button-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          transition: all 0.3s ease;
        }

        .cta-button:hover .button-icon {
          background: rgba(255, 255, 255, 0.3);
          transform: rotate(90deg);
        }

        .button-glow {
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .cta-button:hover .button-glow {
          opacity: 1;
        }

        .search-section {
          margin-bottom: 3rem;
          animation: slideInUp 0.8s ease-out 0.2s forwards;
          opacity: 0;
        }

        .search-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 2rem;
          transition: all 0.3s ease;
        }

        .search-card:hover {
          background: rgba(255, 255, 255, 0.08);
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .search-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .search-header h2 {
          color: white;
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0;
        }

        .search-icon {
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 1.2rem;
        }

        .stats-section,
        .charts-section,
        .tickets-section {
          margin-bottom: 4rem;
          animation: slideInUp 0.8s ease-out forwards;
          opacity: 0;
        }

        .charts-section {
          animation-delay: 0.4s;
        }

        .tickets-section {
          animation-delay: 0.6s;
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 2rem;
        }

        .section-header h2 {
          color: white;
          font-size: 2rem;
          font-weight: 700;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .section-line {
          flex: 1;
          height: 2px;
          background: linear-gradient(90deg, transparent, #667eea, transparent);
          margin-left: 2rem;
        }

        .view-all-link {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: rgba(255, 255, 255, 0.8);
          text-decoration: none;
          font-weight: 500;
          transition: all 0.3s ease;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .view-all-link:hover {
          color: white;
          background: rgba(255, 255, 255, 0.1);
          transform: translateX(4px);
        }

        .charts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 2rem;
        }

        .chart-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 0;
          transition: all 0.4s ease;
          overflow: hidden;
        }

        .chart-card:hover {
          background: rgba(255, 255, 255, 0.08);
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
        }

        .tickets-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        .tickets-card:hover {
          background: rgba(255, 255, 255, 0.08);
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-40px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideInUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .dashboard-content {
            padding: 1rem;
          }

          .dashboard-title {
            font-size: 2.5rem;
          }

          .header-content {
            flex-direction: column;
            align-items: flex-start;
            gap: 1.5rem;
          }

          .section-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }

          .section-line {
            width: 100%;
            margin-left: 0;
          }

          .charts-grid {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }

          .search-card {
            padding: 1.5rem;
          }
        }

        /* Dark mode chart styling */
        :global(.chart-card .card) {
          background: transparent !important;
          border: none !important;
          color: white !important;
        }

        :global(.chart-card .card-header) {
          background: rgba(255, 255, 255, 0.05) !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
          color: white !important;
        }

        :global(.chart-card .card-body) {
          background: transparent !important;
          color: white !important;
        }

        :global(.tickets-card .card) {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }

        :global(.tickets-card .card-header) {
          background: rgba(255, 255, 255, 0.05) !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
          color: white !important;
        }
      `}</style>
    </div>
  );
}