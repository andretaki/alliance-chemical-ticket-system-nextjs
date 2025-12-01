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
    <html lang="en" className="dark">
      <head>
        <Script 
          src="https://kit.fontawesome.com/17af746abc.js" 
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
        <meta name="theme-color" content="#667eea" />
        <meta name="color-scheme" content="dark" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthSessionProvider>
          <KeyboardShortcutsProvider>
            {/* Toast Notifications */}
            <Toaster
              position="bottom-right"
              theme="dark"
              richColors
              closeButton
              toastOptions={{
                style: {
                  background: 'rgba(13, 17, 23, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  backdropFilter: 'blur(20px)',
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
                {/* Dynamic Background Effects */}
                <div className="background-effects">
                  <div className="bg-gradient-1"></div>
                  <div className="bg-gradient-2"></div>
                  <div className="bg-gradient-3"></div>
                </div>
                
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
            <div className="loading-content">
              <div className="loading-logo">
                <div className="logo-spinner">
                  <div className="spinner-ring"></div>
                  <div className="spinner-ring"></div>
                  <div className="spinner-ring"></div>
                </div>
                <div className="loading-text">
                  <h3>Loading...</h3>
                  <p>Preparing your premium experience</p>
                </div>
              </div>
            </div>
          </div>

          </KeyboardShortcutsProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}