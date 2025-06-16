'use client'; // This needs to be a client component to use useSession

import React, { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation'; // Added for programmatic navigation after logout

export default function Navbar() {
    const { data: session, status } = useSession();
    const isAuthenticated = status === 'authenticated';
    const router = useRouter(); // Added for programmatic navigation

    useEffect(() => {
        // console.log('Navbar Session State:', { status, session }); // Keep for debugging if needed
    }, [status, session]);

    const handleLogout = async () => {
        try {
            // console.log('Logout clicked'); // Keep for debugging if needed
            await signOut({ 
                redirect: false, // Handle redirect manually to ensure it works in all environments
                // callbackUrl: '/' // Can be set, but manual redirect offers more control
            });
            // console.log('Sign out successful, redirecting to /'); // Keep for debugging
            router.push('/'); // Redirect to home page after logout
        } catch (error) {
            console.error('Error during logout:', error);
        }
    };

    return (
        <nav 
            className="fixed top-0 left-0 right-0 z-30 bg-white/5 border-b border-white/10 backdrop-blur-lg"
        >
            <div className="container mx-auto px-4">
                <div className="flex items-center justify-between h-16">
                    <Link href="/" className="flex items-center gap-2 text-white">
                        <Image src="/assets/logo.png" alt="Logo" width={24} height={24} />
                        <span className="font-bold text-lg">Ticket System</span>
                    </Link>

                    <div className="flex items-center gap-4">
                        {isAuthenticated && session ? (
                            <>
                                <Link 
                                    href="/profile" 
                                    className="flex items-center gap-2 text-foreground-muted hover:text-foreground transition-colors"
                                >
                                    <i className="fas fa-user-circle"></i>
                                    <span>{session.user?.name || session.user?.email}</span>
                                </Link>
                                <button 
                                    onClick={handleLogout}
                                    className="flex items-center gap-2 px-4 py-2 rounded-md bg-danger/80 text-white hover:bg-danger transition-colors"
                                >
                                    <i className="fas fa-sign-out-alt"></i>
                                    Logout
                                </button>
                            </>
                        ) : (
                            <Link 
                                href="/auth/signin" 
                                className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary/80 text-white hover:bg-primary transition-colors"
                            >
                                <i className="fas fa-sign-in-alt"></i>
                                Sign In
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
} 