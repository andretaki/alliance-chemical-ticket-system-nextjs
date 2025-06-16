// Type definitions for React 19
import 'react';

// Add missing JSX namespace
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

// Declare missing React types if needed
declare module 'react' {
  export const useState: <T>(initialState: T | (() => T)) => [T, (newState: T | ((prevState: T) => T)) => void];
  export const useEffect: (effect: () => void | (() => void | undefined), deps?: ReadonlyArray<any>) => void;

  // Common event types
  export interface ChangeEvent<T = Element> {
    target: T;
    currentTarget: T;
  }

  export interface FormEvent<T = Element> {
    preventDefault(): void;
    stopPropagation(): void;
    target: T;
    currentTarget: T;
  }
} 