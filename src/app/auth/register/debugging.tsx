'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Debugging() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const handleDiagnose = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await fetch('/api/debug/database', {
        method: 'GET',
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Error diagnosing database');
      }
      
      setResult(JSON.stringify(data, null, 2));
      
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-8">
          <div className="card">
            <div className="card-header">
              <h3 className="text-center">Database Diagnostics</h3>
            </div>
            <div className="card-body">
              {error && (
                <div className="alert alert-danger" role="alert">
                  {error}
                </div>
              )}
              
              <div className="d-grid">
                <button 
                  className="btn btn-primary" 
                  onClick={handleDiagnose}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                      &nbsp;Diagnosing...
                    </>
                  ) : (
                    'Diagnose Database'
                  )}
                </button>
              </div>
              
              {result && (
                <div className="mt-4">
                  <h4>Diagnostic Results:</h4>
                  <pre className="bg-light p-3 border rounded">
                    {result}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 