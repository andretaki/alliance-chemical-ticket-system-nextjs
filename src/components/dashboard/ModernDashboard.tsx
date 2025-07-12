'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, StatusBadge, PriorityBadge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui';
import { cn } from '@/utils/cn';

interface DashboardStats {
  totalTickets: number;
  openTickets: number;
  urgentTickets: number;
  resolvedToday: number;
  avgResponseTime: string;
  customerSatisfaction: number;
}

interface RecentTicket {
  id: number;
  title: string;
  status: 'new' | 'open' | 'in_progress' | 'pending_customer' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  customer: string;
  assignee: string;
  createdAt: string;
  updatedAt: string;
}

const ModernDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalTickets: 0,
    openTickets: 0,
    urgentTickets: 0,
    resolvedToday: 0,
    avgResponseTime: '0m',
    customerSatisfaction: 0
  });

  const [recentTickets, setRecentTickets] = useState<RecentTicket[]>([]);
  const [loading, setLoading] = useState(true);

  // Simulate loading data
  useEffect(() => {
    const fetchData = async () => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setStats({
        totalTickets: 1247,
        openTickets: 34,
        urgentTickets: 7,
        resolvedToday: 12,
        avgResponseTime: '2h 15m',
        customerSatisfaction: 4.7
      });

      setRecentTickets([
        {
          id: 1234,
          title: 'Chemical compatibility issue with new batch',
          status: 'urgent' as any,
          priority: 'urgent',
          customer: 'ACME Corp',
          assignee: 'John Smith',
          createdAt: '2024-01-15T10:30:00Z',
          updatedAt: '2024-01-15T11:45:00Z'
        },
        {
          id: 1235,
          title: 'Request for COA documentation',
          status: 'in_progress',
          priority: 'medium',
          customer: 'TechCorp Inc',
          assignee: 'Sarah Johnson',
          createdAt: '2024-01-15T09:15:00Z',
          updatedAt: '2024-01-15T10:20:00Z'
        },
        {
          id: 1236,
          title: 'Shipping delay inquiry',
          status: 'new',
          priority: 'low',
          customer: 'Global Industries',
          assignee: 'Mike Davis',
          createdAt: '2024-01-15T08:45:00Z',
          updatedAt: '2024-01-15T08:45:00Z'
        }
      ]);

      setLoading(false);
    };

    fetchData();
  }, []);

  const statCards = [
    {
      title: 'Total Tickets',
      value: stats.totalTickets,
      icon: 'fas fa-ticket',
      color: 'text-primary',
      change: { value: 12, isPositive: true }
    },
    {
      title: 'Open Tickets',
      value: stats.openTickets,
      icon: 'fas fa-envelope-open',
      color: 'text-warning',
      change: { value: 5, isPositive: false }
    },
    {
      title: 'Urgent Tickets',
      value: stats.urgentTickets,
      icon: 'fas fa-exclamation-triangle',
      color: 'text-danger',
      change: { value: 2, isPositive: false }
    },
    {
      title: 'Resolved Today',
      value: stats.resolvedToday,
      icon: 'fas fa-check-circle',
      color: 'text-success',
      change: { value: 8, isPositive: true }
    },
    {
      title: 'Avg Response Time',
      value: stats.avgResponseTime,
      icon: 'fas fa-clock',
      color: 'text-secondary',
      change: { value: 15, isPositive: true }
    },
    {
      title: 'Customer Satisfaction',
      value: `${stats.customerSatisfaction}/5`,
      icon: 'fas fa-star',
      color: 'text-success',
      change: { value: 3, isPositive: true }
    }
  ];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Stats Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 bg-white/10 rounded-lg" />
                    <div className="w-16 h-6 bg-white/10 rounded" />
                  </div>
                  <div className="space-y-2">
                    <div className="w-20 h-4 bg-white/10 rounded" />
                    <div className="w-24 h-8 bg-white/10 rounded" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* Recent Tickets Skeleton */}
        <Card className="animate-pulse">
          <CardHeader>
            <div className="w-32 h-6 bg-white/10 rounded" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                  <div className="space-y-2">
                    <div className="w-48 h-4 bg-white/10 rounded" />
                    <div className="w-32 h-3 bg-white/10 rounded" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-6 bg-white/10 rounded" />
                    <div className="w-16 h-6 bg-white/10 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Welcome back! 👋</h1>
        <p className="text-white/70">Here's what's happening with your tickets today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((stat, index) => (
          <Card 
            key={index} 
            variant="glass" 
            className="hover:scale-105 transition-transform duration-200 cursor-pointer"
            interactive
            aria-label={`${stat.title}: ${stat.value}`}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={cn(
                  'w-12 h-12 rounded-lg flex items-center justify-center text-white text-xl',
                  'bg-gradient-to-br shadow-lg',
                  stat.color === 'text-primary' && 'from-primary to-primary-hover shadow-primary/30',
                  stat.color === 'text-warning' && 'from-warning to-warning-hover shadow-warning/30',
                  stat.color === 'text-danger' && 'from-danger to-danger-hover shadow-danger/30',
                  stat.color === 'text-success' && 'from-success to-success-hover shadow-success/30',
                  stat.color === 'text-secondary' && 'from-secondary to-secondary-hover shadow-secondary/30'
                )}>
                  <i className={stat.icon} />
                </div>
                
                {stat.change && (
                  <Badge 
                    variant={stat.change.isPositive ? 'success' : 'danger'}
                    className="text-xs"
                  >
                    <i className={`fas fa-arrow-${stat.change.isPositive ? 'up' : 'down'} mr-1`} />
                    {stat.change.value}%
                  </Badge>
                )}
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-white/70 mb-1">{stat.title}</h3>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Tickets */}
      <Card variant="glass">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle level={2}>Recent Tickets</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <a href="/tickets">View All</a>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table aria-label="Recent tickets">
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTickets.map((ticket) => (
                <TableRow 
                  key={ticket.id} 
                  interactive 
                  onClick={() => window.location.href = `/tickets/${ticket.id}`}
                  aria-label={`View ticket ${ticket.id}: ${ticket.title}`}
                >
                  <TableCell>
                    <div>
                      <div className="font-medium text-white">#{ticket.id}</div>
                      <div className="text-sm text-white/70 truncate max-w-xs">
                        {ticket.title}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-white/90">{ticket.customer}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={ticket.status} />
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={ticket.priority} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-secondary rounded-full flex items-center justify-center text-white text-xs">
                        {ticket.assignee.charAt(0)}
                      </div>
                      <span className="text-white/90">{ticket.assignee}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-white/70 text-sm">
                      {formatDate(ticket.updatedAt)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/tickets/${ticket.id}`;
                      }}
                      aria-label={`View ticket ${ticket.id}`}
                    >
                      <i className="fas fa-eye" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="outline" interactive className="hover:scale-105 transition-transform">
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center text-primary text-xl mx-auto mb-4">
              <i className="fas fa-plus" />
            </div>
            <h3 className="text-white font-medium mb-2">New Ticket</h3>
            <p className="text-white/60 text-sm">Create a new support ticket</p>
          </CardContent>
        </Card>

        <Card variant="outline" interactive className="hover:scale-105 transition-transform">
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 bg-success/20 rounded-lg flex items-center justify-center text-success text-xl mx-auto mb-4">
              <i className="fas fa-file-invoice-dollar" />
            </div>
            <h3 className="text-white font-medium mb-2">Generate Quote</h3>
            <p className="text-white/60 text-sm">Create a customer quote</p>
          </CardContent>
        </Card>

        <Card variant="outline" interactive className="hover:scale-105 transition-transform">
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 bg-warning/20 rounded-lg flex items-center justify-center text-warning text-xl mx-auto mb-4">
              <i className="fas fa-users" />
            </div>
            <h3 className="text-white font-medium mb-2">Manage Customers</h3>
            <p className="text-white/60 text-sm">View and edit customer data</p>
          </CardContent>
        </Card>

        <Card variant="outline" interactive className="hover:scale-105 transition-transform">
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 bg-secondary/20 rounded-lg flex items-center justify-center text-secondary text-xl mx-auto mb-4">
              <i className="fas fa-chart-bar" />
            </div>
            <h3 className="text-white font-medium mb-2">View Reports</h3>
            <p className="text-white/60 text-sm">Analytics and insights</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ModernDashboard;