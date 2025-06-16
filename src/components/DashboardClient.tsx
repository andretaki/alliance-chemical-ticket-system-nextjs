'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import DashboardStatsSection from './DashboardStatsSection';
import StatusChartClient from './charts/StatusChartClient';
import PriorityChartClient from './charts/PriorityChartClient';
import TypeChartClient from './charts/TypeChartClient';
import TicketListClient from './TicketListClient';
import SimpleOrderSearch from './dashboard/SimpleOrderSearch';

export default function DashboardClient() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin?callbackUrl=/dashboard');
    }
  }, [status, router]);

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center z-[9999]">
        <div className="text-center text-white">
          <div className="relative w-16 h-16 mx-auto mb-8">
            <div className="absolute w-full h-full border-4 border-transparent border-t-white rounded-full animate-spin"></div>
          </div>
          <h3 className="text-2xl font-semibold">Loading Dashboard</h3>
          <p className="opacity-80">Preparing your workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden bg-background-secondary">
      {/* Background */}
      <div className="fixed inset-0 z-[-1] bg-[radial-gradient(circle_at_20%_20%,_rgba(120,119,198,0.15)_0%,_transparent_50%),radial-gradient(circle_at_80%_80%,_rgba(255,119,198,0.15)_0%,_transparent_50%),radial-gradient(circle_at_60%_40%,_rgba(64,224,208,0.1)_0%,_transparent_50%)]"></div>

      {/* Main Content */}
      <div className="relative z-10 p-4 sm:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-12 animate-fadeIn">
          <div className="flex justify-between items-end flex-wrap gap-8">
            <div>
              <h1 className="text-5xl md:text-6xl font-black relative">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-300 to-indigo-300 tracking-tight">
                  Dashboard
                </span>
                <div className="h-1 bg-gradient-to-r from-primary to-primary-hover rounded-full mt-2 animate-expand-width"></div>
              </h1>
              <p className="mt-4 text-lg text-foreground-muted font-light">
                Welcome back, {session?.user?.name || 'User'}! Here&apos;s your command center.
              </p>
            </div>
            <Link href="/tickets/create" className="group relative inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-gradient-to-r from-primary to-primary-hover text-white font-bold text-lg transition-transform duration-200 hover:-translate-y-0.5 shadow-lg hover:shadow-primary/40">
              <div className="flex items-center justify-center w-7 h-7 bg-white/20 rounded-lg transition-transform duration-200 group-hover:rotate-90">
                <i className="fas fa-plus"></i>
              </div>
              <span>New Ticket</span>
            </Link>
          </div>
        </header>

        {/* Quick Search */}
        <section className="mb-12 animate-fadeIn animation-delay-200">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 transition-all duration-200 hover:bg-white/10 hover:-translate-y-px hover:shadow-2xl hover:shadow-black/20">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">Quick Order Search</h2>
              <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-hover text-white text-xl">
                <i className="fas fa-search"></i>
              </div>
            </div>
            <SimpleOrderSearch />
          </div>
        </section>

        {/* Sections */}
        <div className="space-y-16">
          {[
            { title: 'Overview', component: <DashboardStatsSection />, delay: '400ms' },
            { title: 'Analytics', component: (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 transition-all duration-200 hover:bg-white/10 hover:-translate-y-px hover:shadow-xl hover:shadow-black/20"><StatusChartClient /></div>
                <div className="lg:col-span-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 transition-all duration-200 hover:bg-white/10 hover:-translate-y-px hover:shadow-xl hover:shadow-black/20"><PriorityChartClient /></div>
                <div className="lg:col-span-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 transition-all duration-200 hover:bg-white/10 hover:-translate-y-px hover:shadow-xl hover:shadow-black/20"><TypeChartClient /></div>
              </div>
            ), delay: '600ms' },
            { title: 'Recent Activity', component: <div className="bg-white/2 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-black/20"><TicketListClient limit={5} showSearch={false} /></div>, delay: '800ms', link: '/tickets' },
          ].map((section) => (
            <section key={section.title} className="animate-fadeIn" style={{ animationDelay: section.delay }}>
              <header className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-white">{section.title}</h2>
                {section.link && (
                  <Link href={section.link} className="group flex items-center gap-2 text-foreground-muted hover:text-white transition-colors">
                    <span>View All</span>
                    <i className="fas fa-arrow-right transition-transform duration-200 group-hover:translate-x-1"></i>
                  </Link>
                )}
              </header>
              {section.component}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// Add these to globals.css or a new animation file if you don't have them
/*
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes expand-width {
  from { width: 0; }
  to { width: 100%; }
}
.animate-fadeIn {
  animation: fadeIn 0.6s ease-out forwards;
}
.animate-expand-width {
  animation: expand-width 0.8s ease-out 0.3s forwards;
}
.animation-delay-200 { animation-delay: 200ms; }
.animation-delay-400 { animation-delay: 400ms; }
.animation-delay-600 { animation-delay: 600ms; }
.animation-delay-800 { animation-delay: 800ms; }
*/
