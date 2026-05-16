type IdleDeadline = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type IdleCallbackHandle = number;

type IdleCapableGlobal = typeof globalThis & {
  requestIdleCallback?: (
    callback: (deadline: IdleDeadline) => void,
    options?: { timeout?: number },
  ) => IdleCallbackHandle;
  cancelIdleCallback?: (handle: IdleCallbackHandle) => void;
};

type ScheduledWork = () => void | Promise<void>;

const runWork = (work: ScheduledWork): void => {
  try {
    const result = work();
    const maybePromise = result as Promise<void> | undefined;
    if (maybePromise && typeof maybePromise.catch === 'function') {
      void maybePromise.catch((error) => {
        console.warn('[StartupScheduler] Scheduled work failed', error);
      });
    }
  } catch (error) {
    console.warn('[StartupScheduler] Scheduled work failed', error);
  }
};

export function scheduleAfterFirstFrame(work: ScheduledWork): () => void {
  let cancelled = false;
  let frameHandle: number | null = null;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    frameHandle = null;
    timeoutHandle = null;
    if (!cancelled) {
      runWork(work);
    }
  };

  if (typeof globalThis.requestAnimationFrame === 'function') {
    frameHandle = globalThis.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      timeoutHandle = setTimeout(run, 0);
    });
  } else {
    timeoutHandle = setTimeout(run, 16);
  }

  return () => {
    cancelled = true;
    if (frameHandle !== null && typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(frameHandle);
      frameHandle = null;
    }
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  };
}

export function scheduleIdleWork(
  work: ScheduledWork,
  options: { delayMs?: number; timeoutMs?: number } = {},
): () => void {
  const { delayMs = 0, timeoutMs = 1500 } = options;
  const idleGlobal = globalThis as IdleCapableGlobal;
  let cancelled = false;
  let delayHandle: ReturnType<typeof setTimeout> | null = null;
  let idleHandle: IdleCallbackHandle | null = null;
  let frameCancel: (() => void) | null = null;

  const request = () => {
    delayHandle = null;
    if (cancelled) {
      return;
    }

    if (typeof idleGlobal.requestIdleCallback === 'function') {
      idleHandle = idleGlobal.requestIdleCallback(
        () => {
          idleHandle = null;
          if (!cancelled) {
            runWork(work);
          }
        },
        { timeout: timeoutMs },
      );
      return;
    }

    frameCancel = scheduleAfterFirstFrame(() => {
      frameCancel = null;
      if (!cancelled) {
        runWork(work);
      }
    });
  };

  if (delayMs > 0) {
    delayHandle = setTimeout(request, delayMs);
  } else {
    request();
  }

  return () => {
    cancelled = true;
    if (delayHandle) {
      clearTimeout(delayHandle);
      delayHandle = null;
    }
    if (idleHandle !== null && typeof idleGlobal.cancelIdleCallback === 'function') {
      idleGlobal.cancelIdleCallback(idleHandle);
      idleHandle = null;
    }
    if (frameCancel) {
      frameCancel();
      frameCancel = null;
    }
  };
}
