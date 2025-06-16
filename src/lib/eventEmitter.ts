type EventCallback = (data: any) => void;

class EventEmitter {
  private static instance: EventEmitter;
  private clients: Set<EventCallback> = new Set();

  private constructor() {}

  static getInstance(): EventEmitter {
    if (!EventEmitter.instance) {
      EventEmitter.instance = new EventEmitter();
    }
    return EventEmitter.instance;
  }

  subscribe(callback: EventCallback): () => void {
    this.clients.add(callback);
    return () => this.clients.delete(callback);
  }

  emit(data: any) {
    this.clients.forEach(callback => callback(data));
  }
}

export const ticketEventEmitter = EventEmitter.getInstance(); 