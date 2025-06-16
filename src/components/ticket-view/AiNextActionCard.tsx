'use client';

import React from 'react';
import Link from 'next/link';

type ActionWithConfig = 'CREATE_QUOTE' | 'CHECK_ORDER_STATUS' | 'DOCUMENT_REQUEST';

interface ActionConfig {
  icon: string;
  label: string;
  description: string;
  btnClass: string;
}

interface AiNextActionCardProps {
  action: ActionWithConfig | 'GENERAL_REPLY' | null | undefined;
  ticketId: number;
  onActionClick: (action: string) => void;
  isLoading?: boolean;
}

const actionConfig: Record<ActionWithConfig, ActionConfig> = {
  CREATE_QUOTE: {
    icon: 'fas fa-file-invoice-dollar',
    label: 'Create Quote',
    description: 'AI detected a request for product pricing.',
    btnClass: 'btn-success',
  },
  CHECK_ORDER_STATUS: {
    icon: 'fas fa-truck',
    label: 'Check Order Status',
    description: 'AI detected a question about an order.',
    btnClass: 'btn-info',
  },
  DOCUMENT_REQUEST: {
    icon: 'fas fa-file-alt',
    label: 'Find Document',
    description: 'AI detected a request for a document (e.g., SDS, COA).',
    btnClass: 'btn-secondary',
  },
};

export default function AiNextActionCard({ action, ticketId, onActionClick, isLoading = false }: AiNextActionCardProps) {
  if (!action || action === 'GENERAL_REPLY') {
    return null;
  }

  const config = actionConfig[action];

  const ActionButton = () => {
    if (action === 'CREATE_QUOTE') {
      return (
        <Link href={`/tickets/${ticketId}/create-quote`} className={`btn ${config.btnClass} btn-lg shadow-sm`}>
          <i className={`${config.icon} me-2`}></i> {config.label}
        </Link>
      );
    }

    return (
      <button onClick={() => onActionClick(action)} className={`btn ${config.btnClass} btn-lg shadow-sm`} disabled={isLoading}>
        {isLoading ? (
          <>
            <span className="spinner-border spinner-border-sm me-2" role="status"></span>
            Processing...
          </>
        ) : (
          <>
            <i className={`${config.icon} me-2`}></i> {config.label}
          </>
        )}
      </button>
    );
  };

  return (
    <div className="card text-center bg-primary-subtle border-primary shadow-lg mb-4 animate__animated animate__fadeInDown">
      <div className="card-body p-4">
        <div className="d-flex align-items-center justify-content-center mb-2">
          <i className="fas fa-robot text-primary me-2"></i>
          <h5 className="card-title mb-0 text-primary">AI Suggested Next Action</h5>
        </div>
        <p className="card-text text-muted mb-3">{config.description}</p>
        <ActionButton />
      </div>
    </div>
  );
} 