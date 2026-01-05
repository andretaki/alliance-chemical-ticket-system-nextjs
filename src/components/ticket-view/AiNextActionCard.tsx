'use client';

import React from 'react';
import Link from 'next/link';
import { FileText, Truck, File, Bot } from 'lucide-react';

type ActionWithConfig = 'CREATE_QUOTE' | 'CHECK_ORDER_STATUS' | 'DOCUMENT_REQUEST';

interface ActionConfig {
  icon: React.ReactNode;
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
    icon: <FileText className="w-5 h-5" />,
    label: 'Create Quote',
    description: 'AI detected a request for product pricing.',
    btnClass: 'btn-success',
  },
  CHECK_ORDER_STATUS: {
    icon: <Truck className="w-5 h-5" />,
    label: 'Check Order Status',
    description: 'AI detected a question about an order.',
    btnClass: 'btn-info',
  },
  DOCUMENT_REQUEST: {
    icon: <File className="w-5 h-5" />,
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
        <Link href={`/tickets/${ticketId}/create-quote`} className={`btn ${config.btnClass} btn-lg shadow-sm d-inline-flex align-items-center gap-2`}>
          {config.icon} {config.label}
        </Link>
      );
    }

    return (
      <button onClick={() => onActionClick(action)} className={`btn ${config.btnClass} btn-lg shadow-sm d-inline-flex align-items-center gap-2`} disabled={isLoading}>
        {isLoading ? (
          <>
            <span className="spinner-border spinner-border-sm" role="status"></span>
            Processing...
          </>
        ) : (
          <>
            {config.icon} {config.label}
          </>
        )}
      </button>
    );
  };

  return (
    <div className="card text-center bg-primary-subtle border-primary shadow-lg mb-4 animate__animated animate__fadeInDown">
      <div className="card-body p-4">
        <div className="d-flex align-items-center justify-content-center gap-2 mb-2">
          <Bot className="w-5 h-5 text-primary" />
          <h5 className="card-title mb-0 text-primary">AI Suggested Next Action</h5>
        </div>
        <p className="card-text text-muted mb-3">{config.description}</p>
        <ActionButton />
      </div>
    </div>
  );
} 