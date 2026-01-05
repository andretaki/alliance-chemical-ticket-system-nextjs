'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';

interface DashboardStatCardProps {
  title: string;
  value: string | number;
  iconClass: string;
  iconColorClass?: string;
  footerText?: string;
  footerLink?: string;
  isLoading?: boolean;
  change?: {
    value: number;
    isPositive: boolean;
  };
}

const DashboardStatCard: React.FC<DashboardStatCardProps> = ({
  title,
  value,
  iconClass,
  iconColorClass = 'text-primary',
  footerText,
  footerLink,
  isLoading = false,
  change,
}) => {
  
  const iconBgClasses: { [key: string]: string } = {
    'text-primary': 'bg-gradient-to-br from-primary to-primary-hover shadow-primary/30',
    'text-danger': 'bg-gradient-to-br from-danger to-danger-hover shadow-danger/30',
    'text-success': 'bg-gradient-to-br from-success to-success-hover shadow-success/30',
    'text-warning': 'bg-gradient-to-br from-warning to-warning-hover shadow-warning/30',
    'default': 'bg-gradient-to-br from-secondary to-secondary-hover shadow-secondary/30'
  }

  const changeBadgeClasses: { [key: string]: string } = {
    positive: 'bg-success/10 text-success border-success/30 shadow-lg shadow-success/10',
    negative: 'bg-danger/10 text-danger border-danger/30 shadow-lg shadow-danger/10'
  }

  return (
    <div className="relative bg-white border border-gray-200 dark:bg-gray-800/50 dark:border-gray-700 rounded-2xl p-6 transition-all duration-300 ease-in-out hover:bg-gray-50 dark:hover:bg-gray-800 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/10 dark:hover:shadow-black/30 cursor-pointer overflow-hidden isolate">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_2px_2px,_rgba(0,0,0,0.03)_1px,_transparent_0)] dark:bg-[radial-gradient(circle_at_2px_2px,_rgba(255,255,255,0.05)_1px,_transparent_0)] [background-size:24px_24px] opacity-30 z-[-1]"></div>

      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div className={`relative w-16 h-16 flex items-center justify-center rounded-xl text-white text-2xl transition-transform duration-300 group-hover:scale-105 ${iconBgClasses[iconColorClass] || iconBgClasses.default} shadow-lg`}>
            <i className={iconClass} />
          </div>
          {change && (
            <div className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold backdrop-blur-md border ${change.isPositive ? changeBadgeClasses.positive : changeBadgeClasses.negative}`}>
              {change.isPositive ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
              <span>{Math.abs(change.value)}%</span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col justify-center">
          <h6 className="text-sm font-semibold text-foreground-muted uppercase tracking-wider mb-2">{title}</h6>
          {isLoading ? (
            <div className="space-y-4">
              <div className="h-12 w-3/4 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
              <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
            </div>
          ) : (
            <div>
              <h2 className="text-5xl font-extrabold text-gray-900 dark:text-white tracking-tighter">{value}</h2>
              <div className={`h-1 w-10 mt-2 rounded-full ${iconBgClasses[iconColorClass]} transition-all duration-300 group-hover:w-16`}></div>
            </div>
          )}
        </div>

        {/* Footer */}
        {footerText && footerLink && (
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Link href={footerLink} className="group/footer flex justify-between items-center text-sm font-semibold text-foreground-muted hover:text-gray-900 dark:hover:text-white transition-colors duration-200">
              <span>{footerText}</span>
              <div className="w-6 h-6 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-md transition-transform duration-200 group-hover/footer:translate-x-1">
                <ArrowRight className="w-4 h-4" />
              </div>
            </Link>
          </div>
        )}
      </div>

      {/* Shine Effect */}
      <div className="absolute top-0 left-[-100%] w-full h-full bg-gradient-to-r from-transparent via-gray-200/50 dark:via-white/10 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-full z-[-1]"></div>
    </div>
  );
};

export default DashboardStatCard;