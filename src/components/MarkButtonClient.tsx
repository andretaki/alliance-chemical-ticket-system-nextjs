'use client';

import React, { useState, useEffect } from 'react';
import axios, { AxiosError } from 'axios';
import { ticketStatusEnum } from '@/db/schema'; // Import enum

interface MarkButtonProps {
  initialStatus: string; // The status when the component mounts
  ticketId: number;
  onStatusChange: () => void; // Callback to notify parent (e.g., TicketList)
}

const MarkButtonClient: React.FC<MarkButtonProps> = ({ initialStatus, ticketId, onStatusChange }) => {
  const [currentStatus, setCurrentStatus] = useState(initialStatus);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update local state if the initial prop changes (e.g., parent refreshes)
  useEffect(() => {
    setCurrentStatus(initialStatus);
  }, [initialStatus]);

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault(); // Prevent default button behavior if it were in a form
    setIsLoading(true);
    setError(null);

    // Determine the next status based on the *current* state
    const isResolved = currentStatus === ticketStatusEnum.enumValues[2]; // Assuming 'resolved' is at index 2
    const nextStatus = isResolved
      ? ticketStatusEnum.enumValues[0] // Mark as 'open' (index 0)
      : ticketStatusEnum.enumValues[2]; // Mark as 'resolved'

    try {
      // Send ONLY the status update via PUT
      await axios.put(`/api/tickets/${ticketId}`, { status: nextStatus });

      // Optimistic UI update (update local state immediately)
      setCurrentStatus(nextStatus);

      // Notify parent component to refetch all data
      onStatusChange();

    } catch (err: unknown) {
      console.error(`Error updating ticket ${ticketId} status:`, err);
      let message = 'Failed to update status.';
      if (axios.isAxiosError(err)) {
         const axiosError = err as AxiosError<{ error?: string }>;
         message = axiosError.response?.data?.error || message;
      }
      setError(message);
      // Revert optimistic update on error
      setCurrentStatus(currentStatus); // Use the status *before* the click attempt
      // Optionally clear the error message after a few seconds
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  const isCurrentlyResolved = currentStatus === ticketStatusEnum.enumValues[2]; // Use current local state
  const buttonText = isCurrentlyResolved ? 'Mark as Open' : 'Mark as Resolved';
  const buttonClass = isCurrentlyResolved
    ? 'btn btn-outline-secondary btn-sm w-100 text-start' // Use outline buttons for consistency
    : 'btn btn-outline-success btn-sm w-100 text-start';
  const iconClass = isCurrentlyResolved ? 'fas fa-undo' : 'fas fa-check';

  return (
    <>
      <button
        onClick={handleClick}
        className={buttonClass}
        disabled={isLoading}
        title={buttonText} // Add title for accessibility
      >
        <i className={iconClass}></i> {isLoading ? 'Updating...' : buttonText}
      </button>
      {/* Display error specifically for this button */}
      {error && <small className="text-danger d-block mt-1">{error}</small>}
    </>
  );
};

export default MarkButtonClient; 