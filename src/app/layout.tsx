import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from 'next/script';
import Sidebar from '@/components/Sidebar';
import AuthSessionProvider from '@/components/AuthSessionProvider';
import { Toaster } from 'sonner';
import AppFooter from '@/components/AppFooter';
import { KeyboardShortcutsProvider } from '@/components/KeyboardShortcuts';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://alliance-chemical-ticket-sy.vercel.app'),
  title: 'Alliance Chemical Ticket System',
  description: 'Modern ticket management system for Alliance Chemical - Premium Enterprise SaaS Platform',
  icons: {
    icon: '/assets/logo.png',
    apple: '/assets/logo.png',
  },
  keywords: ['ticket system', 'support', 'alliance chemical', 'enterprise', 'saas'],
  authors: [{ name: 'Alliance Chemical' }],
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://kit.fontawesome.com/17af746abc.js"
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
        <meta name="theme-color" content="#2563eb" />
        <meta name="color-scheme" content="light dark" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <AuthSessionProvider>
          <KeyboardShortcutsProvider>
            {/* Toast Notifications */}
            <Toaster
              position="bottom-right"
              theme="light"
              richColors
              closeButton
              toastOptions={{
                style: {
                  background: 'hsl(var(--card))',
                  color: 'hsl(var(--card-foreground))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '12px',
                  boxShadow: 'var(--shadow-lg)',
                },
              }}
            />

            {/* Main Application Layout */}
          <div className="app-layout">
            {/* Premium Sidebar */}
            <Sidebar />
            
            {/* Main Content Area */}
            <main className="main-content">
              {/* Content Container */}
              <div className="content-container">
                {/* Page Content */}
                <div className="page-content">
                  {children}
                </div>
                
                {/* Footer is now a Client Component to prevent hydration errors */}
                <AppFooter />
              </div>
            </main>
          </div>

          {/* Global Loading Overlay */}
          <div id="global-loading" className="global-loading">
            <div className="flex flex-col items-center gap-4">
              <div className="loading-spinner" />
              <p className="text-sm text-gray-500">Loading...</p>
            </div>
          </div>

          </KeyboardShortcutsProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
