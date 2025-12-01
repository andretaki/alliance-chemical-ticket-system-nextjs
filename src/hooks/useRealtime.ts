'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

interface RealtimeEvent {
  type: string;
  payload: any;
}

type EventHandler = (payload: any) => void;

export function useRealtime() {
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (eventSourceRef.current?.readyState === EventSource.OPEN) {
      return;
    }

    try {
      const eventSource = new EventSource('/api/realtime');

      eventSource.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        console.log('[Realtime] Connected');
      };

      eventSource.onmessage = (event) => {
        try {
          const data: RealtimeEvent = JSON.parse(event.data);

          // Handle heartbeat silently
          if (data.type === 'heartbeat') {
            return;
          }

          // Handle connection message
          if (data.type === 'connected') {
            console.log('[Realtime] Connection confirmed');
            return;
          }

          // Dispatch to registered handlers
          const handlers = handlersRef.current.get(data.type);
          if (handlers) {
            handlers.forEach((handler) => handler(data.payload));
          }

          // Also dispatch to wildcard handlers
          const wildcardHandlers = handlersRef.current.get('*');
          if (wildcardHandlers) {
            wildcardHandlers.forEach((handler) => handler(data));
          }
        } catch (e) {
          console.error('[Realtime] Failed to parse message:', e);
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource.close();
        eventSourceRef.current = null;

        // Attempt reconnection with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          console.log(`[Realtime] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          console.error('[Realtime] Max reconnection attempts reached');
        }
      };

      eventSourceRef.current = eventSource;
    } catch (e) {
      console.error('[Realtime] Failed to connect:', e);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Subscribe to events
  const subscribe = useCallback((eventType: string, handler: EventHandler) => {
    if (!handlersRef.current.has(eventType)) {
      handlersRef.current.set(eventType, new Set());
    }
    handlersRef.current.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      handlersRef.current.get(eventType)?.delete(handler);
    };
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    subscribe,
    reconnect: connect,
  };
}

// Hook for subscribing to specific ticket updates
export function useTicketUpdates(onUpdate: (data: { ticketId: number; action: string; data?: any }) => void) {
  const { subscribe, isConnected } = useRealtime();

  useEffect(() => {
    const unsubscribe = subscribe('ticket-update', onUpdate);
    return unsubscribe;
  }, [subscribe, onUpdate]);

  return { isConnected };
}

// Hook for dashboard stats updates
export function useDashboardUpdates(onUpdate: (stats: any) => void) {
  const { subscribe, isConnected } = useRealtime();

  useEffect(() => {
    const unsubscribe = subscribe('dashboard-update', onUpdate);
    return unsubscribe;
  }, [subscribe, onUpdate]);

  return { isConnected };
}
