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
      <div className="flex items-center justify-center p-8 min-h-[200px]">
        <div className="bg-danger/10 border border-danger/30 rounded-2xl p-8 text-center backdrop-blur-md max-w-md w-full">
            <div className="w-16 h-16 bg-danger/20 rounded-full flex items-center justify-center mx-auto mb-4 text-danger text-2xl">
                <i className="fas fa-exclamation-triangle" />
            </div>
            <h3 className="text-white font-semibold mb-2">Unable to Load Statistics</h3>
            <p className="text-white/80 mb-6">{error}</p>
            <button onClick={() => fetchStats()} className="inline-flex items-center gap-2 px-6 py-2 bg-danger text-white rounded-lg font-medium transition-transform hover:scale-105 hover:bg-danger-hover shadow-lg">
                <i className="fas fa-redo" />
                Try Again
            </button>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Active Tickets",
      value: activeTicketsCount,
      iconClass: "fas fa-ticket-alt",
      iconColorClass: "text-primary",
      footerText: "View all tickets",
      footerLink: "/tickets",
      change: stats.activeChange,
      glowClass: "group-hover:opacity-30 from-primary to-primary-hover"
    },
    {
      title: "Critical Priority",
      value: criticalTicketsCount,
      iconClass: "fas fa-exclamation-circle",
      iconColorClass: "text-danger",
      footerText: "View critical",
      footerLink: "/tickets?priority=high,urgent",
      change: stats.criticalChange,
      glowClass: "group-hover:opacity-30 from-danger to-danger-hover"
    },
    {
      title: "New Today",
      value: newTodayCount,
      iconClass: "fas fa-calendar-plus",
      iconColorClass: "text-success",
      change: stats.newTodayChange,
      glowClass: "group-hover:opacity-30 from-success to-success-hover"
    },
    {
      title: "Resolved Today",
      value: closedTodayCount,
      iconClass: "fas fa-check-circle",
      iconColorClass: "text-warning",
      change: stats.closedTodayChange,
      glowClass: "group-hover:opacity-30 from-warning to-warning-hover"
    }
  ];

  return (
    <div className="w-full mb-8">
        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
            <h2 className="flex items-center gap-4 text-2xl font-bold text-white">
                <span className="w-12 h-12 flex items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-hover text-white text-xl shadow-lg">
                    <i className="fas fa-chart-line" />
                </span>
                Dashboard Overview
            </h2>
            <button 
                className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white font-medium transition-all duration-200 backdrop-blur-sm hover:bg-white/20 disabled:opacity-70 disabled:cursor-not-allowed ${isRefreshing ? 'animate-pulse' : ''}`}
                onClick={() => fetchStats()}
                disabled={isRefreshing}
            >
                <i className={`fas fa-sync-alt ${isRefreshing ? 'fa-spin' : ''}`} />
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {statCards.map((card, index) => (
                <div key={index} className="group relative animate-fadeInUp" style={{animationDelay: `${index * 100}ms`}}>
                    <DashboardStatCard
                        title={card.title}
                        value={card.value}
                        iconClass={card.iconClass}
                        iconColorClass={card.iconColorClass}
                        footerText={card.footerText}
                        footerLink={card.footerLink}
                        isLoading={isLoading}
                        change={card.change}
                    />
                    <div className={`absolute -inset-2 rounded-3xl z-[-1] bg-gradient-to-br blur-lg transition-opacity duration-300 opacity-0 ${card.glowClass}`} />
                </div>
            ))}
        </div>
    </div>
  );
};

export default DashboardStatsSection;