import 'bootstrap/dist/css/bootstrap.min.css';
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from 'next/script';
import Sidebar from '@/components/Sidebar';
import AuthSessionProvider from '@/components/AuthSessionProvider';
import { Toaster } from 'react-hot-toast';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'Alliance Chemical Ticket System',
  description: 'Modern ticket management system for Alliance Chemical',
  icons: {
    icon: '/assets/logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script src="https://kit.fontawesome.com/17af746abc.js" crossOrigin="anonymous" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthSessionProvider>
          <Toaster 
            position="bottom-right" 
            toastOptions={{ 
              duration: 3000,
              style: {
                background: 'var(--card-bg)',
                color: 'var(--foreground)',
                border: '1px solid var(--card-border)',
                borderRadius: 'var(--border-radius)',
                boxShadow: 'var(--card-shadow)',
              },
            }} 
          />
          <div className="app-wrapper d-flex min-vh-100">
            <Sidebar />
            <main id="content" className="flex-grow-1">
              <div className="container-fluid py-4 px-md-5">
                {children}
              </div>
            </main>
          </div>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
