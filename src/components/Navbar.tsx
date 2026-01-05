'use client'; // This needs to be a client component to use useSession

import React, { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession, signOut } from '@/lib/auth-client';
import { useRouter } from 'next/navigation'; // Added for programmatic navigation after logout
import { UserCircle, LogOut, LogIn } from 'lucide-react';

export default function Navbar() {
    const { data: session, isPending } = useSession();
    const isAuthenticated = !!session?.user;
    const router = useRouter(); // Added for programmatic navigation

    useEffect(() => {
        // console.log('Navbar Session State:', { isPending, session }); // Keep for debugging if needed
    }, [isPending, session]);

    const handleLogout = async () => {
        try {
            // console.log('Logout clicked'); // Keep for debugging if needed
            await signOut({
                fetchOptions: {
                    onSuccess: () => {
                        router.push('/'); // Redirect to home page after logout
                    },
                },
            });
            // console.log('Sign out successful, redirecting to /'); // Keep for debugging
        } catch (error) {
            console.error('Error during logout:', error);
        }
    };

    return (
        <nav
            className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 dark:bg-gray-900/95 dark:border-gray-700 backdrop-blur-lg"
        >
            <div className="container mx-auto px-4">
                <div className="flex items-center justify-between h-16">
                    <Link href="/" className="flex items-center gap-2 text-gray-900 dark:text-white">
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
                                    <UserCircle className="w-5 h-5" />
                                    <span>{session.user?.name || session.user?.email}</span>
                                </Link>
                                <button
                                    onClick={handleLogout}
                                    className="flex items-center gap-2 px-4 py-2 rounded-md bg-danger/80 text-white hover:bg-danger transition-colors"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Logout
                                </button>
                            </>
                        ) : (
                            <Link
                                href="/auth/signin"
                                className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary/80 text-white hover:bg-primary transition-colors"
                            >
                                <LogIn className="w-4 h-4" />
                                Sign In
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
} 