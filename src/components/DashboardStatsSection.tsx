'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { ticketStatusEnum, ticketPriorityEnum } from '@/db/schema';
import { Ticket, AlertCircle, PlusCircle, CheckCircle } from 'lucide-react';

interface TicketSummary {
  id: number;
  status: 'new' | 'open' | 'in_progress' | 'pending_customer' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: string;
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  href?: string;
  variant?: 'default' | 'danger' | 'success' | 'warning';
  isLoading?: boolean;
}

function StatCard({ label, value, icon, href, variant = 'default', isLoading }: StatCardProps) {
  const variantStyles = {
    default: 'text-indigo-500 dark:text-indigo-400',
    danger: 'text-red-500 dark:text-red-400',
    success: 'text-emerald-500 dark:text-emerald-400',
    warning: 'text-amber-500 dark:text-amber-400',
  };

  const content = (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 shadow-sm transition-colors dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide dark:text-gray-400">{label}</span>
        <span className={variantStyles[variant]}>{icon}</span>
      </div>
      {isLoading ? (
        <div className="h-8 w-16 bg-gray-100 rounded animate-pulse dark:bg-gray-700" />
      ) : (
        <p className="text-2xl font-semibold text-gray-900 tabular-nums dark:text-white">{value}</p>
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
      // API returns: { success, data: { tickets: [...], pagination } }
      const res = await axios.get('/api/tickets');
      const raw = res.data?.data?.tickets;
      const tickets: TicketSummary[] = Array.isArray(raw) ? raw : [];

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
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center dark:bg-red-900/20 dark:border-red-800">
        <p className="text-red-600 text-sm dark:text-red-400">{error}</p>
        <button
          onClick={fetchStats}
          className="mt-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
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
        icon={<Ticket className="w-4 h-4" />}
        href="/tickets"
        isLoading={isLoading}
      />
      <StatCard
        label="Critical"
        value={stats.critical}
        icon={<AlertCircle className="w-4 h-4" />}
        href="/tickets?priority=high,urgent"
        variant="danger"
        isLoading={isLoading}
      />
      <StatCard
        label="New Today"
        value={stats.newToday}
        icon={<PlusCircle className="w-4 h-4" />}
        variant="success"
        isLoading={isLoading}
      />
      <StatCard
        label="Resolved"
        value={stats.resolved}
        icon={<CheckCircle className="w-4 h-4" />}
        variant="warning"
        isLoading={isLoading}
      />
    </div>
  );
};

export default DashboardStatsSection;