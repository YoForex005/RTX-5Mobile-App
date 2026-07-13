type BackRouter = {
  canGoBack?: () => boolean;
  back: () => void;
  replace: (href: any) => void;
};

export function safeRouterBack(router: BackRouter, fallbackHref: any = '/') {
  try {
    if (typeof router.canGoBack === 'function' && router.canGoBack()) {
      router.back();
      return;
    }
  } catch (error) {
    // React Navigation can throw "The action 'GO_BACK' was not handled by any navigator."
    // even if canGoBack() returns true in certain deep link or modal states.
    // Fallthrough to router.replace
  }

  router.replace(fallbackHref);
}

/**
 * Lets the touch-down frame paint before a potentially expensive Expo Router
 * stack pop. The native screen stays stable for that one frame, then Back runs
 * outside the press event instead of blocking its visual acknowledgement.
 */
export function scheduleBackNavigationAfterVisualFrame(action: () => void) {
  const runAfterFrame = () => setTimeout(action, 0);
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(runAfterFrame);
    return;
  }
  setTimeout(action, 0);
}
