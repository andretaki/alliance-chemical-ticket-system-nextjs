import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from 'next/script';
import Sidebar from '@/components/Sidebar';
import AuthSessionProvider from '@/components/AuthSessionProvider';
import { Toaster } from 'react-hot-toast';
import AppFooter from '@/components/AppFooter';

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
  viewport: 'width=device-width, initial-scale=1',
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
          {/* Premium Toast System */}
          <Toaster 
            position="bottom-right"
            containerClassName="toast-container"
            toastOptions={{ 
              duration: 4000,
              style: {
                background: 'rgba(255, 255, 255, 0.03)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                padding: '16px 20px',
                fontSize: '14px',
                fontWeight: '500',
                maxWidth: '400px',
              },
              success: {
                iconTheme: {
                  primary: '#10b981',
                  secondary: '#ffffff',
                },
                style: {
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  background: 'rgba(16, 185, 129, 0.1)',
                },
              },
              error: {
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#ffffff',
                },
                style: {
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  background: 'rgba(239, 68, 68, 0.1)',
                },
              },
              loading: {
                iconTheme: {
                  primary: '#667eea',
                  secondary: '#ffffff',
                },
                style: {
                  border: '1px solid rgba(102, 126, 234, 0.2)',
                  background: 'rgba(102, 126, 234, 0.1)',
                },
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

        </AuthSessionProvider>
      </body>
    </html>
  );
}