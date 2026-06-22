type SidebarOpenHandler = () => void;

let openSidebarHandler: SidebarOpenHandler | null = null;

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
