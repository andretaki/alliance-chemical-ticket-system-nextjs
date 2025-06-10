'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import ProcessEmailsSidebarButton from './ProcessEmailsSidebarButton';

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
                        position: fixed;
                        left: 0;
                        top: 0;
                        bottom: 0;
                        width: 280px;
                        background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
                        border-right: 1px solid rgba(148, 163, 184, 0.2);
                        z-index: 1000;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .loading-content {
                        text-align: center;
                        color: #e2e8f0;
                    }
                    .loading-spinner {
                        width: 40px;
                        height: 40px;
                        border: 3px solid rgba(148, 163, 184, 0.3);
                        border-top: 3px solid #3b82f6;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin: 0 auto 1rem;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    .loading-text {
                        font-size: 0.9rem;
                        opacity: 0.8;
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
                    <div className="section-title">Authentication</div>
                    <Link href="/auth/signin" className={`nav-item ${isActive('/auth/signin') ? 'active' : ''}`}>
                        <div className="nav-icon">
                            <i className="fas fa-sign-in-alt" />
                        </div>
                        <div className="nav-content">
                            <div className="nav-label">Sign In</div>
                            <div className="nav-description">Access your account</div>
                        </div>
                    </Link>
                </div>
                <style jsx>{`
                    .sidebar-container {
                        position: fixed;
                        left: 0;
                        top: 0;
                        bottom: 0;
                        width: 280px;
                        background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
                        border-right: 1px solid rgba(148, 163, 184, 0.2);
                        display: flex;
                        flex-direction: column;
                        z-index: 1000;
                    }
                    .logo-section {
                        padding: 2rem 1.5rem;
                        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
                    }
                    .logo-link {
                        display: flex;
                        align-items: center;
                        gap: 1rem;
                        text-decoration: none;
                        color: #f8fafc;
                        transition: transform 0.2s ease;
                    }
                    .logo-link:hover {
                        transform: translateY(-1px);
                    }
                    .logo-icon {
                        width: 40px;
                        height: 40px;
                        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                        border-radius: 10px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
                    }
                    .logo-text {
                        flex: 1;
                    }
                    .company-name {
                        font-size: 1.1rem;
                        font-weight: 600;
                        margin-bottom: 0.25rem;
                        color: #f8fafc;
                    }
                    .system-name {
                        font-size: 0.8rem;
                        color: #94a3b8;
                        font-weight: 400;
                    }
                    .nav-section {
                        flex: 1;
                        padding: 1.5rem 1rem;
                    }
                    .section-title {
                        font-size: 0.75rem;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                        color: #64748b;
                        margin-bottom: 1rem;
                        padding: 0 0.5rem;
                    }
                    .nav-item {
                        display: flex;
                        align-items: center;
                        gap: 1rem;
                        padding: 1rem;
                        text-decoration: none;
                        color: #cbd5e1;
                        border-radius: 10px;
                        transition: all 0.2s ease;
                        margin-bottom: 0.5rem;
                    }
                    .nav-item:hover,
                    .nav-item.active {
                        background: rgba(59, 130, 246, 0.15);
                        color: #f8fafc;
                        transform: translateX(4px);
                    }
                    .nav-icon {
                        width: 36px;
                        height: 36px;
                        background: rgba(148, 163, 184, 0.1);
                        border-radius: 8px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                        transition: all 0.2s ease;
                    }
                    .nav-item:hover .nav-icon,
                    .nav-item.active .nav-icon {
                        background: rgba(59, 130, 246, 0.2);
                        transform: scale(1.05);
                    }
                    .nav-content {
                        flex: 1;
                    }
                    .nav-label {
                        font-weight: 500;
                        margin-bottom: 0.25rem;
                        font-size: 0.9rem;
                    }
                    .nav-description {
                        font-size: 0.8rem;
                        opacity: 0.7;
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div className={`sidebar-container ${isCollapsed ? 'collapsed' : ''}`}>
            {/* Toggle Button */}
            <button 
                className="sidebar-toggle"
                onClick={() => setIsCollapsed(!isCollapsed)}
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
                <i className={`fas ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`} />
            </button>

            {/* Logo Section */}
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

            {/* Time Display */}
            {!isCollapsed && (
                <div className="time-section">
                    <div className="time-display">
                        <i className="fas fa-clock" />
                        <span>{formatTime(currentTime)}</span>
                    </div>
                    <div className="status-dot" />
                </div>
            )}

            {/* User Profile */}
            <div className="user-section">
                <Link href="/profile" className="user-profile">
                    <div className="user-avatar">
                        {session?.user?.name?.charAt(0) || session?.user?.email?.charAt(0) || 'U'}
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

            {/* Main Navigation */}
            <nav className="nav-section">
                <div className="nav-group">
                    {!isCollapsed && (
                        <div className="section-title">Navigation</div>
                    )}
                    
                    <Link href="/dashboard" className={`nav-item ${isActive('/dashboard') ? 'active' : ''}`}>
                        <div className="nav-icon">
                            <i className="fas fa-home" />
                        </div>
                        {!isCollapsed && (
                            <div className="nav-content">
                                <div className="nav-label">Dashboard</div>
                                <div className="nav-description">Overview & stats</div>
                            </div>
                        )}
                    </Link>

                    <Link href="/tickets" className={`nav-item ${isPartiallyActive('/tickets') && !isActive('/tickets/create') ? 'active' : ''}`}>
                        <div className="nav-icon">
                            <i className="fas fa-list-alt" />
                        </div>
                        {!isCollapsed && (
                            <div className="nav-content">
                                <div className="nav-label">All Tickets</div>
                                <div className="nav-description">Browse & manage</div>
                            </div>
                        )}
                    </Link>

                    <Link href="/tickets/create" className={`nav-item ${isActive('/tickets/create') ? 'active' : ''}`}>
                        <div className="nav-icon">
                            <i className="fas fa-plus-circle" />
                        </div>
                        {!isCollapsed && (
                            <div className="nav-content">
                                <div className="nav-label">Create Ticket</div>
                                <div className="nav-description">New support request</div>
                            </div>
                        )}
                    </Link>

                    <Link href="/admin/quotes/create" className={`nav-item ${isActive('/admin/quotes/create') ? 'active' : ''}`}>
                        <div className="nav-icon">
                            <i className="fas fa-file-invoice-dollar" />
                        </div>
                        {!isCollapsed && (
                            <div className="nav-content">
                                <div className="nav-label">Create Quote</div>
                                <div className="nav-description">Generate estimates</div>
                            </div>
                        )}
                    </Link>
                </div>
            </nav>

            {/* Email Processing */}
            {!isCollapsed && (
                <div className="email-section">
                    <ProcessEmailsSidebarButton />
                </div>
            )}

            {/* Admin Section */}
            {isAdmin && (
                <div className="admin-section">
                    {!isCollapsed && (
                        <div className="section-title admin-title">
                            <i className="fas fa-crown" />
                            Admin Tools
                        </div>
                    )}
                    
                    <Link href="/manage-users" className={`nav-item admin-item ${isActive('/manage-users') ? 'active' : ''}`}>
                        <div className="nav-icon">
                            <i className="fas fa-users-cog" />
                        </div>
                        {!isCollapsed && (
                            <div className="nav-content">
                                <div className="nav-label">Manage Users</div>
                                <div className="nav-description">User administration</div>
                            </div>
                        )}
                    </Link>

                    <Link href="/admin/email-processing" className={`nav-item admin-item ${isActive('/admin/email-processing') ? 'active' : ''}`}>
                        <div className="nav-icon">
                            <i className="fas fa-envelope-open-text" />
                        </div>
                        {!isCollapsed && (
                            <div className="nav-content">
                                <div className="nav-label">Email Processing</div>
                                <div className="nav-description">Email automation</div>
                            </div>
                        )}
                    </Link>
                </div>
            )}

            {/* Logout Section */}
            <div className="logout-section">
                <button onClick={handleLogout} className="logout-button">
                    <div className="logout-icon">
                        <i className="fas fa-sign-out-alt" />
                    </div>
                    {!isCollapsed && (
                        <div className="logout-content">
                            <div className="logout-label">Logout</div>
                            <div className="logout-description">Sign out securely</div>
                        </div>
                    )}
                </button>
            </div>

            <style jsx>{`
                .sidebar-container {
                    position: fixed;
                    left: 0;
                    top: 0;
                    bottom: 0;
                    width: 280px;
                    background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
                    border-right: 1px solid rgba(148, 163, 184, 0.2);
                    display: flex;
                    flex-direction: column;
                    transition: width 0.3s ease;
                    z-index: 1000;
                    overflow: hidden;
                }

                .sidebar-container.collapsed {
                    width: 70px;
                }

                .sidebar-toggle {
                    position: absolute;
                    right: -12px;
                    top: 20px;
                    width: 24px;
                    height: 24px;
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                    border: none;
                    border-radius: 50%;
                    color: white;
                    font-size: 0.7rem;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
                }

                .sidebar-toggle:hover {
                    transform: scale(1.1);
                    box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
                }

                .logo-section {
                    padding: 1.5rem;
                    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
                    background: rgba(248, 250, 252, 0.02);
                }

                .logo-link {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    text-decoration: none;
                    color: #f8fafc;
                    transition: transform 0.2s ease;
                }

                .logo-link:hover {
                    transform: translateY(-1px);
                }

                .logo-icon {
                    width: 40px;
                    height: 40px;
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
                }

                .logo-text {
                    flex: 1;
                    min-width: 0;
                }

                .company-name {
                    font-size: 1.1rem;
                    font-weight: 600;
                    margin-bottom: 0.25rem;
                    line-height: 1.2;
                    color: #f8fafc;
                }

                .system-name {
                    font-size: 0.8rem;
                    color: #94a3b8;
                    font-weight: 400;
                }

                .time-section {
                    padding: 1rem 1.5rem;
                    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: rgba(248, 250, 252, 0.02);
                }

                .time-display {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    color: #cbd5e1;
                    font-size: 0.85rem;
                    font-weight: 500;
                }

                .time-display i {
                    color: #3b82f6;
                }

                .status-dot {
                    width: 8px;
                    height: 8px;
                    background: #10b981;
                    border-radius: 50%;
                    animation: pulse 2s ease-in-out infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }

                .user-section {
                    padding: 1.5rem;
                    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
                }

                .user-profile {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    text-decoration: none;
                    color: #f8fafc;
                    padding: 0.75rem;
                    border-radius: 10px;
                    transition: all 0.2s ease;
                    background: rgba(248, 250, 252, 0.02);
                }

                .user-profile:hover {
                    background: rgba(59, 130, 246, 0.1);
                    transform: translateY(-1px);
                }

                .user-avatar {
                    width: 40px;
                    height: 40px;
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 600;
                    color: white;
                    font-size: 1rem;
                    flex-shrink: 0;
                    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
                }

                .user-info {
                    flex: 1;
                    min-width: 0;
                }

                .user-name {
                    font-weight: 500;
                    font-size: 0.9rem;
                    margin-bottom: 0.25rem;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    color: #f8fafc;
                }

                .user-role {
                    font-size: 0.75rem;
                    color: #94a3b8;
                    text-transform: capitalize;
                    font-weight: 400;
                }

                .nav-section {
                    flex: 1;
                    padding: 1rem;
                    overflow-y: auto;
                }

                .nav-group {
                    margin-bottom: 1rem;
                }

                .section-title {
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #64748b;
                    margin-bottom: 1rem;
                    padding: 0 0.5rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                .admin-title {
                    color: #f59e0b;
                }

                .nav-item {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 0.875rem;
                    text-decoration: none;
                    color: #cbd5e1;
                    border-radius: 10px;
                    transition: all 0.2s ease;
                    margin-bottom: 0.5rem;
                    position: relative;
                }

                .nav-item:hover {
                    background: rgba(59, 130, 246, 0.1);
                    color: #f8fafc;
                    transform: translateX(4px);
                }

                .nav-item.active {
                    background: rgba(59, 130, 246, 0.2);
                    color: #f8fafc;
                    border-left: 3px solid #3b82f6;
                }

                .nav-icon {
                    width: 36px;
                    height: 36px;
                    background: rgba(148, 163, 184, 0.1);
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    transition: all 0.2s ease;
                }

                .nav-item:hover .nav-icon,
                .nav-item.active .nav-icon {
                    background: rgba(59, 130, 246, 0.2);
                    transform: scale(1.05);
                }

                .nav-content {
                    flex: 1;
                    min-width: 0;
                }

                .nav-label {
                    font-weight: 500;
                    font-size: 0.9rem;
                    margin-bottom: 0.25rem;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .nav-description {
                    font-size: 0.75rem;
                    opacity: 0.7;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .admin-section {
                    padding: 1rem;
                    border-top: 1px solid rgba(148, 163, 184, 0.2);
                    background: rgba(245, 158, 11, 0.05);
                }

                .admin-item {
                    border-left: 3px solid transparent;
                }

                .admin-item:hover {
                    background: rgba(245, 158, 11, 0.1);
                    border-left-color: #f59e0b;
                }

                .admin-item.active {
                    background: rgba(245, 158, 11, 0.2);
                    border-left-color: #f59e0b;
                }

                .admin-item:hover .nav-icon,
                .admin-item.active .nav-icon {
                    background: rgba(245, 158, 11, 0.2);
                }

                .email-section {
                    padding: 1rem 1.5rem;
                    border-top: 1px solid rgba(148, 163, 184, 0.2);
                }

                .logout-section {
                    padding: 1.5rem;
                    margin-top: auto;
                    border-top: 1px solid rgba(148, 163, 184, 0.2);
                }

                .logout-button {
                    width: 100%;
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.2);
                    color: #fca5a5;
                    padding: 0.875rem;
                    border-radius: 10px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }

                .logout-button:hover {
                    background: rgba(239, 68, 68, 0.2);
                    border-color: rgba(239, 68, 68, 0.4);
                    color: white;
                    transform: translateY(-1px);
                }

                .logout-icon {
                    width: 36px;
                    height: 36px;
                    background: rgba(239, 68, 68, 0.2);
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    transition: all 0.2s ease;
                }

                .logout-button:hover .logout-icon {
                    background: rgba(239, 68, 68, 0.4);
                    transform: scale(1.05);
                }

                .logout-content {
                    flex: 1;
                    text-align: left;
                }

                .logout-label {
                    font-weight: 500;
                    font-size: 0.9rem;
                    margin-bottom: 0.25rem;
                }

                .logout-description {
                    font-size: 0.75rem;
                    opacity: 0.7;
                }

                /* Scrollbar Styling */
                .nav-section::-webkit-scrollbar {
                    width: 4px;
                }

                .nav-section::-webkit-scrollbar-track {
                    background: rgba(148, 163, 184, 0.1);
                    border-radius: 2px;
                }

                .nav-section::-webkit-scrollbar-thumb {
                    background: rgba(148, 163, 184, 0.3);
                    border-radius: 2px;
                }

                .nav-section::-webkit-scrollbar-thumb:hover {
                    background: rgba(148, 163, 184, 0.4);
                }

                /* Responsive adjustments */
                @media (max-height: 600px) {
                    .logo-section {
                        padding: 1rem 1.5rem;
                    }
                    .user-section {
                        padding: 1rem 1.5rem;
                    }
                    .logout-section {
                        padding: 1rem 1.5rem;
                    }
                }

                /* Print styles */
                @media print {
                    .sidebar-container {
                        display: none;
                    }
                }
            `}</style>
        </div>
    );
} 