import { NextRequest } from 'next/server';
import { addClient, removeClient, getClientCount } from '@/lib/realtimeBroadcast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      const clientCount = addClient(controller);

      // Send initial connection message
      const connectMessage = `data: ${JSON.stringify({ type: 'connected', payload: { clientCount } })}\n\n`;
      controller.enqueue(new TextEncoder().encode(connectMessage));

      // Keep connection alive with heartbeat
      const heartbeat = setInterval(() => {
        try {
          const ping = `data: ${JSON.stringify({ type: 'heartbeat', payload: { timestamp: Date.now() } })}\n\n`;
          controller.enqueue(new TextEncoder().encode(ping));
        } catch {
          clearInterval(heartbeat);
          removeClient(controller);
        }
      }, 30000); // Every 30 seconds

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        removeClient(controller);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
    cancel() {
      // Client disconnected - cleanup handled in abort listener
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
