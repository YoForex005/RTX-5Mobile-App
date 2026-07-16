/**
 * Sidebar-style retained destination controller for Chart Preferences
 * configuration rows (Schema & Colors, Price source, Open order mode, Alerts).
 *
 * Tap reveals a pre-mounted layer in the same JS turn; no route construction
 * is required for the first paint.
 */

export const CHART_CONFIG_DESTINATIONS = [
  'schema-colors',
  'price-source',
  'open-order-mode',
  'alerts',
] as const;

export type ChartConfigDestination = (typeof CHART_CONFIG_DESTINATIONS)[number];

export type ChartConfigDestinationSnapshot = Readonly<{
  destination: ChartConfigDestination | null;
  revision: number;
  visible: boolean;
}>;

export type ChartConfigDestinationVisualApplier = (
  destination: ChartConfigDestination | null,
) => void;

export type ChartConfigDestinationController = Readonly<{
  getSnapshot: () => ChartConfigDestinationSnapshot;
  hide: (revision?: number) => boolean;
  isVisible: () => boolean;
  registerVisualApplier: (applier: ChartConfigDestinationVisualApplier) => () => void;
  show: (destination: ChartConfigDestination) => number;
  subscribe: (listener: () => void) => () => void;
}>;

const CLOSED: ChartConfigDestinationSnapshot = Object.freeze({
  destination: null,
  revision: 0,
  visible: false,
});

const CHART_CONFIG_CONTROLLER_VERSION = 1;

export function createChartConfigDestinationController(): ChartConfigDestinationController {
  const listeners = new Set<() => void>();
  let visualApplier: ChartConfigDestinationVisualApplier | null = null;
  let snapshot: ChartConfigDestinationSnapshot = CLOSED;

  const publish = (next: ChartConfigDestinationSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  return Object.freeze({
    getSnapshot: () => snapshot,

    hide: (revision?: number) => {
      if (revision !== undefined && snapshot.revision !== revision) {
        return false;
      }
      if (!snapshot.visible) {
        visualApplier?.(null);
        return false;
      }
      visualApplier?.(null);
      publish(Object.freeze({
        destination: snapshot.destination,
        revision: snapshot.revision + 1,
        visible: false,
      }));
      return true;
    },

    isVisible: () => snapshot.visible,

    registerVisualApplier: (applier) => {
      visualApplier = applier;
      applier(snapshot.visible ? snapshot.destination : null);
      return () => {
        if (visualApplier === applier) {
          visualApplier = null;
        }
      };
    },

    show: (destination) => {
      const revision = snapshot.revision + 1;
      // UI-thread / native visibility first — same ordering as sidebar hosts.
      visualApplier?.(destination);
      publish(Object.freeze({
        destination,
        revision,
        visible: true,
      }));
      return revision;
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

type ChartConfigControllerGlobal = typeof globalThis & {
  __rtx5ChartConfigDestinationController?: ChartConfigDestinationController;
  __rtx5ChartConfigDestinationControllerVersion?: number;
};

const controllerGlobal = globalThis as ChartConfigControllerGlobal;
const existing = controllerGlobal.__rtx5ChartConfigDestinationController;

export const chartConfigDestinationController =
  existing
    && controllerGlobal.__rtx5ChartConfigDestinationControllerVersion === CHART_CONFIG_CONTROLLER_VERSION
    && typeof existing.show === 'function'
    && typeof existing.registerVisualApplier === 'function'
    ? existing
    : createChartConfigDestinationController();

controllerGlobal.__rtx5ChartConfigDestinationController = chartConfigDestinationController;
controllerGlobal.__rtx5ChartConfigDestinationControllerVersion = CHART_CONFIG_CONTROLLER_VERSION;

export function showChartConfigDestination(destination: ChartConfigDestination) {
  return chartConfigDestinationController.show(destination);
}

export function hideChartConfigDestination(revision?: number) {
  return chartConfigDestinationController.hide(revision);
}

export function isChartConfigDestinationVisible() {
  return chartConfigDestinationController.isVisible();
}
