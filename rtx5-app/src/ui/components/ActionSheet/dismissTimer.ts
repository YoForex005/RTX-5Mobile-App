/**
 * Schedule a callback after the action sheet has started the closed render
 * path. One frame keeps route work out of the opening/closing gesture frame
 * without adding a visible delay.
 */
const ACTION_SHEET_DISMISS_SETTLE_FRAMES = 1;
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
