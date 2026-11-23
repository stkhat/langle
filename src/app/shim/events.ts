/** An extension event (`browser.*.on*`) of the app's shim. */
export interface ShimEvent<Args extends unknown[], Result = unknown> {
  addListener(listener: (...args: Args) => Result): void;
  removeListener(listener: (...args: Args) => Result): void;
  hasListener(listener: (...args: Args) => Result): boolean;
  hasListeners(): boolean;
  /** Calls the listeners in the order they were added; returns what each returned. */
  emit(...args: Args): Result[];
}

/**
 * As in the browsers: a listener is added once, one removed during an emit is not
 * called, and one that throws is reported without stopping the others.
 */
export function createEvent<
  Args extends unknown[],
  Result = unknown,
>(): ShimEvent<Args, Result> {
  const listeners = new Set<(...args: Args) => Result>();
  return {
    addListener: (listener) => void listeners.add(listener),
    removeListener: (listener) => void listeners.delete(listener),
    hasListener: (listener) => listeners.has(listener),
    hasListeners: () => listeners.size > 0,
    emit: (...args) => {
      const results: Result[] = [];
      for (const listener of [...listeners]) {
        if (!listeners.has(listener)) continue;
        try {
          results.push(listener(...args));
        } catch (error) {
          console.error(error);
        }
      }
      return results;
    },
  };
}
