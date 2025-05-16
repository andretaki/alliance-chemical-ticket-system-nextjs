'use client'; // This needs to be a client component to use useSession

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';

export default function Navbar() {
    const { data: session, status } = useSession();
    const isAuthenticated = status === 'authenticated';

    useEffect(() => {
        console.log('Navbar Session State:', { status, session });
    }, [status, session]);

    return (
        <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom fixed-top" style={{ zIndex: 1030 }}>
            <div className="container-fluid">
                <Link href="/" className="navbar-brand d-flex align-items-center">
                    <img src="/assets/logo.png" alt="Logo" width="30" height="30" className="d-inline-block align-text-top me-2" />
                    <span className="fw-bold">Ticket System</span>
                </Link>

                <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
                    <span className="navbar-toggler-icon"></span>
                </button>

                <div className="collapse navbar-collapse" id="navbarSupportedContent">
                    <ul className="navbar-nav ms-auto align-items-center">
                        {isAuthenticated && session ? (
                            <>
                                <li className="nav-item me-3">
                                    <Link href="/profile" className="nav-link d-flex align-items-center">
                                        <i className="fas fa-user-circle me-2"></i>
                                        <span>{session.user?.name || session.user?.email}</span>
                                    </Link>
                                </li>
                                <li className="nav-item">
                                    <button 
                                        onClick={() => {
                                            console.log('Logout clicked');
                                            signOut({ callbackUrl: '/' });
                                        }} 
                                        className="btn btn-danger"
                                        style={{ minWidth: '120px' }}
                                    >
                                        <i className="fas fa-sign-out-alt me-2"></i>
                                        Logout
                                    </button>
                                </li>
                            </>
                        ) : (
                            <li className="nav-item">
                                <Link href="/auth/signin" className="btn btn-primary">
                                    <i className="fas fa-sign-in-alt me-2"></i>
                                    Sign In
                                </Link>
                            </li>
                        )}
                    </ul>
                </div>
            </div>
        </nav>
    );
} 