'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signOut } from '@/lib/auth-client';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  Target,
  ListTodo,
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
        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon
        className={cn(
          'h-[18px] w-[18px] flex-shrink-0',
          isActive ? 'text-primary' : 'text-muted-foreground'
        )}
      />
      {!isCollapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {badge !== undefined && (
            <Badge
              variant="outline"
              className={cn(
                'ml-auto h-5 min-w-[20px] justify-center px-1.5 text-[10px] font-medium',
                badgeVariant === 'destructive' && 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-900/30 dark:text-red-300',
                badgeVariant === 'warning' && 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/30 dark:text-amber-300',
                badgeVariant === 'default' && 'border-border bg-muted text-muted-foreground'
              )}
            >
              {badge}
            </Badge>
          )}
          {external && (
            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
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
        <TooltipContent side="right" className="flex items-center gap-2 border border-border bg-popover text-popover-foreground shadow-sm">
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
          'sticky top-0 h-screen flex-shrink-0 border-r border-border bg-card z-50 flex items-center justify-center transition-all duration-300',
          isCollapsed ? 'w-[68px]' : 'w-64'
        )}
      >
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
      </aside>
    );
  }

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'sticky top-0 h-screen flex-shrink-0 border-r border-border bg-card z-50 flex flex-col transition-all duration-300',
          isCollapsed ? 'w-[68px]' : 'w-64'
        )}
      >
        {/* Command Menu */}
        <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />

        {/* Collapse Toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-7 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft
            className={cn('h-3.5 w-3.5 transition-transform duration-300', isCollapsed && 'rotate-180')}
          />
        </button>

        {/* Header */}
        <div className="flex h-16 items-center gap-3 border-b border-border/60 px-4">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold text-foreground">Alliance Chemical</h1>
              <p className="text-xs text-muted-foreground">Ticket System</p>
            </div>
          )}
        </div>

        {/* Search Trigger */}
        {isAuthenticated && (
          <div className="px-3 py-4">
            <button
              onClick={() => setCommandOpen(true)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
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
              <NavItem
                href="/crm"
                icon={Target}
                label="CRM"
                isCollapsed={isCollapsed}
                isActive={isActive('/crm')}
              />
              <NavItem
                href="/tasks"
                icon={ListTodo}
                label="Tasks"
                isCollapsed={isCollapsed}
                isActive={isActive('/tasks')}
              />

              {/* Quick Actions */}
              <div className="pt-6">
                {!isCollapsed && (
                  <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
              <div className="pt-6">
                {!isCollapsed && (
                  <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                <div className="pt-6">
                  {!isCollapsed && (
                    <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Admin
                    </p>
                  )}
                  <NavItem
                    href="/manage-users"
                    icon={UserCog}
                    label="Users"
                    isCollapsed={isCollapsed}
                    isActive={isActive('/manage-users')}
                  />
                  <NavItem
                    href="/admin/quarantine"
                    icon={Package}
                    label="Quarantine"
                    isCollapsed={isCollapsed}
                    isActive={isActive('/admin/quarantine')}
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
          <div className="border-t border-border/60 p-3">
            {/* Status Indicators */}
            <div
              className={cn(
                'mb-3 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2',
                isCollapsed && 'justify-center px-2'
              )}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5">
                    {isRealtimeConnected ? (
                      <Wifi className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    ) : (
                      <WifiOff className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    )}
                    {!isCollapsed && (
                      <span className={cn(
                        'text-[11px] font-medium',
                        isRealtimeConnected ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'
                      )}>
                        {isRealtimeConnected ? 'Live' : 'Offline'}
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="border border-border bg-popover text-popover-foreground shadow-sm">
                  {isRealtimeConnected ? 'Real-time updates active' : 'Reconnecting...'}
                </TooltipContent>
              </Tooltip>

              {!isCollapsed && (
                <>
                  <div className="h-3 w-px bg-border" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          const event = new KeyboardEvent('keydown', { key: '?', shiftKey: true });
                          document.dispatchEvent(event);
                        }}
                        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <Keyboard className="h-3.5 w-3.5" />
                        <Kbd className="text-[9px]">?</Kbd>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="border border-border bg-popover text-popover-foreground shadow-sm">
                      Keyboard shortcuts
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>

            {/* User Info */}
            <div
              className={cn(
                'flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/60',
                isCollapsed && 'justify-center'
              )}
            >
              <Avatar className="h-9 w-9 flex-shrink-0">
                <AvatarFallback className="bg-muted text-sm font-medium text-primary">
                  {session?.user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {session?.user?.name || 'User'}
                  </p>
                  <p className="text-xs capitalize text-muted-foreground">{userRole || 'User'}</p>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className={cn(
                'mt-2 w-full justify-start gap-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
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
