/**
 * Schedule a callback to fire once the action-sheet dismiss animation has
 * settled. Uses requestAnimationFrame when available so the callback only
 * runs after RN has rendered enough frames for the visible drawer to be
 * gone — falling back to setTimeout in environments without rAF.
 */
const ACTION_SHEET_DISMISS_SETTLE_FRAMES = 2;
const ACTION_SHEET_FRAME_FALLBACK_MS = 16;

export function scheduleDismissSettledAction(callback: () => void): () => void {
  let cancelled = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let frameHandle: number | null = null;
  let framesRemaining = ACTION_SHEET_DISMISS_SETTLE_FRAMES;

  const step = () => {
    if (cancelled) {
      return;
    }

    if (framesRemaining <= 0) {
      callback();
      return;
    }

    framesRemaining -= 1;

    if (typeof globalThis.requestAnimationFrame === 'function') {
      frameHandle = globalThis.requestAnimationFrame(step);
      return;
    }

    timeoutHandle = setTimeout(step, ACTION_SHEET_FRAME_FALLBACK_MS);
  };

  step();

  return () => {
    cancelled = true;

    if (frameHandle !== null && typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(frameHandle);
    }

    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  };
}
