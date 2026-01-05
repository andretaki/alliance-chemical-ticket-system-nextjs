/**
 * Tests for Result type - the foundation of our functional core.
 *
 * These tests verify that our Result implementation:
 * 1. Correctly handles success and error cases
 * 2. Implements functor laws (map)
 * 3. Implements monad laws (flatMap)
 * 4. Provides safe extraction utilities
 */

import {
  ok,
  err,
  isOk,
  isErr,
  map,
  mapErr,
  flatMap,
  match,
  unwrap,
  unwrapErr,
  unwrapOr,
  all,
  fromNullable,
  tryCatch,
  Result,
  type Result as ResultType,
} from '@domain/shared/result';

describe('Result type', () => {
  describe('constructors', () => {
    it('ok creates a success result', () => {
      const result = ok(42);
      expect(result._tag).toBe('Ok');
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
    });

    it('err creates an error result', () => {
      const result = err('something went wrong');
      expect(result._tag).toBe('Err');
      expect(isErr(result)).toBe(true);
      expect(isOk(result)).toBe(false);
    });

    it('ok preserves the value', () => {
      const value = { foo: 'bar', nested: { num: 123 } };
      const result = ok(value);
      if (isOk(result)) {
        expect(result.value).toBe(value);
        expect(result.value).toEqual({ foo: 'bar', nested: { num: 123 } });
      }
    });

    it('err preserves the error', () => {
      const error = { code: 'NOT_FOUND', message: 'Resource not found' };
      const result = err(error);
      if (isErr(result)) {
        expect(result.error).toBe(error);
        expect(result.error).toEqual({ code: 'NOT_FOUND', message: 'Resource not found' });
      }
    });
  });

  describe('type guards', () => {
    it('isOk returns true for Ok and false for Err', () => {
      expect(isOk(ok('value'))).toBe(true);
      expect(isOk(err('error'))).toBe(false);
    });

    it('isErr returns true for Err and false for Ok', () => {
      expect(isErr(err('error'))).toBe(true);
      expect(isErr(ok('value'))).toBe(false);
    });

    it('type narrows correctly after isOk check', () => {
      const result: ResultType<string, number> = ok(42);
      if (isOk(result)) {
        // TypeScript should know result.value is number
        const doubled: number = result.value * 2;
        expect(doubled).toBe(84);
      }
    });

    it('type narrows correctly after isErr check', () => {
      const result: ResultType<string, number> = err('oops');
      if (isErr(result)) {
        // TypeScript should know result.error is string
        const upper: string = result.error.toUpperCase();
        expect(upper).toBe('OOPS');
      }
    });
  });

  describe('extractors', () => {
    it('unwrap returns value for Ok', () => {
      expect(unwrap(ok(42))).toBe(42);
    });

    it('unwrap throws for Err', () => {
      expect(() => unwrap(err('oops'))).toThrow();
    });

    it('unwrapErr returns error for Err', () => {
      expect(unwrapErr(err('oops'))).toBe('oops');
    });

    it('unwrapErr throws for Ok', () => {
      expect(() => unwrapErr(ok(42))).toThrow();
    });

    it('unwrapOr returns value for Ok', () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
    });

    it('unwrapOr returns default for Err', () => {
      expect(unwrapOr(err('oops'), 0)).toBe(0);
    });
  });

  describe('pattern matching', () => {
    it('match calls ok handler for Ok', () => {
      const result = match(ok(42), {
        ok: (v) => `value: ${v}`,
        err: (e) => `error: ${e}`,
      });
      expect(result).toBe('value: 42');
    });

    it('match calls err handler for Err', () => {
      const result = match(err('oops'), {
        ok: (v) => `value: ${v}`,
        err: (e) => `error: ${e}`,
      });
      expect(result).toBe('error: oops');
    });

    it('match can transform types', () => {
      const toNumber = (r: ResultType<string, string>): number =>
        match(r, {
          ok: (s) => s.length,
          err: () => -1,
        });

      expect(toNumber(ok('hello'))).toBe(5);
      expect(toNumber(err('error'))).toBe(-1);
    });
  });

  describe('functor (map)', () => {
    it('map transforms Ok value', () => {
      const result = map(ok(5), (x) => x * 2);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(10);
    });

    it('map preserves Err', () => {
      const result = map(err('oops') as ResultType<string, number>, (x) => x * 2);
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result)).toBe('oops');
    });

    it('map obeys identity law: map(r, id) === r', () => {
      const identity = <T>(x: T) => x;
      const okResult = ok(42);
      const errResult = err('oops');

      const mappedOk = map(okResult, identity);
      const mappedErr = map(errResult, identity);

      expect(unwrap(mappedOk)).toBe(unwrap(okResult));
      expect(unwrapErr(mappedErr)).toBe(unwrapErr(errResult));
    });

    it('map obeys composition law: map(r, f . g) === map(map(r, g), f)', () => {
      const f = (x: number) => x * 2;
      const g = (x: number) => x + 1;
      const compose = (x: number) => f(g(x));

      const result = ok(5);
      const left = map(result, compose);
      const right = map(map(result, g), f);

      expect(unwrap(left)).toBe(unwrap(right));
    });

    it('mapErr transforms Err value', () => {
      const result = mapErr(err('oops'), (e) => `Error: ${e}`);
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result)).toBe('Error: oops');
    });

    it('mapErr preserves Ok', () => {
      const result = mapErr(ok(42), (e) => `Error: ${e}`);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(42);
    });
  });

  describe('monad (flatMap)', () => {
    const safeDivide = (a: number, b: number): ResultType<string, number> =>
      b === 0 ? err('division by zero') : ok(a / b);

    it('flatMap chains successful operations', () => {
      const result = flatMap(ok(10), (x) => safeDivide(x, 2));
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(5);
    });

    it('flatMap short-circuits on error', () => {
      const result = flatMap(err('initial error') as ResultType<string, number>, (x) =>
        safeDivide(x, 2)
      );
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result)).toBe('initial error');
    });

    it('flatMap propagates error from inner function', () => {
      const result = flatMap(ok(10), (x) => safeDivide(x, 0));
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result)).toBe('division by zero');
    });

    it('flatMap obeys left identity: flatMap(ok(a), f) === f(a)', () => {
      const f = (x: number) => ok(x * 2);
      const a = 5;

      const left = flatMap(ok(a), f);
      const right = f(a);

      expect(unwrap(left)).toBe(unwrap(right));
    });

    it('flatMap obeys right identity: flatMap(r, ok) === r', () => {
      const result = ok(42);
      const flatMapped = flatMap(result, ok);

      expect(unwrap(flatMapped)).toBe(unwrap(result));
    });

    it('flatMap obeys associativity: flatMap(flatMap(r, f), g) === flatMap(r, x => flatMap(f(x), g))', () => {
      const f = (x: number): ResultType<string, number> => ok(x + 1);
      const g = (x: number): ResultType<string, number> => ok(x * 2);

      const result = ok(5);
      const left = flatMap(flatMap(result, f), g);
      const right = flatMap(result, (x) => flatMap(f(x), g));

      expect(unwrap(left)).toBe(unwrap(right));
    });

    it('chains multiple operations', () => {
      const parseNumber = (s: string): ResultType<string, number> => {
        const n = parseInt(s, 10);
        return isNaN(n) ? err('not a number') : ok(n);
      };

      const double = (n: number): ResultType<string, number> => ok(n * 2);

      const validatePositive = (n: number): ResultType<string, number> =>
        n > 0 ? ok(n) : err('must be positive');

      // Chain: parse -> double -> validate
      const process = (input: string): ResultType<string, number> =>
        flatMap(flatMap(parseNumber(input), double), validatePositive);

      expect(unwrap(process('5'))).toBe(10);
      expect(unwrapErr(process('abc'))).toBe('not a number');
      expect(unwrapErr(process('-5'))).toBe('must be positive');
    });
  });

  describe('all combinator', () => {
    it('combines multiple Ok results', () => {
      const results = [ok(1), ok(2), ok(3)] as const;
      const combined = all(results);

      expect(isOk(combined)).toBe(true);
      expect(unwrap(combined)).toEqual([1, 2, 3]);
    });

    it('returns first error when any result is Err', () => {
      const results = [ok(1), err('error'), ok(3)] as [
        ResultType<string, number>,
        ResultType<string, number>,
        ResultType<string, number>
      ];
      const combined = all(results);

      expect(isErr(combined)).toBe(true);
      expect(unwrapErr(combined)).toBe('error');
    });

    it('returns empty array for empty input', () => {
      const results: ResultType<string, number>[] = [];
      const combined = all(results);

      expect(isOk(combined)).toBe(true);
      expect(unwrap(combined)).toEqual([]);
    });
  });

  describe('fromNullable', () => {
    it('returns Ok for non-null values', () => {
      expect(isOk(fromNullable(42, () => 'null'))).toBe(true);
      expect(unwrap(fromNullable(42, () => 'null'))).toBe(42);
    });

    it('returns Ok for falsy non-null values', () => {
      expect(isOk(fromNullable(0, () => 'null'))).toBe(true);
      expect(unwrap(fromNullable(0, () => 'null'))).toBe(0);

      expect(isOk(fromNullable('', () => 'null'))).toBe(true);
      expect(unwrap(fromNullable('', () => 'null'))).toBe('');

      expect(isOk(fromNullable(false, () => 'null'))).toBe(true);
      expect(unwrap(fromNullable(false, () => 'null'))).toBe(false);
    });

    it('returns Err for null', () => {
      expect(isErr(fromNullable(null, () => 'was null'))).toBe(true);
      expect(unwrapErr(fromNullable(null, () => 'was null'))).toBe('was null');
    });

    it('returns Err for undefined', () => {
      expect(isErr(fromNullable(undefined, () => 'was undefined'))).toBe(true);
    });
  });

  describe('tryCatch', () => {
    it('returns Ok when function succeeds', () => {
      const result = tryCatch(
        () => JSON.parse('{"foo": "bar"}'),
        () => 'parse error'
      );

      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toEqual({ foo: 'bar' });
    });

    it('returns Err when function throws', () => {
      const result = tryCatch(
        () => JSON.parse('invalid json'),
        (e) => `parse error: ${e instanceof Error ? e.message : 'unknown'}`
      );

      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result)).toContain('parse error:');
    });
  });

  describe('namespace export', () => {
    it('Result namespace contains all utilities', () => {
      expect(typeof Result.ok).toBe('function');
      expect(typeof Result.err).toBe('function');
      expect(typeof Result.isOk).toBe('function');
      expect(typeof Result.isErr).toBe('function');
      expect(typeof Result.map).toBe('function');
      expect(typeof Result.flatMap).toBe('function');
      expect(typeof Result.match).toBe('function');
    });
  });

  describe('immutability', () => {
    it('does not mutate original result on map', () => {
      const original = ok({ value: 1 });
      const mapped = map(original, (obj) => ({ ...obj, doubled: obj.value * 2 }));

      expect(unwrap(original)).toEqual({ value: 1 });
      expect(unwrap(mapped)).toEqual({ value: 1, doubled: 2 });
    });

    it('does not mutate original result on flatMap', () => {
      const original = ok(5);
      flatMap(original, (x) => ok(x * 2));

      expect(unwrap(original)).toBe(5);
    });
  });
});
