'use client';

import React from 'react';
import Link from 'next/link';

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
  const getIconGradient = (colorClass: string) => {
    switch (colorClass) {
      case 'text-primary':
        return 'linear-gradient(135deg, #3b82f6, #1e40af)';
      case 'text-danger':
        return 'linear-gradient(135deg, #ef4444, #dc2626)';
      case 'text-success':
        return 'linear-gradient(135deg, #10b981, #059669)';
      case 'text-warning':
        return 'linear-gradient(135deg, #f59e0b, #d97706)';
      default:
        return 'linear-gradient(135deg, #6b7280, #4b5563)';
    }
  };

  const getGlowColor = (colorClass: string) => {
    switch (colorClass) {
      case 'text-primary':
        return 'rgba(59, 130, 246, 0.3)';
      case 'text-danger':
        return 'rgba(239, 68, 68, 0.3)';
      case 'text-success':
        return 'rgba(16, 185, 129, 0.3)';
      case 'text-warning':
        return 'rgba(245, 158, 11, 0.3)';
      default:
        return 'rgba(107, 114, 128, 0.3)';
    }
  };

  return (
    <>
      <div className="modern-stat-card">
        {/* Animated Background Pattern */}
        <div className="card-pattern" />
        
        {/* Main Content */}
        <div className="card-content">
          {/* Header Section */}
          <div className="card-header">
            <div 
              className="stat-icon"
              style={{ 
                background: getIconGradient(iconColorClass),
                boxShadow: `0 8px 32px ${getGlowColor(iconColorClass)}`
              }}
            >
              <i className={iconClass} />
              <div className="icon-ripple" />
            </div>
            
            {change && (
              <div className={`change-badge ${change.isPositive ? 'positive' : 'negative'}`}>
                <div className="change-icon">
                  <i className={`fas fa-arrow-${change.isPositive ? 'up' : 'down'}`} />
                </div>
                <span className="change-value">{Math.abs(change.value)}%</span>
                <div className="change-glow" />
              </div>
            )}
          </div>

          {/* Body Section */}
          <div className="card-body">
            <div className="stat-title-section">
              <h6 className="stat-subtitle">{title}</h6>
            </div>
            
            {isLoading ? (
              <div className="loading-container">
                <div className="skeleton-value" />
                <div className="loading-dots">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ) : (
              <div className="stat-value-container">
                <h2 className="stat-value">{value}</h2>
                <div className="value-underline" style={{ background: getIconGradient(iconColorClass) }} />
              </div>
            )}
          </div>

          {/* Footer Section */}
          {footerText && footerLink && (
            <div className="card-footer">
              <Link href={footerLink} className="footer-link">
                <span className="footer-text">{footerText}</span>
                <div className="footer-arrow">
                  <i className="fas fa-arrow-right" />
                </div>
                <div className="footer-hover-bg" />
              </Link>
            </div>
          )}
        </div>

        {/* Hover Effects */}
        <div className="card-glow" style={{ background: getIconGradient(iconColorClass) }} />
        <div className="card-shine" />
      </div>

      <style jsx>{`
        .modern-stat-card {
          position: relative;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 0;
          overflow: hidden;
          transition: all 0.2s ease;
          cursor: pointer;
          isolation: isolate;
        }

        .modern-stat-card:hover {
          background: rgba(255, 255, 255, 0.08);
          transform: translateY(-4px);
          box-shadow: 
            0 12px 32px rgba(0, 0, 0, 0.3),
            0 0 0 1px rgba(255, 255, 255, 0.15);
        }

        .modern-stat-card:hover .card-glow {
          opacity: 0.4;
        }

        .modern-stat-card:hover .stat-icon {
          transform: scale(1.05);
        }

        .card-pattern {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: 
            radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0);
          background-size: 24px 24px;
          opacity: 0.3;
        }

        .card-content {
          position: relative;
          z-index: 2;
          padding: 2rem;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.5rem;
        }

        .stat-icon {
          position: relative;
          width: 64px;
          height: 64px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 1.5rem;
          transition: all 0.2s ease;
          overflow: hidden;
        }

        .icon-ripple {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 20px;
          height: 20px;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          transform: translate(-50%, -50%) scale(0);
          transition: all 0.6s ease;
        }

        .change-badge {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.5rem 0.875rem;
          border-radius: 24px;
          font-size: 0.875rem;
          font-weight: 700;
          backdrop-filter: blur(10px);
          overflow: hidden;
          transition: all 0.2s ease;
        }

        .change-badge.positive {
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.3);
          box-shadow: 0 4px 20px rgba(16, 185, 129, 0.15);
        }

        .change-badge.negative {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
          box-shadow: 0 4px 20px rgba(239, 68, 68, 0.15);
        }

        .change-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
        }

        .change-value {
          font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace;
          letter-spacing: -0.025em;
        }

        .change-glow {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: inherit;
          border-radius: inherit;
          opacity: 0;
          filter: blur(8px);
          z-index: -1;
          transition: opacity 0.3s ease;
        }

        .change-badge:hover .change-glow {
          opacity: 0.6;
        }

        .card-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .stat-title-section {
          margin-bottom: 0.75rem;
        }

        .stat-subtitle {
          color: rgba(255, 255, 255, 0.8);
          font-size: 0.875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0;
          line-height: 1.2;
        }

        .stat-value-container {
          position: relative;
        }

        .stat-value {
          color: white;
          font-size: 3rem;
          font-weight: 900;
          margin: 0;
          line-height: 1;
          font-feature-settings: 'tnum';
          letter-spacing: -0.025em;
          text-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
          transition: all 0.2s ease;
        }

        .value-underline {
          height: 3px;
          width: 40px;
          border-radius: 2px;
          margin-top: 0.5rem;
          opacity: 0.8;
          transition: all 0.2s ease;
        }

        .modern-stat-card:hover .value-underline {
          width: 60px;
          opacity: 1;
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .skeleton-value {
          height: 48px;
          background: linear-gradient(
            90deg, 
            rgba(255, 255, 255, 0.1) 0%, 
            rgba(255, 255, 255, 0.2) 50%, 
            rgba(255, 255, 255, 0.1) 100%
          );
          background-size: 200% 100%;
          border-radius: 8px;
          animation: shimmer 1.5s ease-in-out infinite;
        }

        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .loading-dots {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .loading-dots span {
          width: 8px;
          height: 8px;
          background: rgba(255, 255, 255, 0.6);
          border-radius: 50%;
          animation: pulse 1.2s ease-in-out infinite;
        }

        .loading-dots span:nth-child(2) {
          animation-delay: 0.15s;
        }

        .loading-dots span:nth-child(3) {
          animation-delay: 0.3s;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }

        .card-footer {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .footer-link {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: rgba(255, 255, 255, 0.8);
          text-decoration: none;
          font-weight: 600;
          font-size: 0.875rem;
          padding: 0.75rem 0;
          border-radius: 12px;
          transition: all 0.2s ease;
          overflow: hidden;
        }

        .footer-link:hover {
          color: white;
          transform: translateX(2px);
        }

        .footer-link:hover .footer-arrow {
          transform: translateX(2px);
        }

        .footer-link:hover .footer-hover-bg {
          opacity: 1;
        }

        .footer-text {
          position: relative;
          z-index: 2;
        }

        .footer-arrow {
          position: relative;
          z-index: 2;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          transition: all 0.2s ease;
        }

        .footer-hover-bg {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .card-glow {
          position: absolute;
          top: -15px;
          left: -15px;
          right: -15px;
          bottom: -15px;
          border-radius: 32px;
          opacity: 0;
          filter: blur(20px);
          z-index: -1;
          transition: all 0.2s ease;
        }

        .card-shine {
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.1),
            transparent
          );
          transition: transform 0.6s ease;
          z-index: 1;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .card-content {
            padding: 1.5rem;
          }

          .stat-value {
            font-size: 2.5rem;
          }

          .stat-icon {
            width: 56px;
            height: 56px;
            font-size: 1.25rem;
          }
        }

        @media (max-width: 480px) {
          .card-content {
            padding: 1.25rem;
          }

          .stat-value {
            font-size: 2rem;
          }

          .card-header {
            flex-direction: column;
            gap: 1rem;
            align-items: flex-start;
          }
        }

        /* Accessibility */
        @media (prefers-reduced-motion: reduce) {
          .modern-stat-card,
          .stat-icon,
          .card-glow,
          .footer-link,
          .footer-arrow,
          .value-underline,
          .change-badge {
            transition: none;
          }

          .skeleton-value {
            animation: none;
            background: rgba(255, 255, 255, 0.1);
          }

          .loading-dots span {
            animation: none;
            opacity: 0.6;
          }
        }
      `}</style>
    </>
  );
};

export default DashboardStatCard;