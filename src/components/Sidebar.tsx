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
            <nav className="col-md-1 d-none d-md-block bg-light sidebar pt-3">
                <div className="text-center p-2">Loading...</div>
            </nav>
        );
    }

    // If not authenticated, only show the logo and sign in link
    if (!isAuthenticated) {
        return (
            <nav className="col-md-1 d-none d-md-block bg-light sidebar d-flex flex-column" style={{ minHeight: '100vh' }}>
                <div className="text-center py-3">
                    <Link href="/" className="navbar-brand mx-auto">
                        <Image src="/assets/logo.png" alt="Logo" width={32} height={32} className="d-inline-block align-text-top me-1" />
                        <span className="fw-bold small">Ticket System</span>
                    </Link>
                </div>
                <ul className="nav flex-column flex-grow-1">
                    <li className="nav-item">
                        <Link href="/auth/signin" className={`nav-link ${isActive('/auth/signin') ? 'active fw-bold' : ''}`}>
                            <i className="fas fa-sign-in-alt"></i>
                            Sign In
                        </Link>
                    </li>
                </ul>
            </nav>
        );
    }

    return (
        <nav className="col-md-1 d-none d-md-block bg-light sidebar d-flex flex-column" style={{ minHeight: '100vh' }}>
            <div className="text-center py-3">
                <Link href="/" className="navbar-brand mx-auto">
                    <Image src="/assets/logo.png" alt="Logo" width={32} height={32} className="d-inline-block align-text-top me-1" />
                    <span className="fw-bold small">Ticket System</span>
                </Link>
            </div>
            <ul className="nav flex-column flex-grow-1">
                <li className="nav-item">
                    <Link href="/dashboard" className={`nav-link ${isActive('/dashboard') ? 'active fw-bold' : ''}`}>
                        <i className="fas fa-home"></i>
                        Dashboard
                    </Link>
                </li>
                <li className="nav-item">
                    <Link href="/tickets" className={`nav-link ${isActive('/tickets') || pathname?.startsWith('/tickets/view') || pathname?.startsWith('/tickets/edit') ? 'active fw-bold' : ''}`}>
                        <i className="fas fa-list-alt"></i>
                        All Tickets
                    </Link>
                </li>
                <li className="nav-item">
                    <Link href="/tickets/create" className={`nav-link ${isActive('/tickets/create') ? 'active fw-bold' : ''}`}>
                        <i className="fas fa-plus-circle"></i>
                        Create Ticket
                    </Link>
                </li>
                
                {/* Email Processing Button for all authenticated users */}
                <li className="nav-item px-3 mt-2 mb-2">
                    <div className="d-grid">
                        <ProcessEmailsSidebarButton />
                    </div>
                </li>

                {/* Admin Specific Links */}
                {isAdmin && (
                    <>
                        <hr className="my-2" />
                        <li className="nav-item-header px-3 mt-1 mb-1 text-muted small text-uppercase">Admin Tools</li>
                        <li className="nav-item">
                            <Link href="/manage-users" className={`nav-link ${isActive('/manage-users') ? 'active fw-bold' : ''}`}>
                                <i className="fas fa-users-cog"></i>
                                Manage Users
                            </Link>
                        </li>
                        <li className="nav-item">
                            <Link href="/admin/email-processing" className={`nav-link ${isActive('/admin/email-processing') ? 'active fw-bold' : ''}`}>
                                <i className="fas fa-envelope-open-text"></i>
                                Email Processing
                            </Link>
                        </li>
                    </>
                )}
            </ul>
            
            {/* Logout Button - Always at the bottom */}
            <div className="mt-auto p-3 border-top">
                <button 
                    onClick={handleLogout}
                    className="btn btn-danger w-100"
                >
                    <i className="fas fa-sign-out-alt me-2"></i>
                    Logout
                </button>
            </div>
        </nav>
    );
}