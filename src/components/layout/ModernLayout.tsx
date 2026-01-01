'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@/lib/auth-client';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui';

interface ModernLayoutProps {
  children: React.ReactNode;
}

interface SidebarItem {
  href: string;
  label: string;
  icon: string;
  badge?: string;
  isActive?: boolean;
  subItems?: SidebarItem[];
}

const ModernLayout: React.FC<ModernLayoutProps> = ({ children }) => {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [userRole, setUserRole] = useState<'admin' | 'manager' | 'user' | null>(null);
  const isAdmin = userRole === 'admin';
  const isManager = userRole === 'manager' || userRole === 'admin';

  // Fetch user role from database
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

  const sidebarItems: SidebarItem[] = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: 'fas fa-home',
      isActive: pathname === '/dashboard'
    },
    {
      href: '/tickets',
      label: 'Tickets',
      icon: 'fas fa-ticket',
      badge: '5',
      isActive: pathname?.startsWith('/tickets') || false
    },
    {
      href: '/quotes',
      label: 'Quotes',
      icon: 'fas fa-file-invoice-dollar',
      isActive: pathname?.startsWith('/quotes') || false
    },
    {
      href: '/customers',
      label: 'Customers',
      icon: 'fas fa-users',
      isActive: pathname?.startsWith('/customers') || false
    },
    ...(isManager ? [{
      href: '/reports',
      label: 'Reports',
      icon: 'fas fa-chart-bar',
      isActive: pathname?.startsWith('/reports') || false
    }] : []),
    ...(isAdmin ? [{
      href: '/admin',
      label: 'Administration',
      icon: 'fas fa-cog',
      isActive: pathname?.startsWith('/admin') || false,
      subItems: [
        { href: '/admin/users', label: 'Users', icon: 'fas fa-user-cog', isActive: pathname === '/admin/users' },
        { href: '/admin/settings', label: 'Settings', icon: 'fas fa-sliders-h', isActive: pathname === '/admin/settings' },
        { href: '/admin/integrations', label: 'Integrations', icon: 'fas fa-plug', isActive: pathname === '/admin/integrations' }
      ]
    }] : [])
  ];

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 transition-all duration-300 ease-in-out',
          'bg-white border-r border-gray-200 dark:bg-gray-900/95 dark:backdrop-blur-xl dark:border-gray-700',
          'lg:translate-x-0',
          sidebarCollapsed ? 'w-16' : 'w-64',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        aria-label="Main navigation"
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 text-gray-900 dark:text-white font-bold text-lg"
              aria-label="Alliance Chemical Ticket System"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary-hover rounded-lg flex items-center justify-center">
                <i className="fas fa-ticket text-white" />
              </div>
              {!sidebarCollapsed && <span>Alliance Chemical</span>}
            </Link>

            {/* Collapse Toggle (Desktop) */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:flex w-8 h-8 items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 dark:hover:bg-gray-800 dark:text-gray-400 dark:hover:text-white transition-colors"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <i className={`fas fa-angle-${sidebarCollapsed ? 'right' : 'left'}`} />
            </button>

            {/* Close Button (Mobile) */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 dark:hover:bg-gray-800 dark:text-gray-400 dark:hover:text-white transition-colors"
              aria-label="Close sidebar"
            >
              <i className="fas fa-times" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto" aria-label="Main navigation">
            {sidebarItems.map((item) => (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                    'hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-ring',
                    item.isActive
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-gray-800 dark:text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                  )}
                  aria-current={item.isActive ? 'page' : undefined}
                >
                  <i className={`${item.icon} w-5 flex-shrink-0`} aria-hidden="true" />
                  {!sidebarCollapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {item.badge && (
                        <span className="bg-primary text-white text-xs px-2 py-1 rounded-full">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </Link>

                {/* Sub Items */}
                {item.subItems && !sidebarCollapsed && item.isActive && (
                  <div className="ml-8 mt-2 space-y-1">
                    {item.subItems.map((subItem) => (
                      <Link
                        key={subItem.href}
                        href={subItem.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200',
                          'hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-ring',
                          subItem.isActive
                            ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white'
                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                        )}
                        aria-current={subItem.isActive ? 'page' : undefined}
                      >
                        <i className={`${subItem.icon} w-4 flex-shrink-0`} aria-hidden="true" />
                        <span>{subItem.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          {/* User Menu */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-gradient-to-br from-secondary to-secondary-hover rounded-full flex items-center justify-center text-white text-sm font-semibold">
                {session?.user?.name?.charAt(0) || 'U'}
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 dark:text-white text-sm font-medium truncate">
                    {session?.user?.name || 'User'}
                  </p>
                  <p className="text-gray-500 dark:text-gray-400 text-xs truncate">
                    {session?.user?.email}
                  </p>
                </div>
              )}
            </div>
            
            {!sidebarCollapsed && (
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  leftIcon={<i className="fas fa-user" />}
                  asChild
                >
                  <Link href="/profile">Profile</Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  leftIcon={<i className="fas fa-sign-out-alt" />}
                  onClick={() => {
                    // Handle logout
                  }}
                >
                  Logout
                </Button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className={cn(
        'transition-all duration-300 ease-in-out',
        sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
      )}>
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-gray-200 dark:bg-gray-900/95 dark:backdrop-blur-xl dark:border-gray-700 flex items-center justify-between px-4">
          <div className="flex items-center gap-4">
            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 dark:hover:bg-gray-800 dark:text-gray-400 dark:hover:text-white transition-colors"
              aria-label="Open sidebar"
            >
              <i className="fas fa-bars" />
            </button>

            {/* Page Title */}
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {sidebarItems.find(item => item.isActive)?.label || 'Dashboard'}
            </h1>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<i className="fas fa-plus" />}
            >
              New Ticket
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<i className="fas fa-bell" />}
            >
              <span className="sr-only">Notifications</span>
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default ModernLayout;