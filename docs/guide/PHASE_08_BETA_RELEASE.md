# Phase 08 - Beta Release and OTA Rollout

## Objective
Execute controlled beta distribution and staged OTA promotion with rollback readiness.

## In Scope
- Build and distribute iOS TestFlight and Android internal builds.
- Validate OTA channels and runtime gating.
- Run full regression and release checklists.
- Promote from preview to staging to production channel.

## Out of Scope
- Public store wide release marketing operations.

## Exact Implementation Tasks
1. Cut release candidate branch and freeze feature merges.
2. Build signed binaries for iOS and Android beta channels.
3. Run full test matrix and defect triage.
4. Publish OTA bundle to preview and run smoke tests.
5. Promote OTA to staging after acceptance.
6. Monitor crash/error/performance telemetry for soak period.
7. Promote to production channel if gates pass.
8. Document release notes and known limitations.

## API Dependencies
- Production-like staging backend environment.
- Feature flag controls for rollout toggles.

## Acceptance Checklist
- [ ] iOS and Android beta builds installed and validated.
- [ ] OTA promotion process executed without runtime mismatch.
- [ ] Monitoring dashboards show no regression spikes.
- [ ] Rollback procedure tested at least once in staging.

## Test Checklist
- [ ] Full Detox suite pass.
- [ ] Maestro smoke suite pass on both platforms.
- [ ] Manual high-risk journey sign-off.

## Exit Criteria
- Beta release is declared stable with rollback readiness confirmed.

## Progress Notes
- 2026-05-22: Expo/EAS ownership was moved to `@chinese-hedger/rtx5-app`, and `rtx5-app/app.json` now points `owner`, `expo-updates.username`, `extra.eas.projectId`, and `updates.url` at the new project. The `development`, `preview`, `staging`, and `production` channels and matching branches exist on the new EAS project; release acceptance remains pending until beta builds, smoke tests, and rollback validation are completed.
- 2026-05-21: Added a production-channel Android APK profile (`production-apk`) for internal install links while keeping the store `production` profile as AAB output. EAS cloud APK creation is blocked by the account's exhausted Android Free plan quota until 2026-06-01 or a plan upgrade.
- 2026-05-06: Updated the Android production application ID to `com.rtx5.app` and added an Android-only production EAS build script for AAB output. EAS cloud build could not start in the sandbox because `eas-cli` is not installed and npm registry access is blocked. A local Gradle AAB attempt reached Android dependency resolution, then stopped because Maven access to required artifacts such as React Native, Hermes, and Fresco is blocked; owner next action is to run the production Android EAS build from an authenticated/networked Expo environment.
- 2026-05-06: Added guarded channel publish scripts for `preview`, `staging`, and `production` EAS Updates. The wrapper keeps channel selection explicit, publishes only native platforms, and leaves runtime-version compatibility enforced by EAS Update/app-version gating.
- 2026-05-05: Integrated the root OTA launch check for EAS Update channels and verified Expo config plus strict TypeScript. Production Android remains configured for AAB output through the `production` EAS profile.

