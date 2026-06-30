type SidebarOpenHandler = () => void;

const sidebarOpenHandlers: SidebarOpenHandler[] = [];
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

export function scheduleAfterSidebarOpenVisual(action: () => void) {
  const timeoutId = setTimeout(action, SIDEBAR_OPEN_VISUAL_SYNC_DELAY_MS);
  return () => clearTimeout(timeoutId);
}
