/**
 * Option type for explicit null handling.
 *
 * Use Option<A> instead of A | null | undefined to make
 * absence explicit and force handling at type level.
 */

// Discriminated union for Option
export type Option<A> =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Some'; readonly value: A };

// Constructors
export const some = <A>(value: A): Option<A> => ({
  _tag: 'Some',
  value,
});

export const none: Option<never> = { _tag: 'None' };

// Type guards
export const isSome = <A>(option: Option<A>): option is { readonly _tag: 'Some'; readonly value: A } =>
  option._tag === 'Some';

export const isNone = <A>(option: Option<A>): option is { readonly _tag: 'None' } =>
  option._tag === 'None';

// Extractors
export const unwrap = <A>(option: Option<A>): A => {
  if (isSome(option)) return option.value;
  throw new Error('Called unwrap on None');
};

export const unwrapOr = <A>(option: Option<A>, defaultValue: A): A =>
  isSome(option) ? option.value : defaultValue;

export const unwrapOrElse = <A>(option: Option<A>, fn: () => A): A =>
  isSome(option) ? option.value : fn();

// Pattern matching
export const match = <A, B>(
  option: Option<A>,
  handlers: {
    some: (value: A) => B;
    none: () => B;
  }
): B => {
  if (isSome(option)) return handlers.some(option.value);
  return handlers.none();
};

// Functor: map over value
export const map = <A, B>(option: Option<A>, fn: (a: A) => B): Option<B> => {
  if (isNone(option)) return none;
  return some(fn(option.value));
};

// Monad: chain/flatMap
export const flatMap = <A, B>(option: Option<A>, fn: (a: A) => Option<B>): Option<B> => {
  if (isNone(option)) return none;
  return fn(option.value);
};

// Alias
export const chain = flatMap;
export const andThen = flatMap;

// Filter
export const filter = <A>(option: Option<A>, predicate: (a: A) => boolean): Option<A> => {
  if (isNone(option)) return none;
  return predicate(option.value) ? option : none;
};

// Convert from nullable
export const fromNullable = <A>(value: A | null | undefined): Option<A> => {
  if (value === null || value === undefined) return none;
  return some(value);
};

// Convert to nullable
export const toNullable = <A>(option: Option<A>): A | null =>
  isSome(option) ? option.value : null;

// Convert to undefined
export const toUndefined = <A>(option: Option<A>): A | undefined =>
  isSome(option) ? option.value : undefined;

// Combine two Options
export const zip = <A, B>(a: Option<A>, b: Option<B>): Option<[A, B]> => {
  if (isNone(a) || isNone(b)) return none;
  return some([a.value, b.value]);
};

// Get first Some
export const or = <A>(a: Option<A>, b: Option<A>): Option<A> =>
  isSome(a) ? a : b;

// Get first Some (lazy)
export const orElse = <A>(a: Option<A>, fn: () => Option<A>): Option<A> =>
  isSome(a) ? a : fn();

// Tap: run side effect
export const tap = <A>(option: Option<A>, fn: (a: A) => void): Option<A> => {
  if (isSome(option)) fn(option.value);
  return option;
};

// Check if contains value
export const contains = <A>(option: Option<A>, value: A): boolean =>
  isSome(option) && option.value === value;

// Namespace for cleaner imports
export const Option = {
  some,
  none,
  isSome,
  isNone,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  match,
  map,
  flatMap,
  chain,
  andThen,
  filter,
  fromNullable,
  toNullable,
  toUndefined,
  zip,
  or,
  orElse,
  tap,
  contains,
} as const;
