'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession, signOut } from '@/lib/auth-client';
import { usePathname, useRouter } from 'next/navigation';

export default function Sidebar() {
    const { data: session, isPending } = useSession();
    const pathname = usePathname();
    const router = useRouter();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    const [userRole, setUserRole] = useState<'admin' | 'manager' | 'user' | null>(null);
    const isAdmin = userRole === 'admin';
    const isManager = userRole === 'manager' || userRole === 'admin';
    const isAuthenticated = !!session?.user;

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

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    const isActive = (href: string) => pathname === href;
    const isPartiallyActive = (href: string) => pathname?.startsWith(href);

    const handleLogout = async () => {
        try {
            await signOut({
                fetchOptions: {
                    onSuccess: () => {
                        router.push('/');
                    },
                },
            });
        } catch (error) {
            console.error('Error during logout:', error);
        }
    };

    const formatTime = (date: Date) => date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const NavItem = ({ href, icon, label, partialMatch = false, external = false }: any) => {
        const active = partialMatch ? isPartiallyActive(href) : isActive(href);
        const commonClasses = "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200";
        const activeClasses = "bg-primary/10 text-primary font-semibold";
        const inactiveClasses = "text-foreground-muted hover:bg-white/10 hover:text-white";

        const content = (
            <>
                <i className={`w-5 text-center text-base fa-fw ${icon}`} />
                {!isCollapsed && <span className="truncate">{label}</span>}
            </>
        );

        if (external) {
            return (
                <a href={href} target="_blank" rel="noopener noreferrer" className={`${commonClasses} ${inactiveClasses}`}>
                    {content}
                </a>
            );
        }
        
        return (
            <Link href={href} className={`${commonClasses} ${active ? activeClasses : inactiveClasses}`}>
                {content}
            </Link>
        );
    };

    if (isPending) {
        return (
            <div className={`sticky top-0 h-screen flex-shrink-0 bg-background-secondary border-r border-white/10 z-50 flex items-center justify-center transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-72'}`}>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }
    
    return (
        <div className={`sticky top-0 h-screen flex-shrink-0 bg-background-secondary border-r border-white/10 z-50 flex flex-col transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-72'}`}>
            <button 
                className="absolute top-4 -right-3 w-7 h-7 bg-background-tertiary border border-white/10 rounded-full flex items-center justify-center text-foreground-muted hover:bg-primary/20 hover:text-white z-50"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <i className={`fas fa-chevron-left transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} />
            </button>

            {/* Logo */}
            <div className="flex items-center gap-4 p-4 border-b border-white/10 h-16">
                <Link href="/" className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary-hover flex-shrink-0">
                    <Image src="/assets/logo.png" alt="Logo" width={24} height={24} />
                </Link>
                {!isCollapsed && (
                    <div className="flex flex-col">
                        <span className="font-bold text-lg text-white">Alliance Chemical</span>
                        <span className="text-xs text-foreground-muted">Ticket System</span>
                    </div>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                {isAuthenticated ? (
                    <>
                        {/* Profile */}
                        <div className="pb-4 mb-4 border-b border-white/10">
                            <Link href="/profile" className={`flex items-center gap-3 p-2 rounded-lg transition-colors duration-200 ${isActive('/profile') ? 'bg-white/5' : 'hover:bg-white/5'}`}>
                                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary-hover text-white font-bold text-lg flex-shrink-0">
                                    {session?.user?.name?.charAt(0) || 'A'}
                                </div>
                                {!isCollapsed && (
                                    <div className="truncate">
                                        <p className="font-semibold text-white truncate">{session?.user?.name || session?.user?.email}</p>
                                        <p className="text-xs text-foreground-muted capitalize">{userRole || 'User'}</p>
                                    </div>
                                )}
                            </Link>
                        </div>

                        {/* Menu */}
                        <div className="space-y-1">
                            <p className={`text-xs font-semibold uppercase text-foreground-muted px-3 pb-2 ${isCollapsed ? 'text-center' : ''}`}>Menu</p>
                            <NavItem href="/dashboard" icon="fa-home" label="Dashboard" />
                            <NavItem href="/tickets" icon="fa-list-alt" label="All Tickets" partialMatch={true} />
                            <NavItem href="/tickets/create" icon="fa-plus-circle" label="Create Ticket" />
                            <NavItem href="/admin/quotes/create" icon="fa-file-invoice" label="Create Quote" />
                        </div>
                        
                        {/* External Links */}
                        <div className="pt-4 space-y-1">
                            <p className={`text-xs font-semibold uppercase text-foreground-muted px-3 pb-2 ${isCollapsed ? 'text-center' : ''}`}>External</p>
                            <NavItem href="https://admin.shopify.com" icon="fa-shopify" label="Shopify" external={true} />
                            <NavItem href="https://c21.qbo.intuit.com" icon="fa-file-invoice-dollar" label="QuickBooks" external={true} />
                            <NavItem href="https://ship.shipstation.com/" icon="fa-shipping-fast" label="ShipStation" external={true} />
                        </div>

                        {/* Admin Section */}
                        {isAdmin && (
                            <div className="pt-4 space-y-1">
                                <p className={`text-xs font-semibold uppercase text-foreground-muted px-3 pb-2 ${isCollapsed ? 'text-center' : ''}`}>Admin</p>
                                <NavItem href="/admin/manage-users" icon="fa-users" label="Manage Users" />
                                <NavItem href="/admin/orders" icon="fa-box" label="Orders" />
                            </div>
                        )}
                    </>
                ) : (
                    <NavItem href="/auth/signin" icon="fa-sign-in-alt" label="Sign In" />
                )}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-white/10">
                {isAuthenticated ? (
                    <button onClick={handleLogout} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 text-foreground-muted hover:bg-danger/20 hover:text-danger ${isCollapsed ? 'justify-center' : ''}`}>
                        <i className="w-5 text-center text-base fa-fw fas fa-sign-out-alt" />
                        {!isCollapsed && <span className="truncate">Sign Out</span>}
                    </button>
                ) : null}
            </div>
        </div>
    );
}