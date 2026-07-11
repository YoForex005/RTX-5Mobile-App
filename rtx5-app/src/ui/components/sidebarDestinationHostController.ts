export const SIDEBAR_HOST_DESTINATIONS = [
  'journal',
  'economic-calendar',
  'user-guide',
  'help',
  'about',
] as const;

export type SidebarHostDestination = (typeof SIDEBAR_HOST_DESTINATIONS)[number];

export type SidebarHostDestinationPath =
  | '/journal'
  | '/economic-calendar'
  | '/user-guide'
  | '/help'
  | '/about';

export type SidebarDestinationActivationSource =
  | 'sidebar'
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

export type SidebarDestinationController = Readonly<{
  getSnapshot: () => SidebarDestinationSnapshot;
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
  registerVisualApplier: (applier: SidebarDestinationVisualApplier) => () => void;
}>;

const DESTINATION_PATHS: Readonly<Record<SidebarHostDestination, SidebarHostDestinationPath>> = {
  journal: '/journal',
  'economic-calendar': '/economic-calendar',
  'user-guide': '/user-guide',
  help: '/help',
  about: '/about',
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
const FOCUS_NOTIFY_SETTLE_DELAY_MS = 110;

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
 * Small external store used by the root destination host. The snapshot and
 * retained visual layer change in the same JavaScript turn as show/hide. On a
 * device, subscribers receive focus/query state after two paint frames so the
 * tap never waits for React work or a router/native-screen transition.
 */
export function createSidebarDestinationController(
  initialDestinationOrPath?: SidebarHostDestination | SidebarHostDestinationPath | string | null,
): SidebarDestinationController {
  const listeners = new Set<() => void>();
  const visualListeners = new Set<() => void>();
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

  const notifyAfterFirstVisualFrame = (revision: number) => {
    const notifyIfCurrent = () => {
      if (notificationRevision === revision) {
        listeners.forEach((listener) => listener());
      }
    };

    // Node/test environments have no frame clock and retain the controller's
    // synchronous observable contract. On-device, the retained native layer
    // paints first and the drawer close animation (~90ms) finishes before
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
    notifyAfterFirstVisualFrame(nextSnapshot.revision);
  };

  return Object.freeze({
    getSnapshot: () => snapshot,

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
};

const controllerGlobal = globalThis as SidebarDestinationControllerGlobal;

// Preserve the controller across Expo Fast Refresh module re-evaluations.
const existingController = controllerGlobal.__rtx5SidebarDestinationController;
export const sidebarDestinationController =
  existingController
    && typeof existingController.registerVisualApplier === 'function'
    && typeof existingController.subscribeVisual === 'function'
    ? existingController
    : createSidebarDestinationController();

controllerGlobal.__rtx5SidebarDestinationController = sidebarDestinationController;

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
