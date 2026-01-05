/**
 * IdGenerator interface - a port for ID generation.
 *
 * The domain NEVER calls crypto.randomUUID() directly. Instead, it receives
 * an IdGenerator through dependency injection. This enables:
 *
 * 1. Deterministic testing (predictable IDs)
 * 2. Custom ID formats per aggregate
 * 3. No side effects in domain
 */

export interface IdGenerator {
  /** Generate a new unique ID */
  generate(): string;
}

/**
 * UUID generator - used in production.
 * Uses crypto.randomUUID for secure random IDs.
 */
export const createUuidGenerator = (): IdGenerator => ({
  generate: () => crypto.randomUUID(),
});

/**
 * Sequential generator for testing.
 * Produces predictable IDs like "test-id-1", "test-id-2", etc.
 */
export const createSequentialIdGenerator = (prefix = 'test-id'): IdGenerator => {
  let counter = 0;
  return {
    generate: () => `${prefix}-${++counter}`,
  };
};

/**
 * Fixed generator for testing single operations.
 * Always returns the same ID.
 */
export const createFixedIdGenerator = (fixedId: string): IdGenerator => ({
  generate: () => fixedId,
});

/**
 * Prefixed ticket ID generator.
 * Generates IDs like "TKT-abc123"
 */
export const createTicketIdGenerator = (): IdGenerator => ({
  generate: () => `TKT-${crypto.randomUUID().slice(0, 8)}`,
});
