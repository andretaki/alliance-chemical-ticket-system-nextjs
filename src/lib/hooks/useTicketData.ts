import { useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import type { Ticket as TicketData } from '@/types/ticket';

export function useTicketData(initialTicket: TicketData) {
  const [ticket, setTicket] = useState<TicketData>(initialTicket);

  const refreshTicket = useCallback(async () => {
    try {
      const response = await axios.get<TicketData>(`/api/tickets/${initialTicket.id}`);
      setTicket(response.data);
    } catch (err) {
      toast.error("Failed to refresh ticket data.");
    }
  }, [initialTicket.id]);

  return { ticket, setTicket, refreshTicket };
} 