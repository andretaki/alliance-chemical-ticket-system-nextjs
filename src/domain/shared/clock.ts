/**
 * Clock interface - a port for time abstraction.
 *
 * The domain NEVER calls Date.now() directly. Instead, it receives
 * a Clock through dependency injection. This enables:
 *
 * 1. Deterministic testing (fixed timestamps)
 * 2. Time-travel in tests
 * 3. No side effects in domain
 */

export interface Clock {
  /** Get current timestamp as ISO string */
  now(): string;
  /** Get current timestamp as Date object */
  nowDate(): Date;
  /** Get current timestamp as Unix milliseconds */
  nowMs(): number;
}

/**
 * Real clock implementation - used in production.
 * Lives in @infra, not here, but interface is defined in domain.
 */
export const createRealClock = (): Clock => ({
  now: () => new Date().toISOString(),
  nowDate: () => new Date(),
  nowMs: () => Date.now(),
});

/**
 * Fixed clock for testing - always returns the same time.
 */
export const createFixedClock = (fixedTime: Date | string): Clock => {
  const date = typeof fixedTime === 'string' ? new Date(fixedTime) : fixedTime;
  return {
    now: () => date.toISOString(),
    nowDate: () => new Date(date),
    nowMs: () => date.getTime(),
  };
};

/**
 * Controllable clock for testing - can be advanced.
 */
export const createControllableClock = (initialTime: Date | string = new Date()): Clock & {
  advance: (ms: number) => void;
  set: (time: Date | string) => void;
} => {
  let current = typeof initialTime === 'string' ? new Date(initialTime) : new Date(initialTime);

  return {
    now: () => current.toISOString(),
    nowDate: () => new Date(current),
    nowMs: () => current.getTime(),
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
    set: (time: Date | string) => {
      current = typeof time === 'string' ? new Date(time) : new Date(time);
    },
  };
};
