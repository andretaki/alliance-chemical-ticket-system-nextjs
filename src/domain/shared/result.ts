/**
 * Result type for explicit error handling without exceptions.
 *
 * This is the foundation of our functional core - all domain operations
 * return Result<E, A> instead of throwing exceptions.
 *
 * Convention: Left is Error, Right is Success (like Either in Haskell/fp-ts)
 */

// Discriminated union for Result
export type Result<E, A> =
  | { readonly _tag: 'Err'; readonly error: E }
  | { readonly _tag: 'Ok'; readonly value: A };

// Constructors
export const ok = <A>(value: A): Result<never, A> => ({
  _tag: 'Ok',
  value,
});

export const err = <E>(error: E): Result<E, never> => ({
  _tag: 'Err',
  error,
});

// Type guards
export const isOk = <E, A>(result: Result<E, A>): result is { readonly _tag: 'Ok'; readonly value: A } =>
  result._tag === 'Ok';

export const isErr = <E, A>(result: Result<E, A>): result is { readonly _tag: 'Err'; readonly error: E } =>
  result._tag === 'Err';

// Extractors (unsafe - use match for safety)
export const unwrap = <E, A>(result: Result<E, A>): A => {
  if (isOk(result)) return result.value;
  throw new Error(`Called unwrap on Err: ${JSON.stringify(result.error)}`);
};

export const unwrapErr = <E, A>(result: Result<E, A>): E => {
  if (isErr(result)) return result.error;
  throw new Error(`Called unwrapErr on Ok: ${JSON.stringify(result.value)}`);
};

export const unwrapOr = <E, A>(result: Result<E, A>, defaultValue: A): A =>
  isOk(result) ? result.value : defaultValue;

// Pattern matching
export const match = <E, A, B>(
  result: Result<E, A>,
  handlers: {
    ok: (value: A) => B;
    err: (error: E) => B;
  }
): B => {
  if (isOk(result)) return handlers.ok(result.value);
  return handlers.err(result.error);
};

// Functor: map over success value
export const map = <E, A, B>(result: Result<E, A>, fn: (a: A) => B): Result<E, B> => {
  if (isErr(result)) return result;
  return ok(fn(result.value));
};

// Map over error value
export const mapErr = <E, A, F>(result: Result<E, A>, fn: (e: E) => F): Result<F, A> => {
  if (isOk(result)) return result;
  return err(fn(result.error));
};

// Monad: chain/flatMap
export const flatMap = <E, A, F, B>(
  result: Result<E, A>,
  fn: (a: A) => Result<F, B>
): Result<E | F, B> => {
  if (isErr(result)) return result;
  return fn(result.value);
};

// Alias for flatMap (common in FP libraries)
export const chain = flatMap;
export const andThen = flatMap;

// Applicative: apply a wrapped function
export const ap = <E, A, B>(
  resultFn: Result<E, (a: A) => B>,
  result: Result<E, A>
): Result<E, B> => {
  if (isErr(resultFn)) return resultFn;
  if (isErr(result)) return result;
  return ok(resultFn.value(result.value));
};

// Combine multiple Results
export const all = <E, A extends readonly unknown[]>(
  results: { [K in keyof A]: Result<E, A[K]> }
): Result<E, A> => {
  const values: unknown[] = [];
  for (const result of results) {
    if (isErr(result)) return result;
    values.push(result.value);
  }
  return ok(values as unknown as A);
};

// Collect all errors (for validation)
export const collectErrors = <E, A>(results: Result<E, A>[]): E[] =>
  results.filter(isErr).map(r => r.error);

// Convert nullable to Result
export const fromNullable = <A>(
  value: A | null | undefined,
  errorFn: () => string
): Result<string, A> => {
  if (value === null || value === undefined) {
    return err(errorFn());
  }
  return ok(value);
};

// Try/catch wrapper
export const tryCatch = <A>(
  fn: () => A,
  onError: (e: unknown) => string
): Result<string, A> => {
  try {
    return ok(fn());
  } catch (e) {
    return err(onError(e));
  }
};

// Async version of tryCatch
export const tryCatchAsync = async <A>(
  fn: () => Promise<A>,
  onError: (e: unknown) => string
): Promise<Result<string, A>> => {
  try {
    return ok(await fn());
  } catch (e) {
    return err(onError(e));
  }
};

// Do notation helper for chaining multiple operations
export const Do = <E>(): Result<E, Record<string, never>> => ok({});

export const bind = <E, A extends object, K extends string, B>(
  result: Result<E, A>,
  key: Exclude<K, keyof A>,
  fn: (a: A) => Result<E, B>
): Result<E, A & { [P in K]: B }> => {
  if (isErr(result)) return result;
  const next = fn(result.value);
  if (isErr(next)) return next;
  return ok({ ...result.value, [key]: next.value } as A & { [P in K]: B });
};

// Tap: run a side effect without changing the result
export const tap = <E, A>(result: Result<E, A>, fn: (a: A) => void): Result<E, A> => {
  if (isOk(result)) fn(result.value);
  return result;
};

// Type aliases for common patterns
export type AsyncResult<E, A> = Promise<Result<E, A>>;

// Namespace for cleaner imports
export const Result = {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  unwrapOr,
  match,
  map,
  mapErr,
  flatMap,
  chain,
  andThen,
  ap,
  all,
  collectErrors,
  fromNullable,
  tryCatch,
  tryCatchAsync,
  Do,
  bind,
  tap,
} as const;
