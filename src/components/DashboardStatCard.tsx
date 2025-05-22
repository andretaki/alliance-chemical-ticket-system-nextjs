'use client';

import React from 'react';
import Link from 'next/link'; // Import Link for footer

interface DashboardStatCardProps {
  title: string;
  value: string | number;
  iconClass: string; // e.g., "fas fa-ticket-alt"
  iconColorClass?: string; // e.g., 'text-primary', 'text-danger'
  footerText?: string;
  footerLink?: string; // Link for the footer
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
  iconColorClass = 'text-primary', // Changed default color
  footerText,
  footerLink,
  isLoading = false,
  change,
}) => {
  return (
    <div className="card h-100 border-0"> 
      <div className="card-body p-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="card-subtitle text-muted text-uppercase small fw-semibold">{title}</h6>
          <div className={`stat-icon-circle ${iconColorClass}`}>
            <i className={iconClass}></i>
          </div>
        </div>
        
        {isLoading ? (
          <div className="d-flex align-items-center mt-3">
            <div className="spinner-border text-primary me-2" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <span className="text-muted">Loading...</span>
          </div>
        ) : (
          <>
            <h2 className="card-title display-5 mb-2 fw-bold">{value}</h2>
            
            {change && (
              <div className={`change-indicator ${change.isPositive ? 'text-success' : 'text-danger'} d-flex align-items-center mb-2`}>
                <i className={`fas fa-${change.isPositive ? 'arrow-up' : 'arrow-down'} me-1`}></i>
                <span className="fw-semibold">{Math.abs(change.value)}%</span>
                <span className="text-muted ms-1 small">from last period</span>
              </div>
            )}
          </>
        )}
      </div>
      
      {footerText && footerLink && (
        <Link href={footerLink} className="card-footer text-decoration-none py-3 px-4 d-flex justify-content-between align-items-center transition-all">
          <span className="text-primary fw-medium">{footerText}</span>
          <i className="fas fa-arrow-right text-primary"></i>
        </Link>
      )}
    </div>
  );
};

export default DashboardStatCard;