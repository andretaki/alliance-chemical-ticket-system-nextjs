/**
 * Domain shared utilities - the foundation of the functional core.
 *
 * These are pure, side-effect-free utilities that can be used
 * throughout the domain layer.
 */

// Result type for explicit error handling
export {
  type Result,
  type AsyncResult,
  ok,
  err,
  isOk,
  isErr,
  Result as ResultNS,
} from './result';

// Option type for explicit null handling
export {
  type Option,
  some,
  none,
  isSome,
  isNone,
  Option as OptionNS,
} from './option';

// Clock interface for time abstraction
export {
  type Clock,
  createRealClock,
  createFixedClock,
  createControllableClock,
} from './clock';

// ID generator interface
export {
  type IdGenerator,
  createUuidGenerator,
  createSequentialIdGenerator,
  createFixedIdGenerator,
  createTicketIdGenerator,
} from './id';
