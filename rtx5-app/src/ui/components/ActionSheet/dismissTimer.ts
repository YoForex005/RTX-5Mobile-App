/**
 * Schedule a callback after the action sheet has moved through the closed
 * render path. The sheet returns null when closed, so the selected action can
 * run immediately without carrying an artificial post-dismiss frame delay.
 */
const ACTION_SHEET_DISMISS_SETTLE_FRAMES = 0;
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
