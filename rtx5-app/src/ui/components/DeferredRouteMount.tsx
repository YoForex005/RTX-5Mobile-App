import { type ComponentType, type ReactNode, useEffect, useState } from 'react';

type DeferredRouteMountProps = {
  children: ReactNode;
};

type DeferredRouteModuleProps = {
  load: () => Promise<ComponentType>;
  cacheKey?: string;
};

const ROUTE_MODULE_LOAD_DELAY_MS = 0;
const ROUTE_HEAVY_CONTENT_DELAY_MS = 1200;

type CachedRouteModule = {
  component?: ComponentType;
  promise?: Promise<ComponentType>;
};

const routeModuleCache = new Map<string, CachedRouteModule>();

export function preloadDeferredRouteModule(
  cacheKey: string,
  load: () => Promise<ComponentType>,
): Promise<ComponentType> {
  const cached = routeModuleCache.get(cacheKey);
  if (cached?.component) {
    return Promise.resolve(cached.component);
  }
  if (cached?.promise) {
    return cached.promise;
  }

  const promise = load().then((Component) => {
    routeModuleCache.set(cacheKey, { component: Component });
    return Component;
  });
  routeModuleCache.set(cacheKey, { promise });
  return promise;
}

function scheduleDeferredFrameWork(frameCount: number, action: () => void) {
  let cancelled = false;
  let frameId: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const clearHandles = () => {
    if (frameId !== null) {
      globalThis.cancelAnimationFrame?.(frameId);
      frameId = null;
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const complete = () => {
    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (!cancelled) {
        action();
      }
    }, 0);
  };

  const nextFrame = (remainingFrames: number) => {
    if (cancelled) {
      return;
    }

    if (remainingFrames <= 0) {
      complete();
      return;
    }

    if (typeof globalThis.requestAnimationFrame === 'function') {
      frameId = globalThis.requestAnimationFrame(() => {
        frameId = null;
        nextFrame(remainingFrames - 1);
      });
      return;
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      nextFrame(remainingFrames - 1);
    }, 16);
  };

  nextFrame(frameCount);

  return () => {
    cancelled = true;
    clearHandles();
  };
}

export function useDeferredRouteContentReady(delayMs = ROUTE_HEAVY_CONTENT_DELAY_MS) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cancelFrameWork: (() => void) | null = null;

    setReady(false);

    const markReady = () => {
      cancelFrameWork = scheduleDeferredFrameWork(2, () => {
        if (!cancelled) {
          setReady(true);
        }
      });
    };

    const delayTimer = delayMs > 0 ? setTimeout(markReady, delayMs) : null;
    if (delayTimer === null) {
      markReady();
    }

    return () => {
      cancelled = true;
      if (delayTimer) {
        clearTimeout(delayTimer);
      }
      cancelFrameWork?.();
    };
  }, [delayMs]);

  return ready;
}

export function DeferredRouteMount({ children }: DeferredRouteMountProps) {
  return children;
}

export function DeferredRouteModule({ load, cacheKey }: DeferredRouteModuleProps) {
  const [RouteComponent, setRouteComponent] = useState<ComponentType | null>(() => (
    cacheKey ? routeModuleCache.get(cacheKey)?.component ?? null : null
  ));

  useEffect(() => {
    if (RouteComponent) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      const routeModule = cacheKey
        ? preloadDeferredRouteModule(cacheKey, load)
        : load();
      void routeModule.then((Component) => {
        if (!cancelled) {
          setRouteComponent(() => Component);
        }
      });
    }, ROUTE_MODULE_LOAD_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [RouteComponent, cacheKey, load]);

  if (!RouteComponent) {
    return null;
  }

  return <RouteComponent />;
}
