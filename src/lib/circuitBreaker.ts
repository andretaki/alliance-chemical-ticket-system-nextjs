/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures when external services are down.
 */

import { logger } from '@/lib/logger';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  failureThreshold: number;     // Number of failures before opening
  successThreshold: number;     // Number of successes to close from half-open
  timeout: number;              // Time in ms before trying again (half-open)
  resetTimeout?: number;        // Optional: time to reset failure count when closed
}

interface CircuitStats {
  failures: number;
  successes: number;
  lastFailureTime: number;
  state: CircuitState;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000, // 30 seconds
  resetTimeout: 60000, // 1 minute
};

// Store circuit states per service
const circuits = new Map<string, CircuitStats>();

export class CircuitBreaker {
  private serviceName: string;
  private options: CircuitBreakerOptions;

  constructor(serviceName: string, options: Partial<CircuitBreakerOptions> = {}) {
    this.serviceName = serviceName;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    if (!circuits.has(serviceName)) {
      circuits.set(serviceName, {
        failures: 0,
        successes: 0,
        lastFailureTime: 0,
        state: 'CLOSED',
      });
    }
  }

  private getStats(): CircuitStats {
    return circuits.get(this.serviceName)!;
  }

  private updateStats(update: Partial<CircuitStats>) {
    const current = this.getStats();
    circuits.set(this.serviceName, { ...current, ...update });
  }

  getState(): CircuitState {
    const stats = this.getStats();

    if (stats.state === 'OPEN') {
      // Check if timeout has passed
      const now = Date.now();
      if (now - stats.lastFailureTime >= this.options.timeout) {
        this.updateStats({ state: 'HALF_OPEN', successes: 0 });
        return 'HALF_OPEN';
      }
    }

    return stats.state;
  }

  /**
   * Records a successful call
   */
  recordSuccess() {
    const stats = this.getStats();
    const state = this.getState();

    if (state === 'HALF_OPEN') {
      const newSuccesses = stats.successes + 1;
      if (newSuccesses >= this.options.successThreshold) {
        // Close the circuit
        this.updateStats({
          state: 'CLOSED',
          failures: 0,
          successes: 0,
        });
        logger.info('Circuit breaker recovered', { service: this.serviceName, state: 'CLOSED' });
      } else {
        this.updateStats({ successes: newSuccesses });
      }
    } else if (state === 'CLOSED' && stats.failures > 0) {
      // Reset failure count on success if closed
      const now = Date.now();
      if (this.options.resetTimeout && now - stats.lastFailureTime > this.options.resetTimeout) {
        this.updateStats({ failures: 0 });
      }
    }
  }

  /**
   * Records a failed call
   */
  recordFailure() {
    const stats = this.getStats();
    const state = this.getState();
    const now = Date.now();

    if (state === 'HALF_OPEN') {
      // Any failure in half-open reopens the circuit
      this.updateStats({
        state: 'OPEN',
        lastFailureTime: now,
        failures: stats.failures + 1,
      });
      logger.warn('Circuit breaker opened', { service: this.serviceName, reason: 'failed in half-open' });
    } else if (state === 'CLOSED') {
      const newFailures = stats.failures + 1;
      if (newFailures >= this.options.failureThreshold) {
        this.updateStats({
          state: 'OPEN',
          failures: newFailures,
          lastFailureTime: now,
        });
        logger.warn('Circuit breaker opened', { service: this.serviceName, reason: 'threshold reached', failures: newFailures });
      } else {
        this.updateStats({
          failures: newFailures,
          lastFailureTime: now,
        });
      }
    }
  }

  /**
   * Checks if the circuit allows requests
   */
  isAllowed(): boolean {
    const state = this.getState();
    return state !== 'OPEN';
  }

  /**
   * Wraps an async function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>, fallback?: () => T | Promise<T>): Promise<T> {
    if (!this.isAllowed()) {
      logger.debug('Circuit breaker blocked request', { service: this.serviceName, state: 'OPEN' });
      if (fallback) {
        return fallback();
      }
      throw new CircuitOpenError(this.serviceName);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      if (fallback && this.getState() === 'OPEN') {
        return fallback();
      }
      throw error;
    }
  }

  /**
   * Gets status info for monitoring
   */
  getStatus(): { service: string; state: CircuitState; failures: number; successes: number } {
    const stats = this.getStats();
    return {
      service: this.serviceName,
      state: this.getState(),
      failures: stats.failures,
      successes: stats.successes,
    };
  }

  /**
   * Manually reset the circuit
   */
  reset() {
    this.updateStats({
      state: 'CLOSED',
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
    });
  }
}

export class CircuitOpenError extends Error {
  constructor(serviceName: string) {
    super(`Circuit breaker is open for service: ${serviceName}`);
    this.name = 'CircuitOpenError';
  }
}

// Pre-configured circuit breakers for common services
export const circuitBreakers = {
  shopify: new CircuitBreaker('shopify', { failureThreshold: 3, timeout: 60000 }),
  shipstation: new CircuitBreaker('shipstation', { failureThreshold: 5, timeout: 30000 }),
  quickbooks: new CircuitBreaker('quickbooks', { failureThreshold: 3, timeout: 60000 }),
  microsoftGraph: new CircuitBreaker('microsoft-graph', { failureThreshold: 3, timeout: 30000 }),
  geminiAI: new CircuitBreaker('gemini-ai', { failureThreshold: 5, timeout: 15000 }),
  amazonSpApi: new CircuitBreaker('amazon-sp-api', { failureThreshold: 5, timeout: 30000 }),
};

/**
 * Get all circuit breaker statuses for monitoring
 */
export function getAllCircuitStatus() {
  return Object.entries(circuitBreakers).map(([name, breaker]) => ({
    name,
    ...breaker.getStatus(),
  }));
}
