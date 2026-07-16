/**
 * Coordinates the two parts of a fast menu-bar change:
 * show the tapped screen now, then let the real navigation route catch up.
 */
import { useSyncExternalStore } from 'react';

export const FAST_TAB_ROUTE_NAMES = ['quotes', 'chart', 'trade', 'history', 'settings'] as const;
export type FastTabRouteName = (typeof FAST_TAB_ROUTE_NAMES)[number];

type FastTabVisualSnapshot = Readonly<{
  routeName: FastTabRouteName | null;
  revision: number;
}>;

export type FastTabVisualApplier = (routeName: FastTabRouteName) => void;

type FastTabVisualController = {
  version: number;
  getSnapshot: () => FastTabVisualSnapshot;
  subscribe: (listener: () => void) => () => void;
  setActualRouteName: (routeName: FastTabRouteName) => void;
  show: (routeName: FastTabRouteName, notifySubscribers?: boolean) => number;
  clear: (revision?: number) => void;
  confirm: (revision: number) => void;
  registerVisualApplier: (applier: FastTabVisualApplier) => () => void;
  registerSidebarChromeApplier: (applier: FastTabVisualApplier) => () => void;
};

const FAST_TAB_VISUAL_CONTROLLER_VERSION = 6;

type FastTabVisualGlobal = typeof globalThis & {
  __rtx5FastTabVisualController?: FastTabVisualController;
};

const isFastTabRouteName = (value: string): value is FastTabRouteName =>
  (FAST_TAB_ROUTE_NAMES as readonly string[]).includes(value);

export function resolveFastTabRouteName(pathOrName: string): FastTabRouteName | null {
  const normalized = pathOrName
    .replace(/\?.*$/, '')
    .replace(/#.*$/, '')
    .replace(/\/\([^)]*\)/g, '')
    .replace(/^\/+|\/+$/g, '');
  const firstSegment = normalized.split('/')[0] ?? '';
  return isFastTabRouteName(firstSegment) ? firstSegment : null;
}

export function createFastTabVisualController(): FastTabVisualController {
  const listeners = new Set<() => void>();
  let actualRouteName: FastTabRouteName | null = null;
  let snapshot: FastTabVisualSnapshot = Object.freeze({ routeName: null, revision: 0 });
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  const visualAppliers = new Set<FastTabVisualApplier>();
  const sidebarChromeAppliers = new Set<FastTabVisualApplier>();

  const publish = (
    routeName: FastTabRouteName | null,
    revision: number,
    notifySubscribers = true,
  ) => {
    snapshot = Object.freeze({ routeName, revision });
    if (notifySubscribers) {
      listeners.forEach((listener) => listener());
    }
  };

  const applyVisualRoute = (routeName: FastTabRouteName) => {
    visualAppliers.forEach((applier) => applier(routeName));
  };

  const applySidebarChromeRoute = (routeName: FastTabRouteName) => {
    sidebarChromeAppliers.forEach((applier) => applier(routeName));
  };

  const restoreActualRoute = () => {
    if (actualRouteName) {
      applyVisualRoute(actualRouteName);
      applySidebarChromeRoute(actualRouteName);
    }
  };

  return {
    version: FAST_TAB_VISUAL_CONTROLLER_VERSION,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setActualRouteName: (routeName: FastTabRouteName) => {
      actualRouteName = routeName;
      // The real route has caught up. Clear the temporary tap choice so normal
      // navigation and Android Back always agree with the visible menu item.
      applyVisualRoute(routeName);
      applySidebarChromeRoute(routeName);
      if (snapshot.routeName !== null) {
        if (fallbackTimer) {
          clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }
        publish(null, snapshot.revision);
      }
    },
    show: (routeName: FastTabRouteName, notifySubscribers = true) => {
      const revision = snapshot.revision + 1;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      applyVisualRoute(routeName);
      // Scene, icon, and label are one visual transaction. Whether React
      // subscribers are notified must never decide which menu item is blue.
      applySidebarChromeRoute(routeName);
      // Drawer taps already switch the retained native layers imperatively.
      // They can postpone the React tab-bar adoption until real navigation so
      // no retained-tree reconciliation competes with the close animation.
      publish(routeName, revision, notifySubscribers);
      // Safety: if navigation never confirms the tap, return to the real route
      // instead of leaving the temporary screen visible forever.
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
    registerVisualApplier: (applier: FastTabVisualApplier) => {
      visualAppliers.add(applier);
      if (snapshot.routeName ?? actualRouteName) {
        applier((snapshot.routeName ?? actualRouteName) as FastTabRouteName);
      }
      return () => {
        visualAppliers.delete(applier);
      };
    },
    registerSidebarChromeApplier: (applier: FastTabVisualApplier) => {
      sidebarChromeAppliers.add(applier);
      if (snapshot.routeName ?? actualRouteName) {
        applier((snapshot.routeName ?? actualRouteName) as FastTabRouteName);
      }
      return () => {
        sidebarChromeAppliers.delete(applier);
      };
    },
  };
}

const controllerGlobal = globalThis as FastTabVisualGlobal;
const existingController = controllerGlobal.__rtx5FastTabVisualController;
export const fastTabVisualController =
  existingController
    && existingController.version === FAST_TAB_VISUAL_CONTROLLER_VERSION
    && typeof existingController.setActualRouteName === 'function'
    && typeof existingController.confirm === 'function'
    && typeof existingController.registerVisualApplier === 'function'
    && typeof existingController.registerSidebarChromeApplier === 'function'
    ? existingController
    : createFastTabVisualController();
controllerGlobal.__rtx5FastTabVisualController = fastTabVisualController;

export function showFastTabVisual(pathOrName: string) {
  const routeName = resolveFastTabRouteName(pathOrName);
  return routeName ? fastTabVisualController.show(routeName) : null;
}

/**
 * Drawer rows already cover the tab bar. Flip the retained native scene now,
 * then let the real route update adopt it after the drawer has closed.
 */
export function showFastTabVisualForSidebar(pathOrName: string) {
  const routeName = resolveFastTabRouteName(pathOrName);
  return routeName ? fastTabVisualController.show(routeName, false) : null;
}

export function registerFastTabVisualApplier(applier: FastTabVisualApplier) {
  return fastTabVisualController.registerVisualApplier(applier);
}

export function registerFastTabSidebarChromeApplier(applier: FastTabVisualApplier) {
  return fastTabVisualController.registerSidebarChromeApplier(applier);
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

// A drawer close gets a short pause so its closing animation stays smooth.
const FAST_TAB_NAVIGATION_SETTLE_DELAY_MS = 60;

// A bottom-menu tap has no drawer animation, so it needs no extra pause.
export const TAB_BAR_NAVIGATION_SETTLE_DELAY_MS = 0;

/**
 * Lets the requested screen paint first, then updates the real route.
 * The revision check makes sure only the newest rapid tap can finish.
 */
export function scheduleFastTabNavigation(
  revision: number,
  action: () => void,
  settleDelayMs: number = FAST_TAB_NAVIGATION_SETTLE_DELAY_MS,
) {
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
      setTimeout(runIfCurrent, settleDelayMs);
    });
  });
}
