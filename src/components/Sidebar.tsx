// src/components/Sidebar.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import ProcessEmailsSidebarButton from './ProcessEmailsSidebarButton';

export default function Sidebar() {
    const { data: session, status } = useSession();
    const pathname = usePathname();
    const router = useRouter();

    const isAdmin = status === 'authenticated' && session?.user?.role === 'admin';
    const isAuthenticated = status === 'authenticated';

    // Helper function to determine if a link is active
    const isActive = (href: string) => pathname === href;
    const isPartiallyActive = (href: string) => pathname?.startsWith(href);

    // Handle logout
    const handleLogout = async () => {
        try {
            console.log('Logging out...');
            await signOut({ 
                redirect: false,
                callbackUrl: '/'
            });
            console.log('Sign out successful, redirecting...');
            router.push('/');
        } catch (error) {
            console.error('Error during logout:', error);
        }
    };

    if (status === 'loading') {
        return (
            <nav className="col-md-2 d-none d-md-block sidebar pt-4">
                <div className="text-center p-3">
                    <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                </div>
            </nav>
        );
    }

    // If not authenticated, only show the logo and sign in link
    if (!isAuthenticated) {
        return (
            <nav className="col-md-2 d-none d-md-block sidebar d-flex flex-column" style={{ minHeight: '100vh' }}>
                <div className="text-center py-4">
                    <Link href="/" className="navbar-brand mx-auto d-flex flex-column align-items-center">
                        <Image src="/assets/logo.png" alt="Logo" width={48} height={48} className="mb-2" />
                        <span className="fw-bold">Alliance Chemical</span>
                        <span className="small text-muted">Ticket System</span>
                    </Link>
                </div>
                <ul className="nav flex-column flex-grow-1 mt-4">
                    <li className="nav-item px-3">
                        <Link href="/auth/signin" className={`nav-link d-flex align-items-center ${isActive('/auth/signin') ? 'active fw-bold' : ''}`}>
                            <i className="fas fa-sign-in-alt me-3"></i>
                            <span>Sign In</span>
                        </Link>
                    </li>
                </ul>
            </nav>
        );
    }

    return (
        <nav className="col-md-2 d-none d-md-block sidebar d-flex flex-column" style={{ minHeight: '100vh' }}>
            <div className="text-center py-4">
                <Link href="/" className="navbar-brand mx-auto d-flex flex-column align-items-center">
                    <Image src="/assets/logo.png" alt="Logo" width={48} height={48} className="mb-2" />
                    <span className="fw-bold">Alliance Chemical</span>
                    <span className="small text-muted">Ticket System</span>
                </Link>
            </div>
            
            {/* User Info */}
            <div className="user-profile text-center mb-4 px-3">
                <div className="avatar-circle mx-auto mb-2">
                    <span className="initials">{session?.user?.name?.charAt(0) || session?.user?.email?.charAt(0) || 'U'}</span>
                </div>
                <div className="user-name fw-bold">{session?.user?.name || session?.user?.email}</div>
                <div className="user-role small text-muted">{session?.user?.role || 'User'}</div>
            </div>
            
            <div className="px-3 mb-4">
                <div className="sidebar-heading px-3 mb-2 text-uppercase fw-bold text-muted small">
                    Main Navigation
                </div>
                <ul className="nav flex-column">
                    <li className="nav-item">
                        <Link href="/dashboard" className={`nav-link d-flex align-items-center ${isActive('/dashboard') ? 'active fw-bold' : ''}`}>
                            <i className="fas fa-home me-3"></i>
                            <span>Dashboard</span>
                        </Link>
                    </li>
                    <li className="nav-item">
                        <Link href="/tickets" className={`nav-link d-flex align-items-center ${isPartiallyActive('/tickets') && !isActive('/tickets/create') ? 'active fw-bold' : ''}`}>
                            <i className="fas fa-list-alt me-3"></i>
                            <span>All Tickets</span>
                        </Link>
                    </li>
                    <li className="nav-item">
                        <Link href="/tickets/create" className={`nav-link d-flex align-items-center ${isActive('/tickets/create') ? 'active fw-bold' : ''}`}>
                            <i className="fas fa-plus-circle me-3"></i>
                            <span>Create Ticket</span>
                        </Link>
                    </li>
                    <li className="nav-item">
                        <Link href="/admin/quotes/create" className={`nav-link d-flex align-items-center ${isActive('/admin/quotes/create') ? 'active fw-bold' : ''}`}>
                            <i className="fas fa-file-invoice-dollar me-3"></i>
                            <span>Create Quote</span>
                        </Link>
                    </li>
                </ul>
            </div>
            
            {/* Email Processing Button for all authenticated users */}
            <div className="px-4 mb-4">
                <div className="d-grid">
                    <ProcessEmailsSidebarButton />
                </div>
            </div>

            {/* Admin Specific Links */}
            {isAdmin && (
                <div className="px-3 mb-4">
                    <div className="sidebar-heading px-3 mb-2 text-uppercase fw-bold text-muted small">
                        Admin Tools
                    </div>
                    <ul className="nav flex-column">
                        <li className="nav-item">
                            <Link href="/manage-users" className={`nav-link d-flex align-items-center ${isActive('/manage-users') ? 'active fw-bold' : ''}`}>
                                <i className="fas fa-users-cog me-3"></i>
                                <span>Manage Users</span>
                            </Link>
                        </li>
                        <li className="nav-item">
                            <Link href="/admin/email-processing" className={`nav-link d-flex align-items-center ${isActive('/admin/email-processing') ? 'active fw-bold' : ''}`}>
                                <i className="fas fa-envelope-open-text me-3"></i>
                                <span>Email Processing</span>
                            </Link>
                        </li>
                    </ul>
                </div>
            )}
            
            {/* Logout Button - Always at the bottom */}
            <div className="mt-auto p-4 border-top">
                <button 
                    onClick={handleLogout}
                    className="btn btn-danger w-100 d-flex align-items-center justify-content-center"
                >
                    <i className="fas fa-sign-out-alt me-2"></i>
                    <span>Logout</span>
                </button>
            </div>
        </nav>
    );
}