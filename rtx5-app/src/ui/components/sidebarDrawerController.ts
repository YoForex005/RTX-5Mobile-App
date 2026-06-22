type SidebarOpenHandler = () => void;

let openSidebarHandler: SidebarOpenHandler | null = null;
const SIDEBAR_OPEN_VISUAL_SYNC_DELAY_MS = 220;

export function registerSidebarOpenHandler(handler: SidebarOpenHandler) {
  openSidebarHandler = handler;

  return () => {
    if (openSidebarHandler === handler) {
      openSidebarHandler = null;
    }
  };
}

export function openSidebarDrawerImmediately() {
  openSidebarHandler?.();
}

export function scheduleAfterSidebarOpenVisual(action: () => void) {
  const timeoutId = setTimeout(action, SIDEBAR_OPEN_VISUAL_SYNC_DELAY_MS);
  return () => clearTimeout(timeoutId);
}
