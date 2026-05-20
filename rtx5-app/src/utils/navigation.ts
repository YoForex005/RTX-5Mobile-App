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
