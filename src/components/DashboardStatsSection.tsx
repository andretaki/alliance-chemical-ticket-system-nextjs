'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { ticketStatusEnum, ticketPriorityEnum } from '@/db/schema';

interface TicketSummary {
  id: number;
  status: 'new' | 'open' | 'in_progress' | 'pending_customer' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: string;
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  href?: string;
  variant?: 'default' | 'danger' | 'success' | 'warning';
  isLoading?: boolean;
}

function StatCard({ label, value, icon, href, variant = 'default', isLoading }: StatCardProps) {
  const variantStyles = {
    default: 'text-indigo-400',
    danger: 'text-red-400',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
  };

  const content = (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 hover:bg-white/[0.04] transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-white/40 uppercase tracking-wide">{label}</span>
        <i className={`${icon} text-sm ${variantStyles[variant]}`} />
      </div>
      {isLoading ? (
        <div className="h-8 w-16 bg-white/[0.05] rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-semibold text-white tabular-nums">{value}</p>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

const DashboardStatsSection: React.FC = () => {
  const [stats, setStats] = useState({
    active: '-' as number | string,
    critical: '-' as number | string,
    newToday: '-' as number | string,
    resolved: '-' as number | string,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeStatuses = useMemo(() => [
    ticketStatusEnum.enumValues[0],
    ticketStatusEnum.enumValues[1],
    ticketStatusEnum.enumValues[2],
    ticketStatusEnum.enumValues[3],
  ], []);

  const criticalPriorities = useMemo(() => [
    ticketPriorityEnum.enumValues[2],
    ticketPriorityEnum.enumValues[3],
  ], []);

  const fetchStats = useCallback(async () => {
    setError(null);
    try {
      const res = await axios.get<{ data: TicketSummary[] }>('/api/tickets');
      const tickets = res.data.data;

      const active = tickets.filter(t =>
        activeStatuses.includes(t.status as typeof activeStatuses[number])
      ).length;

      const critical = tickets.filter(t =>
        activeStatuses.includes(t.status as typeof activeStatuses[number]) &&
        criticalPriorities.includes(t.priority as typeof criticalPriorities[number])
      ).length;

      const today = new Date().toISOString().split('T')[0];
      const newToday = tickets.filter(t => t.createdAt.startsWith(today)).length;

      setStats({ active, critical, newToday, resolved: 0 });
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError('Failed to load');
      setStats({ active: '-', critical: '-', newToday: '-', resolved: '-' });
    } finally {
      setIsLoading(false);
    }
  }, [activeStatuses, criticalPriorities]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={fetchStats}
          className="mt-2 text-xs text-white/50 hover:text-white/70"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Active"
        value={stats.active}
        icon="fas fa-ticket-alt"
        href="/tickets"
        isLoading={isLoading}
      />
      <StatCard
        label="Critical"
        value={stats.critical}
        icon="fas fa-exclamation-circle"
        href="/tickets?priority=high,urgent"
        variant="danger"
        isLoading={isLoading}
      />
      <StatCard
        label="New Today"
        value={stats.newToday}
        icon="fas fa-plus-circle"
        variant="success"
        isLoading={isLoading}
      />
      <StatCard
        label="Resolved"
        value={stats.resolved}
        icon="fas fa-check-circle"
        variant="warning"
        isLoading={isLoading}
      />
    </div>
  );
};

export default DashboardStatsSection;