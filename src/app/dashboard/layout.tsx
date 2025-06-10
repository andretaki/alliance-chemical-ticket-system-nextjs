import React from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-wrapper bg-light-subtle">
      <div className="dashboard-header p-3 mb-3 shadow-sm bg-white">
        <div className="d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center">
            <h2 className="mb-0 text-primary fw-bold">Dashboard</h2>
          </div>
          <div>
            <button className="btn btn-outline-secondary rounded-pill border-0 me-2" title="Settings">
              <i className="bi bi-gear"></i>
            </button>
            <button className="btn btn-outline-secondary rounded-pill border-0">
              <i className="bi bi-bell"></i>
            </button>
          </div>
        </div>
      </div>
      
      {children}
    </div>
  );
}