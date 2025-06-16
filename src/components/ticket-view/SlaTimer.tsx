'use client';

import React, { useState, useEffect } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Tooltip, OverlayTrigger } from 'react-bootstrap';

interface SlaTimerProps {
  label: string;
  dueDate: string | null;
  isBreached: boolean;
}

export default function SlaTimer({ label, dueDate, isBreached }: SlaTimerProps) {
  const [timeLeft, setTimeLeft] = useState('');
  const [urgency, setUrgency] = useState<'normal' | 'warning' | 'breached'>('normal');

  useEffect(() => {
    if (!dueDate) return;

    const updateTimer = () => {
      const due = new Date(dueDate);
      const now = new Date();
      const diffMs = due.getTime() - now.getTime();

      if (diffMs <= 0) {
        setTimeLeft('Breached');
        setUrgency('breached');
        return;
      }
      
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours < 1) setUrgency('warning');
      else setUrgency('normal');
      
      setTimeLeft(formatDistanceToNowStrict(due, { addSuffix: true }));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [dueDate]);

  if (!dueDate) return null;

  const colorClasses = {
    normal: 'text-success',
    warning: 'text-warning',
    breached: 'text-danger fw-bold animate-pulse',
  };
  
  const iconClasses = {
    normal: 'fas fa-clock',
    warning: 'fas fa-hourglass-half',
    breached: 'fas fa-fire-alt',
  };

  const fullDate = new Date(dueDate).toLocaleString();

  return (
    <OverlayTrigger
      placement="top"
      overlay={<Tooltip id={`tooltip-sla-${label}`}>{label} due on {fullDate}</Tooltip>}
    >
      <div className={`d-flex align-items-center gap-2 small ${colorClasses[urgency]}`}>
        <i className={iconClasses[urgency]}></i>
        <span>{timeLeft}</span>
      </div>
    </OverlayTrigger>
  );
} 