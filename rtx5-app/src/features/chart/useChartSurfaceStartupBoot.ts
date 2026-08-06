import { useEffect, useState } from 'react';
import { useUserPreferences } from '../../state/userPreferences';
import { scheduleIdleWork } from '../../utils/startupScheduler';

/**
 * Idle-scheduled startup boot for the chart WebView surface.
 *
 * Fresh app opens paid the entire chart cost (WebView document boot,
 * lightweight-charts parse, initChart handshake, first data paint) on the
 * first Chart tab tap, which made that tap feel multi-second slow. Returning
 * true from this hook lets the surface mount while another tab is visible so
 * all of that work completes at app open; the first Chart visit then reveals
 * an already-painted chart. Hidden tab scenes keep their full layout size
 * (opacity 0, never display:none), so the WebView boots and paints normally.
 *
 * An unconditional boot-prewarm was removed once before because it competed
 * with the login transition and first tab paint on low-memory devices. This
 * boot therefore holds back until:
 * - the user is logged in and preferences have hydrated (the saved chart
 *   symbol/timeframe are final, so the boot warms the right context), and
 * - CHART_SURFACE_STARTUP_BOOT_DELAY_MS has passed since those gates opened
 *   AND the JS thread reports an idle slot (scheduleIdleWork), so the boot
 *   never races startup navigation or the first visible tab's paint.
 *
 * The focused path still owns the boot when the user reaches Chart before the
 * idle boot fires (`surfaceAlreadyActivated` cancels the pending schedule).
 * Everything gated by chartRuntimeActive (queries, quote hooks, positions
 * polling) stays paused; the only hidden work enabled early is the WebView
 * surface plus the retained selected-symbol candle+Bid bridge — exactly the
 * steady state the app already maintains after the first Chart visit.
 */
export const CHART_SURFACE_STARTUP_BOOT_DELAY_MS = 2000;
const CHART_SURFACE_STARTUP_BOOT_IDLE_TIMEOUT_MS = 5000;

export function useChartSurfaceStartupBoot(surfaceAlreadyActivated: boolean): boolean {
  const isLoggedIn = useUserPreferences((state) => state.isLoggedIn);
  const preferencesHydrated = useUserPreferences((state) => state.hasHydrated);
  const [startupBooted, setStartupBooted] = useState(false);

  useEffect(() => {
    if (startupBooted || surfaceAlreadyActivated || !isLoggedIn || !preferencesHydrated) {
      return undefined;
    }

    return scheduleIdleWork(
      () => setStartupBooted(true),
      {
        delayMs: CHART_SURFACE_STARTUP_BOOT_DELAY_MS,
        timeoutMs: CHART_SURFACE_STARTUP_BOOT_IDLE_TIMEOUT_MS,
      },
    );
  }, [isLoggedIn, preferencesHydrated, startupBooted, surfaceAlreadyActivated]);

  return startupBooted;
}
