'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signOut } from '@/lib/auth-client';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { CommandMenu, useCommandMenu } from '@/components/CommandMenu';
import { Kbd } from '@/components/ui/kbd';
import {
  LayoutDashboard,
  Ticket,
  Users,
  Plus,
  FileText,
  Settings,
  ChevronLeft,
  Search,
  LogOut,
  ExternalLink,
  ShoppingCart,
  Calculator,
  Truck,
  UserCog,
  Package,
  Sparkles,
  Wifi,
  WifiOff,
  Keyboard,
} from 'lucide-react';
import { useRealtime } from '@/hooks/useRealtime';

interface NavItemProps {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: number | string;
  badgeVariant?: 'default' | 'destructive' | 'warning';
  external?: boolean;
  isCollapsed: boolean;
  isActive: boolean;
}

function NavItem({
  href,
  icon: Icon,
  label,
  badge,
  badgeVariant = 'default',
  external = false,
  isCollapsed,
  isActive,
}: NavItemProps) {
  const content = (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
        isActive
          ? 'bg-white/[0.08] text-white'
          : 'text-white/60 hover:bg-white/[0.04] hover:text-white'
      )}
    >
      <Icon className={cn('h-4 w-4 flex-shrink-0', isActive ? 'text-indigo-400' : '')} />
      {!isCollapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {badge !== undefined && (
            <Badge
              variant="outline"
              className={cn(
                'ml-auto h-5 min-w-[20px] justify-center px-1.5 text-[10px] font-medium',
                badgeVariant === 'destructive' && 'border-red-500/30 bg-red-500/15 text-red-400',
                badgeVariant === 'warning' && 'border-amber-500/30 bg-amber-500/15 text-amber-400',
                badgeVariant === 'default' && 'border-white/10 bg-white/[0.06] text-white/60'
              )}
            >
              {badge}
            </Badge>
          )}
          {external && (
            <ExternalLink className="h-3 w-3 text-white/30 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </>
      )}
    </div>
  );

  if (isCollapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          {external ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {content}
            </a>
          ) : (
            <Link href={href}>{content}</Link>
          )}
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2 bg-[#1c2128] border-white/10">
          {label}
          {badge !== undefined && (
            <Badge variant="outline" className="h-4 px-1 text-[10px]">
              {badge}
            </Badge>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return <Link href={href}>{content}</Link>;
}

export default function Sidebar() {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'manager' | 'user' | null>(null);
  const { open: commandOpen, setOpen: setCommandOpen } = useCommandMenu();
  const { isConnected: isRealtimeConnected } = useRealtime();

  const isAdmin = userRole === 'admin';
  const isAuthenticated = !!session?.user;

  useEffect(() => {
    const fetchUserRole = async () => {
      if (session?.user?.id) {
        try {
          const response = await fetch('/api/auth/user-role');
          if (response.ok) {
            const data = await response.json();
            setUserRole(data.role);
          }
        } catch (error) {
          console.error('Failed to fetch user role:', error);
        }
      }
    };
    fetchUserRole();
  }, [session?.user?.id]);

  const isActive = (href: string) => pathname === href;
  const isPartiallyActive = (href: string) => pathname?.startsWith(href) && pathname !== '/';

  const handleLogout = async () => {
    try {
      await signOut({
        fetchOptions: {
          onSuccess: () => router.push('/'),
        },
      });
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  if (isPending) {
    return (
      <aside
        className={cn(
          'sticky top-0 h-screen flex-shrink-0 border-r border-white/[0.06] bg-[#0a0d12] z-50 flex items-center justify-center transition-all duration-300',
          isCollapsed ? 'w-16' : 'w-60'
        )}
      >
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-indigo-500" />
      </aside>
    );
  }

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'sticky top-0 h-screen flex-shrink-0 border-r border-white/[0.06] bg-[#0a0d12] z-50 flex flex-col transition-all duration-300',
          isCollapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* Command Menu */}
        <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />

        {/* Collapse Toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-6 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.08] bg-[#0a0d12] text-white/40 transition-colors hover:bg-[#161b22] hover:text-white/70"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft
            className={cn('h-3.5 w-3.5 transition-transform duration-300', isCollapsed && 'rotate-180')}
          />
        </button>

        {/* Header */}
        <div className="flex h-14 items-center gap-3 border-b border-white/[0.06] px-4">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold text-white">Alliance</h1>
              <p className="text-[11px] text-white/40">Ticket System</p>
            </div>
          )}
        </div>

        {/* Search Trigger */}
        {isAuthenticated && (
          <div className="px-3 py-3">
            <button
              onClick={() => setCommandOpen(true)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm text-white/40 transition-colors hover:border-white/[0.1] hover:bg-white/[0.04] hover:text-white/60',
                isCollapsed && 'justify-center px-2'
              )}
            >
              <Search className="h-4 w-4 flex-shrink-0" />
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-left">Search...</span>
                  <Kbd>
                    <span className="text-xs">⌘</span>K
                  </Kbd>
                </>
              )}
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {isAuthenticated ? (
            <>
              {/* Main Nav */}
              <NavItem
                href="/dashboard"
                icon={LayoutDashboard}
                label="Dashboard"
                isCollapsed={isCollapsed}
                isActive={isActive('/dashboard')}
              />
              <NavItem
                href="/tickets"
                icon={Ticket}
                label="Tickets"
                isCollapsed={isCollapsed}
                isActive={isPartiallyActive('/tickets')}
              />
              <NavItem
                href="/customers"
                icon={Users}
                label="Customers"
                isCollapsed={isCollapsed}
                isActive={isPartiallyActive('/customers')}
              />

              {/* Quick Actions */}
              <div className="pt-4">
                {!isCollapsed && (
                  <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-wider text-white/30">
                    Quick Actions
                  </p>
                )}
                <NavItem
                  href="/tickets/create"
                  icon={Plus}
                  label="New Ticket"
                  isCollapsed={isCollapsed}
                  isActive={isActive('/tickets/create')}
                />
                <NavItem
                  href="/admin/quotes/create"
                  icon={FileText}
                  label="New Quote"
                  isCollapsed={isCollapsed}
                  isActive={isActive('/admin/quotes/create')}
                />
              </div>

              {/* External Links */}
              <div className="pt-4">
                {!isCollapsed && (
                  <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-wider text-white/30">
                    External
                  </p>
                )}
                <NavItem
                  href="https://admin.shopify.com"
                  icon={ShoppingCart}
                  label="Shopify"
                  external
                  isCollapsed={isCollapsed}
                  isActive={false}
                />
                <NavItem
                  href="https://c21.qbo.intuit.com"
                  icon={Calculator}
                  label="QuickBooks"
                  external
                  isCollapsed={isCollapsed}
                  isActive={false}
                />
                <NavItem
                  href="https://ship.shipstation.com/"
                  icon={Truck}
                  label="ShipStation"
                  external
                  isCollapsed={isCollapsed}
                  isActive={false}
                />
              </div>

              {/* Admin */}
              {isAdmin && (
                <div className="pt-4">
                  {!isCollapsed && (
                    <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-wider text-white/30">
                      Admin
                    </p>
                  )}
                  <NavItem
                    href="/admin/manage-users"
                    icon={UserCog}
                    label="Users"
                    isCollapsed={isCollapsed}
                    isActive={isActive('/admin/manage-users')}
                  />
                  <NavItem
                    href="/admin/orders"
                    icon={Package}
                    label="Orders"
                    isCollapsed={isCollapsed}
                    isActive={isActive('/admin/orders')}
                  />
                  <NavItem
                    href="/admin/settings"
                    icon={Settings}
                    label="Settings"
                    isCollapsed={isCollapsed}
                    isActive={isActive('/admin/settings')}
                  />
                </div>
              )}
            </>
          ) : (
            <NavItem
              href="/auth/signin"
              icon={LogOut}
              label="Sign In"
              isCollapsed={isCollapsed}
              isActive={isActive('/auth/signin')}
            />
          )}
        </nav>

        {/* Status & User Section */}
        {isAuthenticated && (
          <div className="border-t border-white/[0.06] p-3">
            {/* Status Indicators */}
            <div className={cn(
              'mb-3 flex items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-2',
              isCollapsed && 'justify-center px-2'
            )}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5">
                    {isRealtimeConnected ? (
                      <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                    )}
                    {!isCollapsed && (
                      <span className={cn(
                        'text-[10px]',
                        isRealtimeConnected ? 'text-emerald-400' : 'text-amber-400'
                      )}>
                        {isRealtimeConnected ? 'Live' : 'Offline'}
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-[#1c2128] border-white/10">
                  {isRealtimeConnected ? 'Real-time updates active' : 'Reconnecting...'}
                </TooltipContent>
              </Tooltip>

              {!isCollapsed && (
                <>
                  <div className="h-3 w-px bg-white/10" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          // Dispatch to keyboard shortcuts provider
                          const event = new KeyboardEvent('keydown', { key: '?', shiftKey: true });
                          document.dispatchEvent(event);
                        }}
                        className="flex items-center gap-1.5 text-white/40 hover:text-white/60"
                      >
                        <Keyboard className="h-3.5 w-3.5" />
                        <Kbd className="text-[9px]">?</Kbd>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="bg-[#1c2128] border-white/10">
                      Keyboard shortcuts
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>

            {/* User Info */}
            <div
              className={cn(
                'flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/[0.04]',
                isCollapsed && 'justify-center'
              )}
            >
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback className="bg-white/[0.08] text-xs font-medium text-white/70">
                  {session?.user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white/90">
                    {session?.user?.name || 'User'}
                  </p>
                  <p className="text-[11px] capitalize text-white/40">{userRole || 'User'}</p>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className={cn(
                'mt-2 w-full justify-start gap-2 text-white/50 hover:bg-red-500/10 hover:text-red-400',
                isCollapsed && 'justify-center px-2'
              )}
            >
              <LogOut className="h-4 w-4" />
              {!isCollapsed && <span>Sign out</span>}
            </Button>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}
