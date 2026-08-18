import type { ComponentProps } from 'react';

import type { ActionSheet } from '../../ui/components/ActionSheet/ActionSheet';
import {
  cancelRetainedActionSheetPreview,
  commitRetainedActionSheetPreview,
  getRetainedActionSheetVisualSnapshot,
  requestRetainedActionSheetPreview,
} from '../../ui/components/ActionSheet/retainedActionSheetVisualController';
import { scheduleAfterFirstFrame } from '../../utils/startupScheduler';

/**
 * Owns the chart symbol picker's retained ActionSheet outside ChartScreen.
 * Preloading mounts searchable rows while hidden; opening can then start the
 * native slide in the tap turn and let React adopt visibility after one frame.
 */

export type ChartSymbolPickerSheetConfig = Omit<
  ComponentProps<typeof ActionSheet>,
  'visible' | 'onClose' | 'visualKey'
> & Readonly<{ visualKey: string }>;

export type ChartSymbolPickerSheetSnapshot = Readonly<{
  config: ChartSymbolPickerSheetConfig | null;
  revision: number;
  visible: boolean;
}>;

// A tiny external store lets one top-level host survive continuous chart renders.
const listeners = new Set<() => void>();
let snapshot: ChartSymbolPickerSheetSnapshot = Object.freeze({
  config: null,
  revision: 0,
  visible: false,
});
// These fields separate the currently visible interaction, a newer config that
// must wait until close, and the exact retained-preview revision we own.
let interactionActive = false;
let deferredConfig: ChartSymbolPickerSheetConfig | null = null;
let pendingAdoptionCancel: (() => void) | null = null;
let ownedRetainedRevision: number | null = null;

const publishSnapshot = (
  config: ChartSymbolPickerSheetConfig | null,
  visible: boolean,
) => {
  // Freeze each published value so subscribers always observe one coherent
  // config/visibility revision rather than partially updated controller state.
  snapshot = Object.freeze({
    config,
    revision: snapshot.revision + 1,
    visible,
  });
  listeners.forEach((listener) => listener());
};

export const subscribeChartSymbolPickerSheet = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getChartSymbolPickerSheetSnapshot = () => snapshot;

const cancelPendingAdoptionTimer = () => {
  pendingAdoptionCancel?.();
  pendingAdoptionCancel = null;
};

const releaseOwnedRetainedReveal = () => {
  if (ownedRetainedRevision === null) {
    return;
  }
  // Revision-scoped cancellation cannot erase a newer preview owned by a
  // different ActionSheet host.
  cancelRetainedActionSheetPreview(ownedRetainedRevision);
  ownedRetainedRevision = null;
};

/** Keeps the exact searchable symbol rows mounted before either chart launcher is touched. */
export function preloadChartSymbolPickerSheet(config: ChartSymbolPickerSheetConfig) {
  if (interactionActive || snapshot.visible || pendingAdoptionCancel !== null) {
    // Keep a native reveal internally consistent. Fresh market-symbol rows are
    // adopted as soon as the current sheet closes.
    deferredConfig = config;
    return false;
  }
  if (snapshot.config === config) {
    return false;
  }
  publishSnapshot(config, false);
  return true;
}

/**
 * Starts the exact mounted native slide in the touch turn. React adopts the
 * same visible state only after those first pixels reach the compositor.
 */
export function showChartSymbolPickerSheet(config: ChartSymbolPickerSheetConfig) {
  cancelPendingAdoptionTimer();
  releaseOwnedRetainedReveal();
  deferredConfig = null;
  interactionActive = true;

  if (snapshot.config !== config) {
    // A first-frame tap can beat the preload effect. It still opens correctly;
    // subsequent taps take the retained path below.
    publishSnapshot(config, true);
    return false;
  }

  const retainedRevision = requestRetainedActionSheetPreview(config.visualKey);
  ownedRetainedRevision = retainedRevision;
  const retainedRevealAccepted = commitRetainedActionSheetPreview(
    retainedRevision,
    config.visualKey,
  );
  if (!retainedRevealAccepted) {
    releaseOwnedRetainedReveal();
    publishSnapshot(config, true);
    return false;
  }

  pendingAdoptionCancel = scheduleAfterFirstFrame(() => {
    pendingAdoptionCancel = null;
    if (!interactionActive || ownedRetainedRevision !== retainedRevision) {
      return;
    }
    const retainedSnapshot = getRetainedActionSheetVisualSnapshot();
    if (
      retainedSnapshot.mode !== 'committed'
      || retainedSnapshot.revision !== retainedRevision
      || retainedSnapshot.visualKey !== config.visualKey
    ) {
      // A newer host won before adoption. Do not revive this stale picker over it.
      ownedRetainedRevision = null;
      interactionActive = false;
      return;
    }
    publishSnapshot(config, true);
  });
  return true;
}

export function hideChartSymbolPickerSheet() {
  const wasActive =
    interactionActive
    || snapshot.visible
    || pendingAdoptionCancel !== null
    || ownedRetainedRevision !== null;
  interactionActive = false;
  cancelPendingAdoptionTimer();
  releaseOwnedRetainedReveal();

  // Adopt symbol-list changes deferred during the animation only after hiding;
  // swapping retained rows mid-slide would reveal a mismatched sheet frame.
  const nextConfig = deferredConfig ?? snapshot.config;
  deferredConfig = null;
  if (snapshot.visible || snapshot.config !== nextConfig) {
    publishSnapshot(nextConfig, false);
  }
  return wasActive;
}

export function isChartSymbolPickerSheetActive() {
  return interactionActive || snapshot.visible;
}

export function disposeChartSymbolPickerSheet() {
  // The top-level host calls this on real unmount, releasing timers and any
  // retained ActionSheet preview so it cannot leak into another screen.
  interactionActive = false;
  deferredConfig = null;
  cancelPendingAdoptionTimer();
  releaseOwnedRetainedReveal();
  if (snapshot.config !== null || snapshot.visible) {
    publishSnapshot(null, false);
  }
}

export function resetChartSymbolPickerSheetControllerForTests() {
  interactionActive = false;
  deferredConfig = null;
  cancelPendingAdoptionTimer();
  releaseOwnedRetainedReveal();
  snapshot = Object.freeze({ config: null, revision: 0, visible: false });
  listeners.forEach((listener) => listener());
}
