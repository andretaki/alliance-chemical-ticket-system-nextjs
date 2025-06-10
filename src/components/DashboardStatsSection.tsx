'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import DashboardStatCard from './DashboardStatCard';
import { ticketStatusEnum, ticketPriorityEnum } from '@/db/schema';

interface TicketSummary {
  id: number;
  status: 'new' | 'open' | 'in_progress' | 'pending_customer' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: string;
}

const DashboardStatsSection: React.FC = () => {
  const [activeTicketsCount, setActiveTicketsCount] = useState<number | string>('-');
  const [criticalTicketsCount, setCriticalTicketsCount] = useState<number | string>('-');
  const [newTodayCount, setNewTodayCount] = useState<number | string>('-');
  const [closedTodayCount, setClosedTodayCount] = useState<number | string>('-');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const activeStatuses = useMemo(() => [
    ticketStatusEnum.enumValues[0], // new
    ticketStatusEnum.enumValues[1], // open
    ticketStatusEnum.enumValues[2], // in_progress
    ticketStatusEnum.enumValues[3], // pending_customer
  ], []);

  const criticalPriorities = useMemo(() => [
    ticketPriorityEnum.enumValues[2], // high
    ticketPriorityEnum.enumValues[3], // urgent
  ], []);

  // Sample data for change calculations (replace with your actual historical data logic)
  const stats = useMemo(() => ({
    activeChange: { value: 12, isPositive: true },
    criticalChange: { value: 5, isPositive: false },
    newTodayChange: { value: 20, isPositive: true },
    closedTodayChange: { value: 15, isPositive: true }
  }), []);

  const fetchStats = useCallback(async () => {
    const wasInitialLoad = isLoading;
    if (!wasInitialLoad) setIsRefreshing(true);
    setError(null);
    
    try {
      // FIX: Use proper axios call with correct response structure
      const res = await axios.get<{ data: TicketSummary[] }>('/api/tickets');
      const tickets = res.data.data; // Corrected data access

      const active = tickets.filter(t => 
        activeStatuses.includes(t.status as typeof activeStatuses[number])
      ).length;
      setActiveTicketsCount(active);

      const critical = tickets.filter(t =>
        activeStatuses.includes(t.status as typeof activeStatuses[number]) &&
        criticalPriorities.includes(t.priority as typeof criticalPriorities[number])
      ).length;
      setCriticalTicketsCount(critical);
      
      const today = new Date().toISOString().split('T')[0];
      const newToday = tickets.filter(t => t.createdAt.startsWith(today)).length;
      setNewTodayCount(newToday);
      
      // Placeholder for closed today - requires closedAt field on ticket schema
      setClosedTodayCount(0);

    } catch (err) {
      console.error("Error fetching dashboard stats:", err);
      setError("Could not load dashboard statistics.");
      setActiveTicketsCount('N/A');
      setCriticalTicketsCount('N/A');
      setNewTodayCount('N/A');
      setClosedTodayCount('N/A');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeStatuses, criticalPriorities, isLoading]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (error) {
    return (
      <div className="error-container">
        <div className="error-card">
          <div className="error-icon">
            <i className="fas fa-exclamation-triangle" />
          </div>
          <div className="error-content">
            <h3>Unable to Load Statistics</h3>
            <p>{error}</p>
            <button onClick={() => fetchStats()} className="retry-button" type="button">
              <i className="fas fa-redo" />
              Try Again
            </button>
          </div>
        </div>
        
        <style jsx>{`
          .error-container {
            width: 100%;
            padding: 2rem;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 200px;
          }

          .error-card {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 20px;
            padding: 2rem;
            text-align: center;
            backdrop-filter: blur(10px);
            max-width: 400px;
            width: 100%;
          }

          .error-icon {
            width: 64px;
            height: 64px;
            background: rgba(239, 68, 68, 0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1rem;
            color: #ef4444;
            font-size: 1.5rem;
          }

          .error-content h3 {
            color: white;
            margin: 0 0 0.5rem 0;
            font-weight: 600;
          }

          .error-content p {
            color: rgba(255, 255, 255, 0.8);
            margin: 0 0 1.5rem 0;
          }

          .retry-button {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1.5rem;
            background: #ef4444;
            color: white;
            border: none;
            border-radius: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
          }

          .retry-button:hover {
            background: #dc2626;
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(239, 68, 68, 0.3);
          }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <div className="stats-section-container">
        {/* Section Header */}
        <div className="stats-header">
          <div className="header-content">
            <h2 className="section-title">
              <span className="title-icon">
                <i className="fas fa-chart-line" />
              </span>
              Dashboard Overview
            </h2>
            <button 
              className={`refresh-button ${isRefreshing ? 'refreshing' : ''}`}
              onClick={() => fetchStats()}
              disabled={isRefreshing}
              type="button"
            >
              <i className={`fas fa-sync-alt ${isRefreshing ? 'fa-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
          <div className="header-line" />
        </div>
        
        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="stat-card-wrapper" style={{ animationDelay: '0ms' }}>
            <DashboardStatCard
              title="Active Tickets"
              value={activeTicketsCount}
              iconClass="fas fa-ticket-alt"
              iconColorClass="text-primary"
              footerText="View all tickets"
              footerLink="/tickets"
              isLoading={isLoading}
              change={stats.activeChange}
            />
            <div className="card-glow glow-blue" />
          </div>

          <div className="stat-card-wrapper" style={{ animationDelay: '100ms' }}>
            <DashboardStatCard
              title="Critical Priority"
              value={criticalTicketsCount}
              iconClass="fas fa-exclamation-circle"
              iconColorClass="text-danger"
              footerText="View critical"
              footerLink="/tickets?priority=high,urgent"
              isLoading={isLoading}
              change={stats.criticalChange}
            />
            <div className="card-glow glow-red" />
          </div>

          <div className="stat-card-wrapper" style={{ animationDelay: '200ms' }}>
            <DashboardStatCard
              title="New Today"
              value={newTodayCount}
              iconClass="fas fa-calendar-plus"
              iconColorClass="text-success"
              isLoading={isLoading}
              change={stats.newTodayChange}
            />
            <div className="card-glow glow-green" />
          </div>

          <div className="stat-card-wrapper" style={{ animationDelay: '300ms' }}>
            <DashboardStatCard
              title="Resolved Today"
              value={closedTodayCount}
              iconClass="fas fa-check-circle"
              iconColorClass="text-warning"
              isLoading={isLoading}
              change={stats.closedTodayChange}
            />
            <div className="card-glow glow-yellow" />
          </div>
        </div>
      </div>

      <style jsx>{`
        .stats-section-container {
          width: 100%;
          margin-bottom: 2rem;
        }

        .stats-header {
          margin-bottom: 2rem;
          animation: slideInDown 0.6s ease-out;
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin: 0;
          font-size: 1.75rem;
          font-weight: 700;
          color: white;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        }

        .title-icon {
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 1.2rem;
          box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
        }

        .refresh-button {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          color: white;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
        }

        .refresh-button:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
        }

        .refresh-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .refresh-button.refreshing {
          background: rgba(102, 126, 234, 0.2);
          border-color: rgba(102, 126, 234, 0.3);
        }

        .header-line {
          height: 2px;
          background: linear-gradient(90deg, transparent, #667eea, #764ba2, transparent);
          border-radius: 1px;
          opacity: 0;
          animation: expandLine 1s ease-out 0.5s forwards;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.5rem;
        }

        .stat-card-wrapper {
          position: relative;
          animation: slideInUp 0.8s ease-out forwards;
          opacity: 0;
          transform: translateY(30px);
        }

        .card-glow {
          position: absolute;
          top: -20px;
          left: -20px;
          right: -20px;
          bottom: -20px;
          border-radius: 24px;
          opacity: 0;
          transition: opacity 0.4s ease;
          z-index: -1;
          filter: blur(20px);
        }

        .stat-card-wrapper:hover .card-glow {
          opacity: 0.6;
        }

        .glow-blue {
          background: linear-gradient(45deg, #3b82f6, #1d4ed8);
        }

        .glow-red {
          background: linear-gradient(45deg, #ef4444, #dc2626);
        }

        .glow-green {
          background: linear-gradient(45deg, #10b981, #059669);
        }

        .glow-yellow {
          background: linear-gradient(45deg, #f59e0b, #d97706);
        }

        @keyframes expandLine {
          to { opacity: 1; }
        }

        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-30px);
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
          .stats-grid {
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1rem;
          }

          .section-title {
            font-size: 1.5rem;
          }

          .header-content {
            flex-direction: column;
            align-items: flex-start;
          }
        }

        @media (max-width: 480px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Global styling for nested DashboardStatCard components */
        :global(.stat-card-wrapper .card) {
          background: rgba(255, 255, 255, 0.05) !important;
          backdrop-filter: blur(20px) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 20px !important;
          transition: all 0.4s ease !important;
          overflow: hidden !important;
          position: relative !important;
        }

        :global(.stat-card-wrapper .card:hover) {
          background: rgba(255, 255, 255, 0.08) !important;
          transform: translateY(-8px) !important;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
        }

        :global(.stat-card-wrapper .card-body) {
          position: relative !important;
          z-index: 2 !important;
          color: white !important;
        }

        :global(.stat-card-wrapper .card-subtitle) {
          color: rgba(255, 255, 255, 0.8) !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
          font-weight: 600 !important;
        }

        :global(.stat-card-wrapper .card-title) {
          color: white !important;
          font-weight: 800 !important;
          font-size: 2.5rem !important;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3) !important;
        }

        :global(.stat-card-wrapper .card-footer) {
          background: rgba(255, 255, 255, 0.05) !important;
          border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
          transition: all 0.3s ease !important;
        }

        :global(.stat-card-wrapper .card-footer:hover) {
          background: rgba(255, 255, 255, 0.1) !important;
        }

        :global(.stat-card-wrapper .stat-icon-circle) {
          width: 56px !important;
          height: 56px !important;
          background: rgba(255, 255, 255, 0.15) !important;
          border-radius: 14px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: 1.4rem !important;
          transition: all 0.3s ease !important;
        }

        :global(.stat-card-wrapper:hover .stat-icon-circle) {
          background: rgba(255, 255, 255, 0.25) !important;
          transform: scale(1.1) !important;
        }

        :global(.stat-card-wrapper .change-indicator) {
          padding: 0.375rem 0.75rem !important;
          border-radius: 20px !important;
          font-size: 0.875rem !important;
          font-weight: 600 !important;
          backdrop-filter: blur(10px) !important;
        }

        :global(.stat-card-wrapper .change-indicator.text-success) {
          background: rgba(16, 185, 129, 0.2) !important;
          color: #10b981 !important;
          border: 1px solid rgba(16, 185, 129, 0.3) !important;
        }

        :global(.stat-card-wrapper .change-indicator.text-danger) {
          background: rgba(239, 68, 68, 0.2) !important;
          color: #ef4444 !important;
          border: 1px solid rgba(239, 68, 68, 0.3) !important;
        }
      `}</style>
    </>
  );
};

export default DashboardStatsSection;