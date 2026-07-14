/**
 * Controls the short handoff from the Accounts "+" button to the Brokers
 * route: reveal a lightweight Brokers shell, then start native navigation
 * after that shell has painted.
 */

export type BrokersLaunchSnapshot = Readonly<{
  visible: boolean;
  navigationStarted: boolean;
  /** Changes on every launch so delayed work from an older tap can be ignored. */
  revision: number;
}>;

export type BrokersLaunchVisualApplier = (visible: boolean) => void;

export type BrokersLaunchController = Readonly<{
  getSnapshot: () => BrokersLaunchSnapshot;
  subscribe: (listener: () => void) => () => void;
  show: () => number;
  hide: (revision?: number) => boolean;
  isVisible: () => boolean;
  startNavigation: (revision: number) => boolean;
  registerVisualApplier: (applier: BrokersLaunchVisualApplier) => () => void;
}>;

const BROKERS_LAUNCH_FALLBACK_MS = 5_000;

const createSnapshot = (
  visible: boolean,
  navigationStarted: boolean,
  revision: number,
): BrokersLaunchSnapshot => Object.freeze({
  visible,
  navigationStarted,
  revision,
});

export function createBrokersLaunchController(): BrokersLaunchController {
  const listeners = new Set<() => void>();
  let visualApplier: BrokersLaunchVisualApplier | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let snapshot = createSnapshot(false, false, 0);

  const clearFallbackTimer = () => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const publish = (nextSnapshot: BrokersLaunchSnapshot) => {
    snapshot = nextSnapshot;
    listeners.forEach((listener) => listener());
  };

  const hideCurrent = () => {
    if (!snapshot.visible) {
      return false;
    }

    clearFallbackTimer();
    visualApplier?.(false);
    publish(createSnapshot(false, false, snapshot.revision + 1));
    return true;
  };

  return Object.freeze({
    getSnapshot: () => snapshot,

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    show: () => {
      clearFallbackTimer();
      const revision = snapshot.revision + 1;

      // Reveal the ready Brokers shell before constructing the real route.
      visualApplier?.(true);
      publish(createSnapshot(true, false, revision));

      // Safety: remove the shell if native navigation never covers it.
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null;
        if (snapshot.visible && snapshot.revision === revision) {
          visualApplier?.(false);
          publish(createSnapshot(false, false, revision + 1));
        }
      }, BROKERS_LAUNCH_FALLBACK_MS);

      return revision;
    },

    hide: (revision?: number) => {
      if (revision !== undefined && snapshot.revision !== revision) {
        return false;
      }
      return hideCurrent();
    },

    isVisible: () => snapshot.visible,

    startNavigation: (revision) => {
      if (!snapshot.visible || snapshot.revision !== revision) {
        return false;
      }

      publish(createSnapshot(true, true, revision));
      return true;
    },

    registerVisualApplier: (applier) => {
      visualApplier = applier;
      applier(snapshot.visible);
      return () => {
        if (visualApplier === applier) {
          visualApplier = null;
        }
      };
    },
  });
}

type BrokersLaunchControllerGlobal = typeof globalThis & {
  __rtx5BrokersLaunchController?: BrokersLaunchController;
};

const controllerGlobal = globalThis as BrokersLaunchControllerGlobal;
const existingController = controllerGlobal.__rtx5BrokersLaunchController;

export const brokersLaunchController =
  existingController
    && typeof existingController.show === 'function'
    && typeof existingController.startNavigation === 'function'
    && typeof existingController.registerVisualApplier === 'function'
    ? existingController
    : createBrokersLaunchController();

controllerGlobal.__rtx5BrokersLaunchController = brokersLaunchController;

export function showBrokersLaunch() {
  return brokersLaunchController.show();
}

export function hideBrokersLaunch(revision?: number) {
  return brokersLaunchController.hide(revision);
}

export function scheduleBrokersLaunchNavigation(
  revision: number,
  action: () => void,
) {
  const runIfCurrent = () => {
    if (brokersLaunchController.startNavigation(revision)) {
      action();
    }
  };

  if (typeof globalThis.requestAnimationFrame !== 'function') {
    setTimeout(runIfCurrent, 32);
    return;
  }

  // Give the optimistic shell two paint frames before loading the real route.
  globalThis.requestAnimationFrame(() => {
    globalThis.requestAnimationFrame(() => {
      setTimeout(runIfCurrent, 0);
    });
  });
}
