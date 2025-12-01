/**
 * Real-time SSE Broadcast Service
 * Manages connected clients and broadcasts updates
 */

// Store connected clients
const clients = new Set<ReadableStreamDefaultController>();

/**
 * Broadcast update to all connected SSE clients
 */
export function broadcastUpdate(data: { type: string; payload: unknown }) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach((controller) => {
    try {
      controller.enqueue(new TextEncoder().encode(message));
    } catch {
      // Client disconnected, remove from set
      clients.delete(controller);
    }
  });
}

/**
 * Add a client controller to the broadcast list
 */
export function addClient(controller: ReadableStreamDefaultController) {
  clients.add(controller);
  return clients.size;
}

/**
 * Remove a client controller from the broadcast list
 */
export function removeClient(controller: ReadableStreamDefaultController) {
  clients.delete(controller);
  return clients.size;
}

/**
 * Get current connected client count
 */
export function getClientCount(): number {
  return clients.size;
}
