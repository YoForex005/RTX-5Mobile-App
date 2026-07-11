import { useEffect, useState } from 'react';

/**
 * Mirrors `value` one animation frame late. The giant tab screens (Chart,
 * Quotes) take their route-active boolean through this so a bottom-tab switch
 * commits the cheap navigator swap first — the screens become visible with
 * their last-rendered content — and the heavy active-state re-render lands on
 * the following frame, off the tap's critical path.
 */
export function useNextFrameValue<T>(value: T): T {
  const [deferred, setDeferred] = useState(value);

  useEffect(() => {
    if (Object.is(deferred, value)) {
      return;
    }

    if (typeof globalThis.requestAnimationFrame !== 'function') {
      setDeferred(value);
      return;
    }

    const frameId = globalThis.requestAnimationFrame(() => {
      setDeferred(value);
    });
    return () => {
      globalThis.cancelAnimationFrame?.(frameId);
    };
  }, [deferred, value]);

  return deferred;
}
