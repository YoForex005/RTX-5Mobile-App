import { useSyncExternalStore } from 'react';
import { executeOnUIRuntimeSync, makeMutable, type SharedValue } from 'react-native-reanimated';

export const FAST_TAB_ROUTE_NAMES = ['quotes', 'chart', 'trade', 'history', 'settings'] as const;
export type FastTabRouteName = (typeof FAST_TAB_ROUTE_NAMES)[number];

type FastTabVisualSnapshot = Readonly<{
  routeName: FastTabRouteName | null;
  revision: number;
}>;

type FastTabVisualController = {
  getSnapshot: () => FastTabVisualSnapshot;
  subscribe: (listener: () => void) => () => void;
  setActualRouteName: (routeName: FastTabRouteName) => void;
  show: (routeName: FastTabRouteName) => number;
  clear: (revision?: number) => void;
  confirm: (revision: number) => void;
};

type FastTabVisualGlobal = typeof globalThis & {
  __rtx5FastTabVisualController?: FastTabVisualController;
  __rtx5FastTabVisualIndex?: SharedValue<number>;
};

const FAST_TAB_ROUTE_INDEX: Readonly<Record<FastTabRouteName, number>> = {
  quotes: 0,
  chart: 1,
  trade: 2,
  history: 3,
  settings: 4,
};

export function getFastTabRouteIndex(routeName: FastTabRouteName) {
  return FAST_TAB_ROUTE_INDEX[routeName];
}

const isFastTabRouteName = (value: string): value is FastTabRouteName =>
  (FAST_TAB_ROUTE_NAMES as readonly string[]).includes(value);

/**
 * Writes the scene-visibility index ON the UI runtime, synchronously.
 *
 * A plain `.value =` from the React thread is flushed asynchronously; under a
 * congested JS event loop (fresh boot: feeds + chart pre-warm) that flush was
 * observed on-device to land >1s after the tap, so the old tab stayed on
 * screen after the drawer closed. The synchronous UI-runtime write makes the
 * scene swap land on the very next vsync no matter how deep the JS queue is —
 * the same guarantee MT5 gets from its native view swap.
 */
function writeFastTabVisualIndexNow(index: number) {
  try {
    executeOnUIRuntimeSync((value: number) => {
      'worklet';
      fastTabVisualIndex.value = value;
    })(index);
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[FastTab] sync UI write unavailable, using async fallback:', error);
    }
    fastTabVisualIndex.value = index;
  }
}

export function resolveFastTabRouteName(pathOrName: string): FastTabRouteName | null {
  const normalized = pathOrName
    .replace(/\?.*$/, '')
    .replace(/#.*$/, '')
    .replace(/\/\([^)]*\)/g, '')
    .replace(/^\/+|\/+$/g, '');
  const firstSegment = normalized.split('/')[0] ?? '';
  return isFastTabRouteName(firstSegment) ? firstSegment : null;
}

function createController() {
  const listeners = new Set<() => void>();
  let actualRouteName: FastTabRouteName | null = null;
  let snapshot: FastTabVisualSnapshot = Object.freeze({ routeName: null, revision: 0 });
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  const publish = (routeName: FastTabRouteName | null, revision: number) => {
    snapshot = Object.freeze({ routeName, revision });
    listeners.forEach((listener) => listener());
  };

  const applyVisualRoute = (routeName: FastTabRouteName) => {
    writeFastTabVisualIndexNow(FAST_TAB_ROUTE_INDEX[routeName]);
  };

  const restoreActualRoute = () => {
    if (actualRouteName) {
      writeFastTabVisualIndexNow(FAST_TAB_ROUTE_INDEX[actualRouteName]);
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setActualRouteName: (routeName: FastTabRouteName) => {
      actualRouteName = routeName;
      if (snapshot.routeName === null) {
        writeFastTabVisualIndexNow(FAST_TAB_ROUTE_INDEX[routeName]);
      }
    },
    show: (routeName: FastTabRouteName) => {
      const revision = snapshot.revision + 1;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      applyVisualRoute(routeName);
      publish(routeName, revision);
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null;
        if (snapshot.revision === revision) {
          restoreActualRoute();
          publish(null, revision);
        }
      }, 5000);
      return revision;
    },
    clear: (revision?: number) => {
      if (revision !== undefined && snapshot.revision !== revision) {
        return;
      }
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      if (snapshot.routeName !== null) {
        restoreActualRoute();
        publish(null, snapshot.revision);
      }
    },
    confirm: (revision: number) => {
      if (snapshot.revision !== revision) {
        return;
      }
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      if (snapshot.routeName !== null) {
        publish(null, snapshot.revision);
      }
    },
  };
}

const controllerGlobal = globalThis as FastTabVisualGlobal;
export const fastTabVisualIndex =
  controllerGlobal.__rtx5FastTabVisualIndex ?? makeMutable(0);
controllerGlobal.__rtx5FastTabVisualIndex = fastTabVisualIndex;
const existingController = controllerGlobal.__rtx5FastTabVisualController;
export const fastTabVisualController =
  existingController
    && typeof existingController.setActualRouteName === 'function'
    && typeof existingController.confirm === 'function'
    ? existingController
    : createController();
controllerGlobal.__rtx5FastTabVisualController = fastTabVisualController;

export function showFastTabVisual(pathOrName: string) {
  const routeName = resolveFastTabRouteName(pathOrName);
  return routeName ? fastTabVisualController.show(routeName) : null;
}

export function clearFastTabVisual(revision?: number) {
  fastTabVisualController.clear(revision);
}

export function confirmFastTabVisual(revision: number) {
  fastTabVisualController.confirm(revision);
}

export function setFastTabActualRoute(pathOrName: string) {
  const routeName = resolveFastTabRouteName(pathOrName);
  if (routeName) {
    fastTabVisualController.setActualRouteName(routeName);
  }
}

export function useFastTabVisualSnapshot() {
  return useSyncExternalStore(
    fastTabVisualController.subscribe,
    fastTabVisualController.getSnapshot,
    fastTabVisualController.getSnapshot,
  );
}

/**
 * The real navigation commit (navigator state + destination focus effects) is
 * heavy enough to drop frames of the 90-110ms drawer/tab motion when it lands
 * mid-animation (device-measured 45-99ms UI stalls). The scene pixels are
 * already swapped optimistically, so the commit waits until the motion has
 * settled before running.
 */
const FAST_TAB_NAVIGATION_SETTLE_DELAY_MS = 110;

export function scheduleFastTabNavigation(revision: number, action: () => void) {
  const runIfCurrent = () => {
    if (fastTabVisualController.getSnapshot().revision === revision) {
      action();
    }
  };

  if (typeof globalThis.requestAnimationFrame !== 'function') {
    setTimeout(runIfCurrent, 32);
    return;
  }

  globalThis.requestAnimationFrame(() => {
    globalThis.requestAnimationFrame(() => {
      setTimeout(runIfCurrent, FAST_TAB_NAVIGATION_SETTLE_DELAY_MS);
    });
  });
}
