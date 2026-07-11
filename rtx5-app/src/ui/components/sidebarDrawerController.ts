type SidebarOpenHandler = () => void;
export type SidebarMountedTabPath =
  | '/quotes'
  | '/chart'
  | '/trade'
  | '/history'
  | '/settings'
  | '/journal'
  | '/economic-calendar'
  | '/user-guide'
  | '/help'
  | '/about';
type SidebarTabNavigationHandler = (path: SidebarMountedTabPath) => void;
type SidebarControllerGlobal = typeof globalThis & {
  __rtx5SidebarTabNavigationHandler?: SidebarTabNavigationHandler;
};

const sidebarOpenHandlers: SidebarOpenHandler[] = [];
const sidebarControllerGlobal = globalThis as SidebarControllerGlobal;
const SIDEBAR_OPEN_VISUAL_SYNC_DELAY_MS = 130;

export function registerSidebarOpenHandler(handler: SidebarOpenHandler) {
  sidebarOpenHandlers.push(handler);

  return () => {
    const index = sidebarOpenHandlers.lastIndexOf(handler);
    if (index >= 0) {
      sidebarOpenHandlers.splice(index, 1);
    }
  };
}

export function openSidebarDrawerImmediately() {
  sidebarOpenHandlers[sidebarOpenHandlers.length - 1]?.();
}

export function registerSidebarTabNavigationHandler(handler: SidebarTabNavigationHandler) {
  sidebarControllerGlobal.__rtx5SidebarTabNavigationHandler = handler;
  return () => {
    if (sidebarControllerGlobal.__rtx5SidebarTabNavigationHandler === handler) {
      delete sidebarControllerGlobal.__rtx5SidebarTabNavigationHandler;
    }
  };
}

export function navigateMountedSidebarTab(path: string) {
  const handler = sidebarControllerGlobal.__rtx5SidebarTabNavigationHandler;
  if (!handler) {
    return false;
  }
  handler(path as SidebarMountedTabPath);
  return true;
}

export function scheduleAfterSidebarOpenVisual(action: () => void) {
  const timeoutId = setTimeout(action, SIDEBAR_OPEN_VISUAL_SYNC_DELAY_MS);
  return () => clearTimeout(timeoutId);
}
