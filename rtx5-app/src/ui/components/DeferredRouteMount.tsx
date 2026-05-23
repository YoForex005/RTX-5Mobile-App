import { type ComponentType, type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

type DeferredRouteMountProps = {
  children: ReactNode;
};

type DeferredRouteModuleProps = {
  load: () => Promise<ComponentType>;
  title?: string;
};

const ROUTE_MODULE_LOAD_DELAY_MS = 120;

function useDeferredRouteReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cancelReady = () => {};

    if (typeof globalThis.requestAnimationFrame === 'function') {
      const frameId = globalThis.requestAnimationFrame(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
      cancelReady = () => {
        globalThis.cancelAnimationFrame?.(frameId);
      };
    } else {
      const timerId = setTimeout(() => {
        if (!cancelled) {
          setReady(true);
        }
      }, 16);
      cancelReady = () => clearTimeout(timerId);
    }

    return () => {
      cancelled = true;
      cancelReady();
    };
  }, []);

  return ready;
}

function DeferredRoutePlaceholder({ title }: { title?: string }) {
  const T = useTheme();
  return (
    <View style={[styles.placeholder, { backgroundColor: T.bg }]}>
      {title ? <Text style={[styles.placeholderTitle, { color: T.text }]}>{title}</Text> : null}
    </View>
  );
}

export function DeferredRouteMount({ children }: DeferredRouteMountProps) {
  const ready = useDeferredRouteReady();

  if (!ready) {
    return <DeferredRoutePlaceholder />;
  }

  return children;
}

export function DeferredRouteModule({ load, title }: DeferredRouteModuleProps) {
  const ready = useDeferredRouteReady();
  const [RouteComponent, setRouteComponent] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (!ready || RouteComponent) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void load().then((Component) => {
        if (!cancelled) {
          setRouteComponent(() => Component);
        }
      });
    }, ROUTE_MODULE_LOAD_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [RouteComponent, load, ready]);

  if (!RouteComponent) {
    return <DeferredRoutePlaceholder title={title} />;
  }

  return <RouteComponent />;
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  placeholderTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
});
