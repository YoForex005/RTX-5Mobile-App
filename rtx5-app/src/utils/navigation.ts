type BackRouter = {
  canGoBack?: () => boolean;
  back: () => void;
  replace: (href: any) => void;
};

export function safeRouterBack(router: BackRouter, fallbackHref: any = '/') {
  if (typeof router.canGoBack === 'function' && router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(fallbackHref);
}
