export const SIDEBAR_HOST_DESTINATIONS = [
  'journal',
  'economic-calendar',
  'user-guide',
  'help',
  'about',
  'accounts',
  'interface',
] as const;

export type SidebarHostDestination = (typeof SIDEBAR_HOST_DESTINATIONS)[number];

export type SidebarHostDestinationPath =
  | '/journal'
  | '/economic-calendar'
  | '/user-guide'
  | '/help'
  | '/about'
  | '/settings/accounts'
  | '/settings/interface';

export type SidebarDestinationActivationSource =
  | 'sidebar'
  | 'settings'
  | 'deep-link'
  | 'route-sync'
  | 'programmatic';

export type SidebarDestinationSnapshot = Readonly<{
  activeDestination: SidebarHostDestination | null;
  activePath: SidebarHostDestinationPath | null;
  source: SidebarDestinationActivationSource | null;
  revision: number;
}>;

export type SidebarDestinationVisualApplier = (
  destination: SidebarHostDestination | null,
) => void;

export type SidebarDestinationBackHandler = () => boolean;

export type SidebarDestinationController = Readonly<{
  /** Immediate visual/imperative state for the currently revealed layer. */
  getSnapshot: () => SidebarDestinationSnapshot;
  /**
   * Retained focus/query state. This advances only when the deferred focus
   * notification is published, so a visual-store render cannot pull heavy
   * destination work into the tap frame.
   */
  getFocusSnapshot: () => SidebarDestinationSnapshot;
  subscribe: (listener: () => void) => () => void;
  /**
   * Like subscribe, but notified synchronously in the same JavaScript turn as
   * show/hide. Layer VISIBILITY must ride this immediate path (plain React
   * styles committed with the tap turn) while focus/query work stays on the
   * two-frame deferred `subscribe` path.
   */
  subscribeVisual: (listener: () => void) => () => void;
  show: (
    destinationOrPath: SidebarHostDestination | SidebarHostDestinationPath | string,
    source?: SidebarDestinationActivationSource,
  ) => boolean;
  hide: () => boolean;
  isVisible: () => boolean;
  requestBack: () => boolean;
  registerBackHandler: (
    destination: SidebarHostDestination,
    handler: SidebarDestinationBackHandler,
  ) => () => void;
  registerVisualApplier: (applier: SidebarDestinationVisualApplier) => () => void;
}>;

const DESTINATION_PATHS: Readonly<Record<SidebarHostDestination, SidebarHostDestinationPath>> = {
  journal: '/journal',
  'economic-calendar': '/economic-calendar',
  'user-guide': '/user-guide',
  help: '/help',
  about: '/about',
  // "Manage accounts" — same public path as the routed Settings-tab entry, so
  // the sidebar resolves it to the retained host instead of a navigation
  // commit (measured blocking the tap turn 1.2s on-device).
  accounts: '/settings/accounts',
  // "Language Preference" — Settings-row-only destination (not in the drawer);
  // shares the routed path so deep links and the pushed fallback keep working.
  interface: '/settings/interface',
};

const DESTINATIONS_BY_PATH = new Map<SidebarHostDestinationPath, SidebarHostDestination>(
  SIDEBAR_HOST_DESTINATIONS.map((destination) => [DESTINATION_PATHS[destination], destination]),
);

const CLOSED_SNAPSHOT: SidebarDestinationSnapshot = Object.freeze({
  activeDestination: null,
  activePath: null,
  source: null,
  revision: 0,
});

/** Focus/query work runs only after the drawer close motion has settled. */
const FOCUS_NOTIFY_SETTLE_DELAY_MS = 60;
const SIDEBAR_DESTINATION_CONTROLLER_VERSION = 3;

/**
 * Converts Expo Router paths (including grouped routes and query/hash suffixes)
 * to the stable public path used by the sidebar host.
 */
export function normalizeSidebarDestinationPath(path: string): string {
  const withoutSuffix = path.trim().split(/[?#]/, 1)[0] ?? '';
  const withoutGroups = withoutSuffix.replace(/\/(?:\([^/()]+\))(?=\/|$)/g, '');
  const normalizedSlashes = `/${withoutGroups}`.replace(/\/{2,}/g, '/');
  const withoutIndex = normalizedSlashes.replace(/\/index\/?$/, '');
  const withoutTrailingSlash = withoutIndex.length > 1
    ? withoutIndex.replace(/\/+$/, '')
    : withoutIndex;

  return withoutTrailingSlash || '/';
}

export function getSidebarDestinationPath(
  destination: SidebarHostDestination,
): SidebarHostDestinationPath {
  return DESTINATION_PATHS[destination];
}

export function resolveSidebarHostDestination(
  destinationOrPath: SidebarHostDestination | SidebarHostDestinationPath | string,
): SidebarHostDestination | null {
  if ((SIDEBAR_HOST_DESTINATIONS as readonly string[]).includes(destinationOrPath)) {
    return destinationOrPath as SidebarHostDestination;
  }

  const path = normalizeSidebarDestinationPath(destinationOrPath);
  return DESTINATIONS_BY_PATH.get(path as SidebarHostDestinationPath) ?? null;
}

/**
 * Small external store used by the root destination host. The immediate visual
 * snapshot and retained layer change in the same JavaScript turn as show/hide.
 * On a device, the separate focus snapshot advances after two paint frames so
 * the tap never waits for destination focus/query work.
 */
export function createSidebarDestinationController(
  initialDestinationOrPath?: SidebarHostDestination | SidebarHostDestinationPath | string | null,
): SidebarDestinationController {
  const listeners = new Set<() => void>();
  const visualListeners = new Set<() => void>();
  const backHandlers = new Map<SidebarHostDestination, SidebarDestinationBackHandler>();
  let visualApplier: SidebarDestinationVisualApplier | null = null;
  let notificationRevision = 0;
  const initialDestination = initialDestinationOrPath
    ? resolveSidebarHostDestination(initialDestinationOrPath)
    : null;
  let snapshot: SidebarDestinationSnapshot = initialDestination
    ? Object.freeze({
      activeDestination: initialDestination,
      activePath: getSidebarDestinationPath(initialDestination),
      source: 'programmatic' as const,
      revision: 1,
    })
    : CLOSED_SNAPSHOT;
  let focusSnapshot = snapshot;

  const notifyAfterFirstVisualFrame = (
    nextSnapshot: SidebarDestinationSnapshot,
  ) => {
    const notifyIfCurrent = () => {
      if (notificationRevision !== nextSnapshot.revision) {
        return;
      }

      focusSnapshot = nextSnapshot;
      listeners.forEach((listener) => listener());
    };

    // Settings rows have no drawer animation to protect. Publish focus now so
    // the hosted screen's own two-frame body gate is the only first-open wait.
    if (nextSnapshot.source === 'settings') {
      notifyIfCurrent();
      return;
    }

    // Node/test environments have no frame clock and retain the controller's
    // synchronous observable contract. On-device, the retained native layer
    // paints first and the drawer close animation (~60ms) finishes before
    // focus/query React work is published — a focus commit landing
    // mid-animation was measured dropping 48-86ms of drawer frames.
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      notifyIfCurrent();
      return;
    }

    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(() => {
        setTimeout(notifyIfCurrent, FOCUS_NOTIFY_SETTLE_DELAY_MS);
      });
    });
  };

  const publish = (nextSnapshot: SidebarDestinationSnapshot) => {
    snapshot = Object.freeze(nextSnapshot);
    notificationRevision = nextSnapshot.revision;
    // Visual subscribers flip layer visibility through plain React styles in
    // this same JavaScript turn — the Reanimated applier alone was observed
    // lagging >1s behind a congested JS loop on-device.
    visualListeners.forEach((listener) => listener());
    notifyAfterFirstVisualFrame(snapshot);
  };

  return Object.freeze({
    getSnapshot: () => snapshot,

    getFocusSnapshot: () => focusSnapshot,

    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    subscribeVisual: (listener: () => void) => {
      visualListeners.add(listener);
      return () => visualListeners.delete(listener);
    },

    show: (destinationOrPath, source = 'programmatic') => {
      const destination = resolveSidebarHostDestination(destinationOrPath);
      if (!destination) {
        return false;
      }

      const path = getSidebarDestinationPath(destination);
      if (
        snapshot.activeDestination === destination
        && snapshot.activePath === path
        && snapshot.source === source
      ) {
        return true;
      }

      visualApplier?.(destination);
      publish({
        activeDestination: destination,
        activePath: path,
        source,
        revision: snapshot.revision + 1,
      });
      return true;
    },

    hide: () => {
      if (!snapshot.activeDestination) {
        return false;
      }

      visualApplier?.(null);
      publish({
        activeDestination: null,
        activePath: null,
        source: null,
        revision: snapshot.revision + 1,
      });
      return true;
    },

    isVisible: () => snapshot.activeDestination !== null,

    requestBack: () => {
      const destination = snapshot.activeDestination;
      if (!destination) return false;
      return backHandlers.get(destination)?.() ?? false;
    },

    registerBackHandler: (destination, handler) => {
      backHandlers.set(destination, handler);
      return () => {
        if (backHandlers.get(destination) === handler) {
          backHandlers.delete(destination);
        }
      };
    },

    registerVisualApplier: (applier) => {
      visualApplier = applier;
      applier(snapshot.activeDestination);
      return () => {
        if (visualApplier === applier) {
          visualApplier = null;
        }
      };
    },
  });
}

type SidebarDestinationControllerGlobal = typeof globalThis & {
  __rtx5SidebarDestinationController?: SidebarDestinationController;
  __rtx5SidebarDestinationControllerVersion?: number;
};

const controllerGlobal = globalThis as SidebarDestinationControllerGlobal;

// Preserve the controller across Expo Fast Refresh module re-evaluations.
const existingController = controllerGlobal.__rtx5SidebarDestinationController;
export const sidebarDestinationController =
  existingController
    && controllerGlobal.__rtx5SidebarDestinationControllerVersion === SIDEBAR_DESTINATION_CONTROLLER_VERSION
    && typeof existingController.getFocusSnapshot === 'function'
    && typeof existingController.registerVisualApplier === 'function'
    && typeof existingController.subscribeVisual === 'function'
    && typeof existingController.requestBack === 'function'
    && typeof existingController.registerBackHandler === 'function'
    ? existingController
    : createSidebarDestinationController();

controllerGlobal.__rtx5SidebarDestinationController = sidebarDestinationController;
controllerGlobal.__rtx5SidebarDestinationControllerVersion = SIDEBAR_DESTINATION_CONTROLLER_VERSION;

export function showSidebarDestination(
  destinationOrPath: SidebarHostDestination | SidebarHostDestinationPath | string,
  source: SidebarDestinationActivationSource = 'programmatic',
) {
  return sidebarDestinationController.show(destinationOrPath, source);
}

export function hideSidebarDestination() {
  return sidebarDestinationController.hide();
}

export function isSidebarDestinationVisible() {
  return sidebarDestinationController.isVisible();
}
