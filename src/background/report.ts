/**
 * What Chrome rejects an extension API call with (`storage`, `alarms`, …) once it has
 * begun to stop the service worker, while the worker's code still runs. Measured in
 * the E2E restart test: a pack download cut by the stop fails, and writing its state
 * or scheduling its retry then fails with this.
 */
const WORKER_STOPPING = "No SW";

/**
 * Whether `error` only says that the service worker is being stopped. Nothing is lost
 * then that the next start does not redo: it reads the pack states from the database
 * again, carries on a download the stop cut, and sync pulls what it missed.
 */
export function isWorkerStopping(error: unknown): boolean {
  const message = error instanceof Error ? error.message : error;
  return message === WORKER_STOPPING;
}

/**
 * The background's `console.error` (what chrome://extensions → Errors shows), except
 * for a failure that only says the worker is being stopped (`isWorkerStopping`).
 */
export function reportError(...args: unknown[]): void {
  if (args.some(isWorkerStopping)) return;
  console.error(...args);
}
