'use client';

import React, { useState } from 'react';
import axios from 'axios';

const ProcessEmailsSidebarButton: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  const processEmails = async () => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    try {
      await axios.post('/api/process-emails');
      // Just silently succeed - we don't have room for detailed feedback in sidebar
    } catch (err) {
      console.error('Failed to process emails:', err);
      // We could add a toast notification here in the future
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <button 
      onClick={processEmails} 
      disabled={isProcessing}
      className="btn btn-primary w-100"
      title="Process new emails into tickets"
    >
      {isProcessing ? (
        <>
          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
          Processing...
        </>
      ) : (
        <>
          <i className="fas fa-sync-alt me-1"></i>
          Process Emails
        </>
      )}
    </button>
  );
};

export default ProcessEmailsSidebarButton; 