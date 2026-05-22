# RTX5 OTA and Release Guide

## OTA Strategy
Use EAS Update with three channels:
1. `preview` - QA and developer validation.
2. `staging` - internal beta users and release candidates.
3. `production` - controlled public rollout.

## Runtime Version Gating
- Every binary build must declare a runtime version.
- OTA bundle must only target matching runtime versions.
- Never promote OTA bundle across incompatible runtime groups.

## Release Status Notes
- 2026-05-22: Relinked the Expo/EAS project to `@chinese-hedger/rtx5-app` with project ID `092a58db-dea9-469a-a383-f27300598812` and OTA URL `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812`. Created the `development`, `preview`, `staging`, and `production` update channels with same-name branches on the new project; no OTA bundles were published.
- 2026-05-21: Added an Android `production-apk` EAS profile for installable internal APK output on the `production` channel with the production EAS environment. Cloud build could not start because the Expo account has exhausted Android builds on the Free plan for this month; quota resets on 2026-06-01.
- 2026-05-06: Android production binary identifier is now `com.rtx5.app`. The `production` EAS profile still targets `channel: production` with Android `buildType: app-bundle`. EAS cloud build remains blocked locally until `eas-cli` is available in an authenticated/networked Expo environment; local Gradle AAB creation now reaches dependency resolution but cannot download required Maven artifacts under sandbox network restrictions.
- 2026-05-06: OTA publish scripts now route `preview`, `staging`, and `production` through `scripts/eas-update.js`, which forces `eas update --platform all` on the selected channel with CI/non-interactive fingerprint settings. Expo config is native-only (`ios`, `android`) with runtime version still gated by `appVersion`; web OTA output is intentionally excluded from the app config and EAS upload ignore list.
- 2026-05-05: Android production EAS build profile now targets Play Store output with `distribution: store`, production channel, and `android.buildType: app-bundle`. Runtime-version gating remains required for any OTA published to the production channel.
- 2026-05-05: Added native-only launch OTA check using `expo-updates` channel and runtime metadata. The app checks only on EAS channels (`preview`, `staging`, `production`) when `expo-updates` is enabled, then fetches and reloads a compatible update selected by EAS Update runtime gating.

## Promotion Criteria

### Preview -> Staging
- [ ] Smoke test on iOS and Android passed.
- [ ] No critical crashes in preview telemetry.
- [ ] Feature flags validated in preview.

### Staging -> Production
- [ ] Full regression matrix passed.
- [ ] Crash-free sessions meet release threshold.
- [ ] Security controls verified per `SECURITY.md`.

## Rollback Checklist
1. Identify failing OTA update ID and scope.
2. Disable risky feature via remote flag if available.
3. Republish last known stable update to affected channel.
4. Verify recovery on iOS and Android devices.
5. Document incident and root cause.

## Incident Response
- Severity levels:
1. Sev-1: trade action corruption or login outage.
2. Sev-2: major UX break with workaround.
3. Sev-3: cosmetic or low-frequency defects.

- Sev-1 and Sev-2 require immediate rollback decision within 30 minutes.

## Store Policy Guardrails
- OTA is used only for JS/assets/config updates allowed by store policy.
- Native capability changes require new binary release.

