'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

export default function GraphApiTester() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleTestClick = async () => {
    setIsLoading(true);
    setResult(null);
    const toastId = toast.loading('Running Graph API test...');

    try {
      const response = await axios.post('/api/admin/debug/test-graph-api');
      setResult(response.data);
      if (response.data.success) {
        toast.success('Graph API connection is working!', { id: toastId });
      } else {
        toast.error('Test Failed. See details below.', { id: toastId });
      }
    } catch (error: any) {
      setResult(error.response?.data || { success: false, message: 'Client-side error.', error: { message: error.message }});
      toast.error('Test Failed. An unexpected error occurred.', { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h5 className="card-title mb-0">Graph API Mailbox Test</h5>
      </div>
      <div className="card-body">
        <p className="card-text text-muted small">
          This test attempts to read the top 1 email from the configured shared mailbox (`{process.env.NEXT_PUBLIC_SHARED_MAILBOX_ADDRESS || 'Not Set'}`). This helps diagnose permission issues between Vercel and Microsoft 365.
        </p>
        <button
          className="btn btn-warning"
          onClick={handleTestClick}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status"></span>
              Testing...
            </>
          ) : (
            'Run Connection Test'
          )}
        </button>

        {result && (
          <div className="mt-4">
            <h6>Test Result:</h6>
            <pre className={`p-3 rounded ${result.success ? 'bg-success-subtle' : 'bg-danger-subtle'}`}>
              <code>{JSON.stringify(result, null, 2)}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
} 