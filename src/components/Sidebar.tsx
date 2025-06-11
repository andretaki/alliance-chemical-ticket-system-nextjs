'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';

export default function Sidebar() {
    const { data: session, status } = useSession();
    const pathname = usePathname();
    const router = useRouter();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    const isAdmin = status === 'authenticated' && session?.user?.role === 'admin';
    const isAuthenticated = status === 'authenticated';

    // Update time every minute
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 60000);
        return () => clearInterval(timer);
    }, []);

    // Helper function to determine if a link is active
    const isActive = (href: string) => pathname === href;
    const isPartiallyActive = (href: string) => pathname?.startsWith(href);

    // Handle logout
    const handleLogout = async () => {
        try {
            await signOut({ 
                redirect: false,
                callbackUrl: '/'
            });
            router.push('/');
        } catch (error) {
            console.error('Error during logout:', error);
        }
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
    };

    if (status === 'loading') {
        return (
            <div className="sidebar-container loading">
                <div className="loading-content">
                    <div className="loading-spinner"></div>
                    <div className="loading-text">Loading...</div>
                </div>
                <style jsx>{`
                    .sidebar-container {
                        position: sticky;
                        top: 0;
                        height: 100vh;
                        flex-shrink: 0;
                        width: 320px;
                        background: var(--sidebar-bg);
                        border-right: 1px solid var(--sidebar-border);
                        z-index: 1000;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .loading-content {
                        text-align: center;
                        color: #6b7280;
                    }
                    .loading-spinner {
                        width: 32px;
                        height: 32px;
                        border: 2px solid #f3f4f6;
                        border-top: 2px solid #3b82f6;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin: 0 auto 1rem;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    .loading-text {
                        font-size: 0.875rem;
                        font-weight: 500;
                    }
                `}</style>
            </div>
        );
    }

    // If not authenticated, show minimal sidebar
    if (!isAuthenticated) {
        return (
            <div className="sidebar-container">
                <div className="logo-section">
                    <Link href="/" className="logo-link">
                        <div className="logo-icon">
                            <Image src="/assets/logo.png" alt="Logo" width={32} height={32} />
                        </div>
                        <div className="logo-text">
                            <div className="company-name">Alliance Chemical</div>
                            <div className="system-name">Ticket System</div>
                        </div>
                    </Link>
                </div>

                <div className="nav-section">
                    <Link href="/auth/signin" className={`nav-item ${isActive('/auth/signin') ? 'active' : ''}`}>
                        <div className="nav-icon">
                            <i className="fas fa-sign-in-alt" />
                        </div>
                        <div className="nav-label">Sign In</div>
                    </Link>
                </div>

                <style jsx>{`
                    .sidebar-container {
                        position: sticky;
                        top: 0;
                        height: 100vh;
                        flex-shrink: 0;
                        width: 320px;
                        background: var(--sidebar-bg);
                        border-right: 1px solid var(--sidebar-border);
                        display: flex;
                        flex-direction: column;
                        z-index: 1000;
                    }
                    .logo-section {
                        padding: 2rem 1.5rem;
                        border-bottom: 1px solid #f3f4f6;
                    }
                    .logo-link {
                        display: flex;
                        align-items: center;
                        gap: 1rem;
                        text-decoration: none;
                        color: #111827;
                    }
                    .logo-icon {
                        width: 40px;
                        height: 40px;
                        background: #3b82f6;
                        border-radius: 8px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                    }
                    .company-name {
                        font-size: 1.125rem;
                        font-weight: 600;
                        margin-bottom: 0.125rem;
                        color: #111827;
                    }
                    .system-name {
                        font-size: 0.75rem;
                        color: #6b7280;
                        font-weight: 500;
                    }
                    .nav-section {
                        flex: 1;
                        padding: 2rem 1.5rem;
                    }
                    .nav-item {
                        display: flex;
                        align-items: center;
                        gap: 0.75rem;
                        padding: 0.75rem;
                        text-decoration: none;
                        color: var(--foreground-muted);
                        border-radius: 8px;
                        transition: all 0.15s ease;
                        font-weight: 500;
                    }
                    .nav-item:hover,
                    .nav-item.active {
                        background: var(--sidebar-hover);
                        color: var(--foreground);
                    }
                    .nav-icon {
                        width: 20px;
                        text-align: center;
                        font-size: 1rem;
                    }
                    .nav-label {
                        font-size: 0.875rem;
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div className={`sidebar-container ${isCollapsed ? 'collapsed' : ''}`}>
            {/* Clean Toggle Button */}
            <button 
                className="sidebar-toggle"
                onClick={() => setIsCollapsed(!isCollapsed)}
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
                <i className={`fas ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`} />
            </button>

            {/* Clean Logo Section */}
            <div className="logo-section">
                <Link href="/" className="logo-link">
                    <div className="logo-icon">
                        <Image src="/assets/logo.png" alt="Logo" width={32} height={32} />
                    </div>
                    {!isCollapsed && (
                        <div className="logo-text">
                            <div className="company-name">Alliance Chemical</div>
                            <div className="system-name">Ticket System</div>
                        </div>
                    )}
                </Link>
            </div>

            {/* User Profile and Main Navigation */}
            <nav className="nav-section">
                <div className="user-profile-item">
                    <Link href="/profile" className={`nav-item ${isActive('/profile') ? 'active' : ''}`}>
                        <div className="user-avatar-icon">
                            <span className="avatar-text">
                                {session?.user?.name?.charAt(0) || session?.user?.email?.charAt(0) || 'U'}
                            </span>
                        </div>
                        {!isCollapsed && (
                             <div className="user-info">
                                <div className="user-name">
                                    {session?.user?.name || session?.user?.email}
                                </div>
                                <div className="user-role">
                                    {session?.user?.role || 'User'}
                                </div>
                            </div>
                        )}
                    </Link>
                </div>

                <div className="nav-group">
                    <div className="nav-group-title">Menu</div>
                    <Link href="/dashboard" className={`nav-item ${isActive('/dashboard') ? 'active' : ''}`}>
                        <div className="nav-icon">
                            <i className="fas fa-home" />
                        </div>
                        {!isCollapsed && <span className="nav-label">Dashboard</span>}
                    </Link>

                    <Link href="/tickets" className={`nav-item ${isPartiallyActive('/tickets') && !isActive('/tickets/create') ? 'active' : ''}`}>
                        <div className="nav-icon">
                            <i className="fas fa-list-alt" />
                        </div>
                        {!isCollapsed && <span className="nav-label">All Tickets</span>}
                    </Link>

                    <Link href="/tickets/create" className={`nav-item ${isActive('/tickets/create') ? 'active' : ''}`}>
                        <div className="nav-icon">
                            <i className="fas fa-plus" />
                        </div>
                        {!isCollapsed && <span className="nav-label">Create Ticket</span>}
                    </Link>

                    <Link href="/admin/quotes/create" className={`nav-item ${isActive('/admin/quotes/create') ? 'active' : ''}`}>
                        <div className="nav-icon">
                            <i className="fas fa-file-invoice" />
                        </div>
                        {!isCollapsed && <span className="nav-label">Create Quote</span>}
                    </Link>
                </div>

                <div className="nav-group">
                    <div className="nav-group-title">External Links</div>
                    <a href="https://admin.shopify.com" target="_blank" rel="noopener noreferrer" className="nav-item">
                        <div className="nav-icon"><i className="fab fa-shopify" /></div>
                        <div className="nav-label">Shopify</div>
                    </a>
                    <a href="https://c21.qbo.intuit.com" target="_blank" rel="noopener noreferrer" className="nav-item">
                        <div className="nav-icon"><i className="fas fa-file-invoice-dollar" /></div>
                        <div className="nav-label">QuickBooks</div>
                    </a>
                    <a href="https://ship.shipstation.com/" target="_blank" rel="noopener noreferrer" className="nav-item">
                        <div className="nav-icon"><i className="fas fa-shipping-fast" /></div>
                        <div className="nav-label">ShipStation</div>
                    </a>
                </div>

                {/* Admin Section */}
                {isAdmin && (
                    <div className="nav-group admin-group">
                        <div className="nav-group-title">Admin</div>
                        
                        <Link href="/admin/manage-users" className={`nav-item ${isActive('/admin/manage-users') ? 'active' : ''}`}>
                            <div className="nav-icon">
                                <i className="fas fa-users" />
                            </div>
                            {!isCollapsed && <span className="nav-label">Manage Users</span>}
                        </Link>

                        <Link href="/admin/orders" className={`nav-item ${isActive('/admin/orders') ? 'active' : ''}`}>
                            <div className="nav-icon">
                                <i className="fas fa-box" />
                            </div>
                            {!isCollapsed && <span className="nav-label">Orders</span>}
                        </Link>
                    </div>
                )}
            </nav>

            {/* Bottom Section */}
            <div className="bottom-section">
                {!isCollapsed && (
                    <div className="time-display">
                        <i className="fas fa-clock" />
                        <span>{formatTime(currentTime)}</span>
                    </div>
                )}
                
                <button onClick={handleLogout} className="logout-button">
                    <i className="fas fa-sign-out-alt" />
                    {!isCollapsed && <span>Sign Out</span>}
                </button>
            </div>

            <style jsx>{`
                .sidebar-container {
                    position: sticky;
                    top: 0;
                    height: 100vh;
                    flex-shrink: 0;
                    width: 320px;
                    background: var(--sidebar-bg);
                    border-right: 1px solid var(--sidebar-border);
                    display: flex;
                    flex-direction: column;
                    z-index: 1000;
                    transition: width 0.2s ease;
                }

                .sidebar-container.collapsed {
                    width: 80px;
                }

                .sidebar-toggle {
                    position: absolute;
                    top: 1rem;
                    right: -12px;
                    width: 24px;
                    height: 24px;
                    background: var(--sidebar-bg);
                    border: 1px solid var(--sidebar-border);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    font-size: 0.75rem;
                    color: #6b7280;
                    z-index: 1001;
                    transition: all 0.15s ease;
                }

                .sidebar-toggle:hover {
                    background: var(--sidebar-hover);
                    color: var(--foreground);
                }

                .logo-section {
                    padding: 2rem 1.5rem 1.5rem;
                    border-bottom: 1px solid var(--sidebar-border);
                }

                .logo-link {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    text-decoration: none;
                    color: var(--foreground);
                }

                .logo-icon {
                    width: 40px;
                    height: 40px;
                    background: #3b82f6;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                .collapsed .logo-icon {
                    width: 32px;
                    height: 32px;
                }

                .company-name {
                    font-size: 1.125rem;
                    font-weight: 600;
                    margin-bottom: 0.125rem;
                    color: var(--foreground);
                }

                .system-name {
                    font-size: 0.75rem;
                    color: var(--foreground-muted);
                    font-weight: 500;
                }

                .user-section {
                    padding: 1rem 1.5rem;
                    border-bottom: 1px solid var(--sidebar-border);
                }

                .user-profile {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    text-decoration: none;
                    color: var(--foreground);
                    padding: 0.5rem;
                    border-radius: 8px;
                    transition: background-color 0.15s ease;
                    outline: none;
                }

                .user-profile:focus {
                    outline: none;
                    box-shadow: none;
                }

                .user-profile:hover, .user-profile.active {
                    background: var(--sidebar-hover);
                }

                .user-avatar {
                    width: 32px;
                    height: 32px;
                    background: #e5e7eb;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    text-align: left;
                }

                .user-avatar-icon {
                    width: 24px;
                    height: 24px;
                    background: var(--primary-light);
                    color: var(--primary);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    font-size: 0.8rem;
                    font-weight: 600;
                    margin-left: -4px; /* Align with nav-icons */
                    margin-right: 4px;
                }

                .user-profile-item {
                    padding: 0 0.75rem;
                    margin-bottom: 1rem;
                    border-bottom: 1px solid var(--sidebar-border);
                    padding-bottom: 1rem;
                }

                .user-profile-item .nav-item {
                    gap: 12px;
                    padding-left: 12px;
                }
                
                .user-info {
                    line-height: 1.2;
                }

                .avatar-text {
                    font-size: 0.875rem;
                    font-weight: 600;
                    color: var(--foreground-secondary);
                }

                .user-name {
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: var(--foreground);
                    margin-bottom: 0.125rem;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .user-role {
                    font-size: 0.75rem;
                    color: var(--foreground-muted);
                }

                .nav-section {
                    flex: 1;
                    padding: 1rem 1.5rem;
                    overflow-y: auto;
                }

                .nav-group {
                    margin-bottom: 1.5rem;
                }

                .nav-group:last-child {
                    margin-bottom: 0;
                }

                .nav-divider {
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--foreground-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin-bottom: 0.5rem;
                    padding: 0 0.75rem;
                }

                .nav-item {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.75rem;
                    text-decoration: none;
                    color: var(--foreground-muted);
                    border-radius: 8px;
                    transition: all 0.15s ease;
                    font-weight: 500;
                    margin-bottom: 0.25rem;
                }

                .nav-item:hover {
                    background: var(--sidebar-hover);
                    color: var(--foreground);
                }

                .nav-item.active {
                    position: relative;
                    background: var(--sidebar-active);
                    color: var(--foreground);
                    font-weight: 600;
                }
                
                .nav-item.active::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 4px;
                    height: 24px;
                    background: #a3bffa;
                    border-radius: 0 4px 4px 0;
                }

                .nav-icon {
                    width: 20px;
                    text-align: center;
                    font-size: 1rem;
                    flex-shrink: 0;
                }

                .nav-label {
                    font-size: 0.875rem;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .nav-item-wrapper {
                    margin-bottom: 0.25rem;
                }

                .bottom-section {
                    padding: 1rem 1.5rem;
                    border-top: 1px solid var(--sidebar-border);
                }

                .time-display {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    font-size: 0.875rem;
                    color: var(--foreground-muted);
                    padding: 0.75rem;
                    border-radius: 8px;
                    margin-bottom: 0.5rem;
                    font-weight: 500;
                }

                .logout-button {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    width: 100%;
                    padding: 0.75rem;
                    text-decoration: none;
                    color: var(--foreground-muted);
                    border-radius: 8px;
                    transition: all 0.15s ease;
                    font-weight: 500;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    font-family: inherit;
                    font-size: inherit;
                    text-align: left;
                }

                .logout-button:hover {
                    background: var(--sidebar-hover);
                    color: var(--foreground);
                }
                
                .logout-button i {
                    width: 20px;
                    text-align: center;
                    font-size: 1rem;
                }

                /* Collapsed state adjustments */
                .collapsed .logo-section,
                .collapsed .user-section,
                .collapsed .nav-section,
                .collapsed .bottom-section {
                    padding-left: 1rem;
                    padding-right: 1rem;
                }

                .collapsed .nav-item,
                .collapsed .user-profile,
                .collapsed .logout-button {
                    justify-content: center;
                    padding: 0.75rem;
                }

                .collapsed .user-profile-item {
                    padding-left: 0;
                    padding-right: 0;
                }

                .collapsed .user-avatar-icon {
                    margin: 0;
                }

                .collapsed .time-display {
                    justify-content: center;
                    padding: 0.5rem;
                }

                /* Responsive */
                @media (max-width: 768px) {
                    .sidebar-container {
                        transform: translateX(-100%);
                        transition: transform 0.3s ease;
                    }

                    .sidebar-container.mobile-open {
                        transform: translateX(0);
                    }
                }
            `}</style>
        </div>
    );
} 