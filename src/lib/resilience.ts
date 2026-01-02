/**
 * Resilience Utilities
 *
 * Provides circuit breaker and timeout patterns for external API calls.
 * Use these wrappers to prevent cascading failures when external services are slow or down.
 */

export interface ResilienceOptions {
  /** Timeout in milliseconds */
  timeout: number;
  /** Name for logging/debugging */
  name: string;
  /** Optional fallback value to return on failure */
  fallback?: unknown;
  /** Whether to log failures (default: true) */
  logFailures?: boolean;
}

export class TimeoutError extends Error {
  constructor(name: string, timeoutMs: number) {
    super(`${name} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker open for ${name}`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Circuit breaker state for each named service
 */
interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuits = new Map<string, CircuitState>();

// Circuit breaker configuration
const FAILURE_THRESHOLD = 5; // Open circuit after 5 failures
const RESET_TIMEOUT_MS = 30000; // Try again after 30 seconds
const HALF_OPEN_REQUESTS = 1; // Allow 1 request in half-open state

function getCircuit(name: string): CircuitState {
  if (!circuits.has(name)) {
    circuits.set(name, { failures: 0, lastFailure: 0, isOpen: false });
  }
  return circuits.get(name)!;
}

function recordSuccess(name: string): void {
  const circuit = getCircuit(name);
  circuit.failures = 0;
  circuit.isOpen = false;
}

function recordFailure(name: string): void {
  const circuit = getCircuit(name);
  circuit.failures++;
  circuit.lastFailure = Date.now();
  if (circuit.failures >= FAILURE_THRESHOLD) {
    circuit.isOpen = true;
    console.warn(`[Resilience] Circuit OPEN for ${name} after ${circuit.failures} failures`);
  }
}

function isCircuitOpen(name: string): boolean {
  const circuit = getCircuit(name);
  if (!circuit.isOpen) return false;

  // Check if we should try half-open
  const timeSinceLastFailure = Date.now() - circuit.lastFailure;
  if (timeSinceLastFailure >= RESET_TIMEOUT_MS) {
    console.log(`[Resilience] Circuit HALF-OPEN for ${name}, allowing test request`);
    return false; // Allow one request through
  }

  return true;
}

/**
 * Wrap an async function with timeout protection.
 *
 * @example
 * ```ts
 * const result = await withTimeout(
 *   () => fetch('https://api.example.com/data'),
 *   { timeout: 5000, name: 'ExampleAPI' }
 * );
 * ```
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  options: Pick<ResilienceOptions, 'timeout' | 'name'>
): Promise<T> {
  const { timeout, name } = options;

  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(name, timeout));
      }, timeout);
    }),
  ]);
}

/**
 * Wrap an async function with circuit breaker + timeout protection.
 *
 * Circuit breaker opens after repeated failures to prevent cascading issues.
 * Automatically closes after a cooldown period.
 *
 * @example
 * ```ts
 * const result = await withResilience(
 *   () => shopifyClient.query(PRODUCTS_QUERY),
 *   {
 *     timeout: 10000,
 *     name: 'ShopifyProducts',
 *     fallback: { products: [] },
 *   }
 * );
 * ```
 */
export async function withResilience<T>(
  fn: () => Promise<T>,
  options: ResilienceOptions
): Promise<T> {
  const { timeout, name, fallback, logFailures = true } = options;

  // Check circuit breaker
  if (isCircuitOpen(name)) {
    if (logFailures) {
      console.warn(`[Resilience] ${name} circuit is OPEN, returning fallback`);
    }
    if (fallback !== undefined) {
      return fallback as T;
    }
    throw new CircuitOpenError(name);
  }

  try {
    const result = await withTimeout(fn, { timeout, name });
    recordSuccess(name);
    return result;
  } catch (error) {
    recordFailure(name);

    if (logFailures) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Resilience] ${name} failed: ${errorMessage}`);
    }

    if (fallback !== undefined) {
      return fallback as T;
    }
    throw error;
  }
}

/**
 * Wrap an async function with retry logic.
 *
 * @example
 * ```ts
 * const result = await withRetry(
 *   () => fetch('https://api.example.com/data'),
 *   { maxAttempts: 3, delayMs: 1000, name: 'ExampleAPI' }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts: number;
    delayMs: number;
    name: string;
    backoffMultiplier?: number;
  }
): Promise<T> {
  const { maxAttempts, delayMs, name, backoffMultiplier = 2 } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
        console.log(`[Resilience] ${name} attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Combined resilience wrapper with retry + circuit breaker + timeout.
 *
 * This is the recommended wrapper for critical external API calls.
 *
 * @example
 * ```ts
 * const orders = await withFullResilience(
 *   () => shopifyService.getOrders(),
 *   {
 *     timeout: 15000,
 *     maxAttempts: 2,
 *     delayMs: 500,
 *     name: 'ShopifyOrders',
 *     fallback: [],
 *   }
 * );
 * ```
 */
export async function withFullResilience<T>(
  fn: () => Promise<T>,
  options: ResilienceOptions & {
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
  }
): Promise<T> {
  const {
    timeout,
    name,
    fallback,
    logFailures = true,
    maxAttempts = 2,
    delayMs = 500,
    backoffMultiplier = 2,
  } = options;

  // Check circuit breaker first
  if (isCircuitOpen(name)) {
    if (logFailures) {
      console.warn(`[Resilience] ${name} circuit is OPEN, returning fallback`);
    }
    if (fallback !== undefined) {
      return fallback as T;
    }
    throw new CircuitOpenError(name);
  }

  try {
    const result = await withRetry(
      () => withTimeout(fn, { timeout, name }),
      { maxAttempts, delayMs, name, backoffMultiplier }
    );
    recordSuccess(name);
    return result;
  } catch (error) {
    recordFailure(name);

    if (logFailures) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Resilience] ${name} failed after ${maxAttempts} attempts: ${errorMessage}`);
    }

    if (fallback !== undefined) {
      return fallback as T;
    }
    throw error;
  }
}

/**
 * Reset circuit breaker state for testing or manual recovery.
 */
export function resetCircuit(name: string): void {
  circuits.delete(name);
}

/**
 * Get current circuit state for monitoring.
 */
export function getCircuitState(name: string): CircuitState | undefined {
  return circuits.get(name);
}
