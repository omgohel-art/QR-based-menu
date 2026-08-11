import { useCallback, useRef } from "react";

/**
 * useDoubleSubmitGuard — prevents a callback from running more than once while
 * it is in flight. Useful for blocking double-clicks on "Pay", "Place Order",
 * etc. that would otherwise submit duplicate orders or trigger double-charges.
 *
 * Usage:
 *   const guard = useDoubleSubmitGuard();
 *   <Button disabled={guard.pending} onClick={() => guard.run(async () => { ... })}>
 */
export function useDoubleSubmitGuard() {
  const pendingRef = useRef(false);

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (pendingRef.current) {
      // Already in-flight — silently ignore the duplicate click.
      return undefined;
    }
    pendingRef.current = true;
    try {
      return await fn();
    } finally {
      pendingRef.current = false;
    }
  }, []);

  const isPending = useCallback(() => pendingRef.current, []);

  return { run, isPending };
}
