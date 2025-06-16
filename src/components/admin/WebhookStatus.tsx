'use client';

import { useState, useEffect } from 'react';

interface WebhookStatusData {
  isConnected: boolean;
  lastChecked: string;
  error: string | null;
  subscriptions: any[];
  info: {
    webhookEndpoint: string;
    environment: string;
    tenantId: string;
    clientId: string;
    hasClientSecret: boolean;
    sharedMailbox: string;
  };
}

export default function WebhookStatus() {
  const [status, setStatus] = useState<WebhookStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setError(null);
      const response = await fetch('/api/admin/webhook-status');
      if (!response.ok) {
        throw new Error('Failed to fetch webhook status');
      }
      const data = await response.json();
      setStatus(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Refresh status every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="d-flex align-items-center">
        <div className="spinner-border spinner-border-sm me-2" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <span className="text-muted">Checking webhook...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="d-flex align-items-center">
        <span className="badge bg-danger me-2">⚠️</span>
        <span className="text-danger">Error: {error}</span>
        <button 
          className="btn btn-sm btn-outline-secondary ms-2"
          onClick={fetchStatus}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const getStatusColor = () => {
    if (status.isConnected) {
      return 'success';
    }
    return 'danger';
  };

  const getStatusIcon = () => {
    if (status.isConnected) {
      return '✅';
    }
    return '❌';
  };

  const getStatusText = () => {
    if (status.isConnected) {
      return 'Connected';
    }
    return 'Disconnected';
  };

  return (
    <div className="webhook-status">
      <div className="d-flex align-items-center mb-2">
        <span className={`badge bg-${getStatusColor()} me-2`}>
          {getStatusIcon()}
        </span>
        <strong>Webhook Status: {getStatusText()}</strong>
        <button 
          className="btn btn-sm btn-outline-secondary ms-2"
          onClick={fetchStatus}
          title="Refresh status"
        >
          🔄
        </button>
      </div>

      <div className="small text-muted">
        <div>Last checked: {new Date(status.lastChecked).toLocaleString()}</div>
        <div>Subscriptions: {status.subscriptions.length}</div>
        {status.error && (
          <div className="text-danger mt-1">
            Error: {status.error}
          </div>
        )}
      </div>

      {/* Detailed status (collapsible) */}
      <details className="mt-2">
        <summary className="text-primary" style={{ cursor: 'pointer' }}>
          View Details
        </summary>
        <div className="mt-2 p-2 bg-light rounded small">
          <div><strong>Endpoint:</strong> {status.info.webhookEndpoint}</div>
          <div><strong>Environment:</strong> {status.info.environment}</div>
          <div><strong>Azure Tenant:</strong> {status.info.tenantId}</div>
          <div><strong>Azure Client:</strong> {status.info.clientId}</div>
          <div><strong>Client Secret:</strong> {status.info.hasClientSecret ? '✅ Configured' : '❌ Missing'}</div>
          <div><strong>Shared Mailbox:</strong> {status.info.sharedMailbox}</div>
          
          {status.subscriptions.length > 0 && (
            <div className="mt-2">
              <strong>Active Subscriptions:</strong>
              <ul className="list-unstyled ms-2">
                {status.subscriptions.map((sub, index) => (
                  <li key={index}>
                    ID: {sub.id} | Resource: {sub.resource}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </div>
  );
} 