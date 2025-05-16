import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { ticketEventEmitter } from '@/lib/eventEmitter';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export async function GET() {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      console.log('SSE: Unauthorized access attempt');
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const headersList = headers();
    const userAgent = headersList.get('user-agent') || 'unknown';
    const clientIp = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';

    console.log('SSE: New connection request', {
      user: session.user?.email,
      userAgent,
      clientIp,
      timestamp: new Date().toISOString()
    });

    // Set up SSE headers
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', 'text/event-stream');
    responseHeaders.set('Cache-Control', 'no-cache, no-transform');
    responseHeaders.set('Connection', 'keep-alive');
    responseHeaders.set('X-Accel-Buffering', 'no');
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    // Create a new ReadableStream for SSE
    const stream = new ReadableStream({
      start(controller) {
        console.log('SSE: Stream opened', {
          user: session.user?.email,
          timestamp: new Date().toISOString()
        });

        let isClosed = false;
        let keepAlive: NodeJS.Timeout | null = null;
        let reconnectAttempt = 0;
        const maxReconnectAttempts = 3;

        // --- Event Handler ---
        const handleEvent = (data: any) => {
          if (isClosed) return;
          try {
            const eventData = JSON.stringify(data);
            const eventId = Date.now();
            controller.enqueue(new TextEncoder().encode(`id: ${eventId}\ndata: ${eventData}\n\n`));
            console.log('SSE: Event sent', {
              eventId,
              type: data.type,
              user: session.user?.email
            });
          } catch (error: any) {
            console.error('SSE: Error sending data event:', {
              error: error.message,
              code: error.code,
              user: session.user?.email
            });

            if (error.code !== 'ERR_INVALID_STATE' && reconnectAttempt < maxReconnectAttempts) {
              reconnectAttempt++;
              console.log(`SSE: Attempting to reconnect (${reconnectAttempt}/${maxReconnectAttempts})...`);
              setTimeout(() => {
                if (!isClosed) handleEvent(data);
              }, 1000 * reconnectAttempt);
            } else {
              cleanup();
            }
          }
        };

        // Subscribe to ticket events
        const unsubscribe = ticketEventEmitter.subscribe(handleEvent);

        // --- Keep-Alive Ping ---
        const sendPing = () => {
          if (isClosed) return;
          try {
            const pingId = Date.now();
            controller.enqueue(new TextEncoder().encode(`event: ping\nid: ${pingId}\ndata: {}\n\n`));
            console.log('SSE: Keep-alive ping sent', {
              pingId,
              user: session.user?.email
            });
            reconnectAttempt = 0;
          } catch (error: any) {
            console.error('SSE: Error sending keep-alive ping:', {
              error: error.message,
              code: error.code,
              user: session.user?.email
            });
            if (error.code !== 'ERR_INVALID_STATE') {
              cleanup();
            }
          }
        };

        // Start the keep-alive interval (15 seconds)
        keepAlive = setInterval(sendPing, 15000);

        // --- Cleanup Function ---
        const cleanup = () => {
          if (isClosed) return;

          isClosed = true;
          console.log('SSE: Stream closed', {
            user: session.user?.email,
            timestamp: new Date().toISOString()
          });

          if (keepAlive) {
            clearInterval(keepAlive);
            keepAlive = null;
          }

          unsubscribe();

          try {
            if (controller.desiredSize !== null) {
              controller.close();
            }
          } catch (e) {
            if ((e as any).code !== 'ERR_INVALID_STATE') {
              console.warn('SSE: Error during controller close:', {
                error: (e as Error).message,
                user: session.user?.email
              });
            }
          }
        };

        // Send initial connection established event
        try {
          const initialEvent = {
            type: 'connected',
            timestamp: new Date().toISOString(),
            userId: session.user?.email
          };
          controller.enqueue(new TextEncoder().encode(`event: connected\ndata: ${JSON.stringify(initialEvent)}\n\n`));
          console.log('SSE: Initial connection event sent', {
            user: session.user?.email,
            timestamp: initialEvent.timestamp
          });
        } catch (error) {
          console.error('SSE: Error sending initial connection event:', {
            error: (error as Error).message,
            user: session.user?.email
          });
        }

        return cleanup;
      },
      cancel(reason) {
        console.log('SSE: Stream cancelled', {
          user: session.user?.email,
          reason,
          timestamp: new Date().toISOString()
        });
      },
    });

    return new NextResponse(stream, {
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('SSE: Unexpected error in route handler:', {
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}