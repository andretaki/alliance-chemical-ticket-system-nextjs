'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface CustomerAutoCreateStatus {
  autoCreateEnabled: boolean;
  statistics: {
    totalTicketsWithEmails: number;
    recentTicketsWithEmails: number;
    lastChecked: string;
  };
  configuration: {
    enabledViaEnv: boolean;
  };
}

interface BatchCreateResult {
  success: boolean;
  summary?: {
    totalProcessed: number;
    customersCreated: number;
    customersFailed: number;
    customersSkipped: number;
  };
  details?: any[];
  dryRun?: boolean;
  totalTickets?: number;
  preview?: any[];
  message?: string;
  error?: string;
}

export default function CustomerAutoCreateManager() {
  const [status, setStatus] = useState<CustomerAutoCreateStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchCreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state for batch processing
  const [daysBack, setDaysBack] = useState(30);
  const [dryRun, setDryRun] = useState(true);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await axios.get('/api/admin/customers/auto-create');
      setStatus(response.data);
    } catch (err: any) {
      console.error('Error fetching status:', err);
      setError(err.response?.data?.error || 'Failed to fetch status');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchCreate = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      setBatchResult(null);

      const response = await axios.post('/api/admin/customers/auto-create', {
        createFromExisting: true,
        limitToRecent: true,
        daysBack,
        dryRun
      });

      setBatchResult(response.data);
      
      // Refresh status after successful creation
      if (!dryRun && response.data.success) {
        await fetchStatus();
      }
    } catch (err: any) {
      console.error('Error in batch creation:', err);
      setBatchResult({
        success: false,
        error: err.response?.data?.error || 'Failed to process batch creation'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="card">
        <div className="card-body text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2">Loading customer auto-creation status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-auto-create-manager">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="mb-0">Customer Auto-Creation Management</h4>
        <button 
          className="btn btn-outline-secondary btn-sm"
          onClick={fetchStatus}
          disabled={isLoading}
        >
          <i className="fas fa-sync-alt me-1"></i>
          Refresh
        </button>
      </div>

      {error && (
        <div className="alert alert-danger">
          <i className="fas fa-exclamation-triangle me-2"></i>
          {error}
        </div>
      )}

      {/* Status Card */}
      {status && (
        <div className="card mb-4">
          <div className="card-header">
            <h5 className="mb-0">
              <i className="fas fa-cog me-2"></i>
              Configuration & Status
            </h5>
          </div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-6">
                <h6>Auto-Creation Status</h6>
                <div className="d-flex align-items-center mb-3">
                  <span className={`badge me-2 ${status.autoCreateEnabled ? 'bg-success' : 'bg-warning'}`}>
                    {status.autoCreateEnabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                  <small className="text-muted">
                    {status.configuration.enabledViaEnv ? '(via environment)' : '(default setting)'}
                  </small>
                </div>
                
                <p className="text-muted small mb-0">
                  When enabled, new customers are automatically added to Shopify when they create tickets or send emails to support.
                </p>
              </div>
              
              <div className="col-md-6">
                <h6>Statistics</h6>
                <div className="row g-2">
                  <div className="col-6">
                    <div className="text-center p-2 border rounded">
                      <div className="h5 mb-0 text-primary">{status.statistics.totalTicketsWithEmails}</div>
                      <small className="text-muted">Total Tickets w/ Emails</small>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="text-center p-2 border rounded">
                      <div className="h5 mb-0 text-info">{status.statistics.recentTicketsWithEmails}</div>
                      <small className="text-muted">Last 30 Days</small>
                    </div>
                  </div>
                </div>
                <small className="text-muted mt-2 d-block">
                  Last checked: {new Date(status.statistics.lastChecked).toLocaleString()}
                </small>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Processing Card */}
      <div className="card">
        <div className="card-header">
          <h5 className="mb-0">
            <i className="fas fa-users me-2"></i>
            Batch Create Customers from Existing Tickets
          </h5>
        </div>
        <div className="card-body">
          <p className="text-muted">
            Create Shopify customers from tickets that were created before auto-creation was enabled.
          </p>

          <div className="row g-3 mb-3">
            <div className="col-md-4">
              <label htmlFor="daysBack" className="form-label">Days Back</label>
              <input
                type="number"
                id="daysBack"
                className="form-control"
                value={daysBack}
                onChange={(e) => setDaysBack(parseInt(e.target.value) || 30)}
                min="1"
                max="365"
              />
              <small className="text-muted">How many days back to process tickets</small>
            </div>
            
            <div className="col-md-4">
              <label className="form-label">Mode</label>
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="radio"
                  name="mode"
                  id="dryRun"
                  checked={dryRun}
                  onChange={() => setDryRun(true)}
                />
                <label className="form-check-label" htmlFor="dryRun">
                  Dry Run (Preview Only)
                </label>
              </div>
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="radio"
                  name="mode"
                  id="actualRun"
                  checked={!dryRun}
                  onChange={() => setDryRun(false)}
                />
                <label className="form-check-label" htmlFor="actualRun">
                  Actual Creation
                </label>
              </div>
            </div>
            
            <div className="col-md-4 d-flex align-items-end">
              <button
                className={`btn ${dryRun ? 'btn-outline-primary' : 'btn-primary'} w-100`}
                onClick={handleBatchCreate}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                    Processing...
                  </>
                ) : (
                  <>
                    <i className={`fas ${dryRun ? 'fa-search' : 'fa-users'} me-2`}></i>
                    {dryRun ? 'Preview' : 'Create Customers'}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Results */}
          {batchResult && (
            <div className={`alert ${batchResult.success ? 'alert-success' : 'alert-danger'}`}>
              {batchResult.dryRun ? (
                <div>
                  <h6><i className="fas fa-search me-2"></i>Preview Results</h6>
                  <p className="mb-2">{batchResult.message}</p>
                  {batchResult.preview && batchResult.preview.length > 0 && (
                    <div className="mt-3">
                      <small className="text-muted d-block mb-2">Sample tickets that would be processed:</small>
                      <div className="table-responsive">
                        <table className="table table-sm">
                          <thead>
                            <tr>
                              <th>Ticket</th>
                              <th>Email</th>
                              <th>Name</th>
                              <th>Source</th>
                              <th>Created</th>
                            </tr>
                          </thead>
                          <tbody>
                            {batchResult.preview.slice(0, 5).map((ticket: any) => (
                              <tr key={ticket.ticketId}>
                                <td>#{ticket.ticketId}</td>
                                <td className="small">{ticket.email}</td>
                                <td className="small">{ticket.name || 'N/A'}</td>
                                <td>
                                  <span className={`badge ${ticket.source === 'email' ? 'bg-info' : 'bg-secondary'}`}>
                                    {ticket.source}
                                  </span>
                                </td>
                                <td className="small">{new Date(ticket.createdAt).toLocaleDateString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : batchResult.success ? (
                <div>
                  <h6><i className="fas fa-check-circle me-2"></i>Batch Creation Completed</h6>
                  {batchResult.summary && (
                    <div className="row g-2 mt-2">
                      <div className="col-3">
                        <div className="text-center p-2 bg-white rounded">
                          <div className="h6 mb-0 text-success">{batchResult.summary.customersCreated}</div>
                          <small>Created</small>
                        </div>
                      </div>
                      <div className="col-3">
                        <div className="text-center p-2 bg-white rounded">
                          <div className="h6 mb-0 text-warning">{batchResult.summary.customersSkipped}</div>
                          <small>Skipped</small>
                        </div>
                      </div>
                      <div className="col-3">
                        <div className="text-center p-2 bg-white rounded">
                          <div className="h6 mb-0 text-danger">{batchResult.summary.customersFailed}</div>
                          <small>Failed</small>
                        </div>
                      </div>
                      <div className="col-3">
                        <div className="text-center p-2 bg-white rounded">
                          <div className="h6 mb-0 text-info">{batchResult.summary.totalProcessed}</div>
                          <small>Total</small>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <h6><i className="fas fa-exclamation-triangle me-2"></i>Error</h6>
                  <p className="mb-0">{batchResult.error}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 