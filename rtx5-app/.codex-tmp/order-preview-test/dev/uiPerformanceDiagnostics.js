"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useUiInteractionDiagnostics = exports.useUiPerformanceDiagnostics = void 0;
exports.traceUiInteraction = traceUiInteraction;
exports.recordUiFeedGap = recordUiFeedGap;
exports.useUiPerformanceDiagnosticsRuntime = useUiPerformanceDiagnosticsRuntime;
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const react_native_1 = require("react-native");
const react_1 = require("react");
const zustand_1 = require("zustand");
const uiPerformanceDiagnostics_helpers_1 = require("./uiPerformanceDiagnostics.helpers");
const DEV_ENABLED = typeof __DEV__ !== 'undefined' && __DEV__;
const SAMPLE_LIMIT = 80;
const STORAGE_KEY = 'rtx5-ui-performance-diagnostics-v1';
const STORAGE_FLUSH_DEBOUNCE_MS = 2_000;
const UI_STALL_WATCHDOG_INTERVAL_MS = 500;
const UI_STALL_RECORD_THRESHOLD_MS = 180;
const getNow = () => typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
const runOnNextFrame = (callback) => {
    if (typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(() => callback());
        return;
    }
    setTimeout(callback, 16);
};
const createSampleId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let persistenceHydrationStarted = false;
let persistenceFlushTimer = null;
let persistenceFlushInFlight = null;
exports.useUiPerformanceDiagnostics = (0, zustand_1.create)((set) => ({
    enabled: false,
    hasHydrated: false,
    samples: [],
    clearSamples: () => {
        set({ samples: [] });
        scheduleUiPerformanceSnapshotPersist(true);
    },
    recordSample: (sample) => {
        set((state) => ({
            samples: (0, uiPerformanceDiagnostics_helpers_1.trimUiPerformanceSamples)([sample, ...state.samples], SAMPLE_LIMIT),
        }));
        scheduleUiPerformanceSnapshotPersist(false);
    },
    setEnabled: (enabled) => {
        set({ enabled });
        scheduleUiPerformanceSnapshotPersist(true);
    },
    setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
}));
exports.useUiInteractionDiagnostics = exports.useUiPerformanceDiagnostics;
function getUiPerformancePersistencePayload() {
    const state = exports.useUiPerformanceDiagnostics.getState();
    return {
        enabled: state.enabled,
        samples: state.samples,
    };
}
async function persistUiPerformanceSnapshotNow() {
    if (!DEV_ENABLED) {
        return;
    }
    const payload = getUiPerformancePersistencePayload();
    persistenceFlushInFlight = async_storage_1.default.setItem(STORAGE_KEY, JSON.stringify(payload))
        .catch((error) => {
        console.warn('[UI Perf] Failed to persist diagnostics snapshot', error);
    })
        .finally(() => {
        persistenceFlushInFlight = null;
    });
    await persistenceFlushInFlight;
}
function scheduleUiPerformanceSnapshotPersist(immediate) {
    if (!DEV_ENABLED) {
        return;
    }
    if (persistenceFlushTimer) {
        clearTimeout(persistenceFlushTimer);
        persistenceFlushTimer = null;
    }
    if (immediate) {
        void persistUiPerformanceSnapshotNow();
        return;
    }
    persistenceFlushTimer = setTimeout(() => {
        persistenceFlushTimer = null;
        void persistUiPerformanceSnapshotNow();
    }, STORAGE_FLUSH_DEBOUNCE_MS);
}
async function hydrateUiPerformanceDiagnosticsFromStorage() {
    if (!DEV_ENABLED || persistenceHydrationStarted) {
        if (!DEV_ENABLED) {
            exports.useUiPerformanceDiagnostics.getState().setHasHydrated(true);
        }
        return;
    }
    persistenceHydrationStarted = true;
    try {
        const raw = await async_storage_1.default.getItem(STORAGE_KEY);
        if (!raw) {
            return;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return;
        }
        exports.useUiPerformanceDiagnostics.setState((state) => ({
            enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : state.enabled,
            samples: Array.isArray(parsed.samples)
                ? (0, uiPerformanceDiagnostics_helpers_1.trimUiPerformanceSamples)(parsed.samples.filter(Boolean), SAMPLE_LIMIT)
                : state.samples,
        }));
    }
    catch (error) {
        console.warn('[UI Perf] Failed to rehydrate persisted diagnostics', error);
    }
    finally {
        exports.useUiPerformanceDiagnostics.getState().setHasHydrated(true);
    }
}
const shouldCaptureUiDiagnostics = () => DEV_ENABLED && exports.useUiPerformanceDiagnostics.getState().enabled;
function recordUiPerformanceSample(sample) {
    if (!shouldCaptureUiDiagnostics()) {
        return;
    }
    exports.useUiPerformanceDiagnostics.getState().recordSample(sample);
}
function finalizeUiTrace(label, startedAtMs, handlerFinishedAtMs, options = {}) {
    const kind = options.kind ?? 'interaction';
    runOnNextFrame(() => {
        const nextFrameMs = getNow() - startedAtMs;
        react_native_1.InteractionManager.runAfterInteractions(() => {
            const settledMs = getNow() - startedAtMs;
            const handlerMs = handlerFinishedAtMs - startedAtMs;
            recordUiPerformanceSample({
                id: createSampleId(),
                kind,
                label,
                startedAtMs,
                handlerMs,
                nextFrameMs,
                settledMs,
                context: options.context,
                recordedAtIso: new Date().toISOString(),
                severity: (0, uiPerformanceDiagnostics_helpers_1.resolveUiPerformanceSeverity)({
                    kind,
                    handlerMs,
                    nextFrameMs,
                    settledMs,
                }),
            });
        });
    });
}
function traceUiInteraction(label, action, options = {}) {
    if (!shouldCaptureUiDiagnostics()) {
        action();
        return;
    }
    const startedAtMs = getNow();
    let handlerFinishedAtMs = startedAtMs;
    try {
        action();
    }
    finally {
        handlerFinishedAtMs = getNow();
        finalizeUiTrace(label, startedAtMs, handlerFinishedAtMs, options);
    }
}
function recordUiFeedGap(label, gapMs, context) {
    if (!shouldCaptureUiDiagnostics()) {
        return;
    }
    recordUiPerformanceSample((0, uiPerformanceDiagnostics_helpers_1.buildUiFeedGapSample)({
        id: createSampleId(),
        label,
        gapMs,
        context,
        startedAtMs: getNow() - gapMs,
        recordedAtIso: new Date().toISOString(),
    }));
}
let uiStallWatchdogConsumers = 0;
let uiStallWatchdogTimer = null;
let uiStallAppStateSubscription = null;
let uiStallLastTickAtMs = 0;
let uiStallAppState = react_native_1.AppState.currentState;
let uiPerformancePersistenceAppStateSubscription = null;
function startUiStallWatchdog() {
    if (!DEV_ENABLED) {
        return;
    }
    uiStallWatchdogConsumers += 1;
    if (uiStallWatchdogTimer) {
        return;
    }
    uiStallLastTickAtMs = getNow();
    uiStallAppState = react_native_1.AppState.currentState;
    uiStallAppStateSubscription = react_native_1.AppState.addEventListener('change', (nextState) => {
        uiStallAppState = nextState;
        uiStallLastTickAtMs = getNow();
    });
    uiStallWatchdogTimer = setInterval(() => {
        const now = getNow();
        const driftMs = now - uiStallLastTickAtMs - UI_STALL_WATCHDOG_INTERVAL_MS;
        uiStallLastTickAtMs = now;
        if (uiStallAppState !== 'active') {
            return;
        }
        if (driftMs < UI_STALL_RECORD_THRESHOLD_MS) {
            return;
        }
        recordUiPerformanceSample((0, uiPerformanceDiagnostics_helpers_1.buildUiThreadStallSample)({
            id: createSampleId(),
            startedAtMs: now - driftMs,
            blockedMs: driftMs,
            context: `watchdog drift over ${UI_STALL_WATCHDOG_INTERVAL_MS}ms cadence`,
            recordedAtIso: new Date().toISOString(),
        }));
    }, UI_STALL_WATCHDOG_INTERVAL_MS);
}
function stopUiStallWatchdog() {
    if (!DEV_ENABLED) {
        return;
    }
    uiStallWatchdogConsumers = Math.max(0, uiStallWatchdogConsumers - 1);
    if (uiStallWatchdogConsumers > 0) {
        return;
    }
    if (uiStallWatchdogTimer) {
        clearInterval(uiStallWatchdogTimer);
        uiStallWatchdogTimer = null;
    }
    uiStallAppStateSubscription?.remove();
    uiStallAppStateSubscription = null;
}
function useUiPerformanceDiagnosticsRuntime(pathname) {
    const previousPathRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        if (!DEV_ENABLED) {
            return;
        }
        void hydrateUiPerformanceDiagnosticsFromStorage();
        startUiStallWatchdog();
        if (!uiPerformancePersistenceAppStateSubscription) {
            uiPerformancePersistenceAppStateSubscription = react_native_1.AppState.addEventListener('change', (nextState) => {
                if (nextState !== 'active') {
                    scheduleUiPerformanceSnapshotPersist(true);
                }
            });
        }
        return () => stopUiStallWatchdog();
    }, []);
    (0, react_1.useEffect)(() => {
        const previousPath = previousPathRef.current;
        if (!previousPath) {
            previousPathRef.current = pathname;
            return;
        }
        if (previousPath === pathname) {
            return;
        }
        const startedAtMs = getNow();
        finalizeUiTrace(`route ${previousPath} -> ${pathname}`, startedAtMs, startedAtMs, {
            kind: 'navigation',
            context: pathname,
        });
        previousPathRef.current = pathname;
    }, [pathname]);
}
