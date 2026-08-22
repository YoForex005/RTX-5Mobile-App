# RTX5 Production OTA Baseline

> **CURRENT STATUS: PRODUCTION OTA `1.1.42` IS LIVE FOR ANDROID AND IOS.
> DO NOT PUBLISH THE ASSESSED `main` SOURCE LINE DIRECTLY TO THE OLD RUNTIMES.**
>
> This tracked file is the shared production OTA baseline. It is a
> last-verified snapshot, not permission to publish. Always verify live EAS
> state, the installed binary source commit, and both resolved runtimes before
> an OTA.

Last verified: `2026-08-22` (Asia/Calcutta)

## Authoritative Project Location

- Repository: `YoForex005/RTX-5Mobile-App`
- Production app working directory: `rtx5-app`
- Effective Expo config: `rtx5-app/app.config.js`
- Base Expo config loaded by it: `rtx5-app/app.json`
- EAS profiles: `rtx5-app/eas.json`
- Expo owner/project: `yoforex-organisation/rtx5-app`
- EAS project ID: `092a58db-dea9-469a-a383-f27300598812`
- Update URL: `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812`
- Runtime policy: `fingerprint`
- EAS channel and branch: `production`
- EAS environment: `production`
- GitHub production workflow: `.github/workflows/eas-update.yml`
- Required GitHub workflow branch for production: `release`

The repository-root `app.json` and `eas.json` are not the RTX5 production app
authority. Always change directory to `rtx5-app` before running Expo or EAS
commands.

The GitHub OTA workflow is manual (`workflow_dispatch`). A normal Git push does
not publish an OTA. As of this verification, the Git remote contained only
`main`; do not create `release` from current `main` merely to make the workflow
run.

## Next OTA: Reused Values Versus New Values

Reuse the production destination only after live verification: Expo project
`yoforex-organisation/rtx5-app`, EAS project ID
`092a58db-dea9-469a-a383-f27300598812`, channel/branch `production`, EAS
environment `production`, and the project update URL shown above.

The last verified runtime targets are conditional compatibility values:

| Platform | Runtime used by production OTA `1.1.42` |
| --- | --- |
| Android | `30cba83220fc6c92180eed477863c3e3e3087ce6` |
| iOS | `ef38da275b765380037fc377f5c596de31690b7d` |

Reuse a runtime only when the intended installed/store binary uses that exact
runtime and the exact release source passes all safety and compatibility checks.
If it does not match, stop; do not force it merely to complete a publish.

Update groups, update IDs, timestamps, manifests, and dashboard URLs are EAS
generated identifiers. The `1.1.41` values below are historical records and
cannot be reused for the next OTA. Every later Android and iOS publish receives
new identifiers. The version, message, release source/status, safety base, and
target binary must also be freshly determined and recorded.

## Current Compatibility Decision

| Item | Android | iOS |
| --- | --- | --- |
| Last verified `1.1.42` target runtime; installed/store confirmation required | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Assessed isolated release-source natural runtime (before explicit targeting, re-measured for `1.1.42`) | `cfd5f88a74b618f8a432c6ac2b26641bb07872a7` | `6ab0fec78db6b2b2f7b623ab4abb6f2a35f4c332` |
| Runtime match | **NO** | **NO** |

Product-source snapshot assessed and synced into the isolated release worktree
for the `1.1.42` OTA:

```text
76ca44f183a654b9885904bffd84c25cb4375248
```

This main snapshot includes the release-blocking fix commit
`76ca44f1` ("stale chart contract tests fixed and app display version bumped
for OTA 1.1.42"): 8 chart source-contract tests on main had drifted behind the
recent chart feature commits and failed on both main and the release source.
Each asserted invariant was verified intact in the current code before the
stale assertions were updated; no product code was changed for the fix.

Documentation-only commits may appear after that SHA. Always run
`git rev-parse HEAD` and resolve both runtimes again; do not infer
compatibility from the branch name or this snapshot.

Latest production OTA source commit:

```text
2975156c15199c21bb3a4c73af8bd35189aaa2bd
```

The assessed `main` source was not published directly. Its normally resolved
runtimes do not match the compatible installed binary runtimes. Production OTA
`1.1.42` (like `1.1.32` through `1.1.41` before it) was instead assembled in
the isolated release worktree based on the last OTA source commit above (the
linked git worktree at `.codex-tmp/ota-release-1.1.41`, detached at
`2975156c...`; do not delete it during cleanups). Current OTA-deliverable
application changes from the main-line snapshot at `76ca44f1...`
(`rtx5-app/app`, `rtx5-app/src`,
`rtx5-app/tests`, `rtx5-app/scripts`, plus non-native support files) were
synced in, while native-sensitive configuration, dependencies
(`package.json`/`package-lock.json`/`eas.json`), and icon assets remained on
that compatible baseline. Dependency sections of `package.json` and the full
lockfile package set (0 added, 0 removed, 0 version-changed packages) were
verified identical between main and the baseline before syncing. EAS therefore
records source commit `2975156...` with a dirty-worktree marker.

The Android and iOS updates were published separately and explicitly targeted
the same platform runtime values used by `1.1.31` through `1.1.41`
(`RTX5_FORCE_RUNTIME_VERSION` with `RTX5_ALLOW_FORCE_RUNTIME_VERSION=true`,
per platform, plus `CI=1` for the expo-cli export). The release contains 814
changed paths against `2975156...` inside `rtx5-app` (790 tracked
modifications plus 24 newly added source files). Its only native-sensitive
path is `app.json`, whose exact diff remains the owner metadata change from
`yoforex` to `yoforex-organisation` already used by live OTA `1.1.40`; the
project ID, update URL, runtimes, native settings, and dependencies remain
unchanged. The isolated source's natural fingerprint resolved to the exact
same hashes measured for the `1.1.41` release source (`cfd5f88a...` Android /
`6ab0fec7...` iOS), proving zero native-surface drift since `1.1.41`. This
exceptional, reviewed continuation of the prior runtime lines is not permission
to publish raw current `main` or another unreviewed source against those
runtimes.

The `1.1.42` publish initially failed with "Unable to resolve module
./../../../rtx5-app/node_modules/expo-router/entry.js" because the worktree's
`node_modules` had become a junction to the main repo's tree. The junction was
removed (`rmdir`, never `rd /s`) and replaced with a real `npm ci` from the
baseline lockfile; hermesc verified working (Hermes 0.12.0, HBC bytecode 96)
and both exports then succeeded.

Before shipping source from this line, either:

1. Create and validate new production binaries for its resolved native
   fingerprints; or
2. Isolate an OTA-safe source line whose resolved runtime still exactly matches
   the intended installed binary.

## Compatible Production Binary Baseline

These EAS build records prove runtime compatibility. They do not by themselves
prove which build is currently distributed by Google Play or the App Store;
verify the installed/store build before publishing.

### Android

| Field | Verified value |
| --- | --- |
| EAS build ID | `cfe3b101-ab15-4e18-854b-ef808e96d708` |
| App version | `1.1.11` |
| Version code | `28` |
| Build profile | `production` |
| Binary source commit | `63ddb9817984c4d71c5e265332e3f5e846267625` |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` |
| Created | `2026-06-19T06:20:00.709Z` |

The latest finished Android production build was later observed as build `32`
with runtime `56277bfea8d7fe467046bf696d33ea99553c2656`. It does not match the
Android `1.1.31` OTA runtime. Confirm the installed Google Play build rather
than assuming the highest EAS build number is the active store binary.

### iOS

| Field | Verified value |
| --- | --- |
| EAS build ID | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` |
| App version | `1.1.10` |
| Build number | `30` |
| Build profile | `production` |
| Binary source commit | `63ddb9817984c4d71c5e265332e3f5e846267625` |
| Runtime | `ef38da275b765380037fc377f5c596de31690b7d` |
| Created | `2026-06-19T06:57:53.486Z` |

## Last Verified Production OTA Snapshot

Production OTA `1.1.42` was published on `2026-08-22` to the same Android and
iOS runtime lines used by `1.1.31` through `1.1.41`. Re-evaluate runtime
compatibility for every later change.

### Android

| Field | Verified value |
| --- | --- |
| OTA-visible version | `1.1.42` |
| Compatible EAS build reference | `cfe3b101-ab15-4e18-854b-ef808e96d708` — installed/store confirmation required |
| Source commit | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| EAS source status | Dirty isolated release worktree (`2975156...*`) |
| Main-line product source snapshot synced in | `76ca44f183a654b9885904bffd84c25cb4375248` |
| OTA safety-comparison base | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` |
| Update group | `f1932556-51e4-4e82-bb65-34f5113e2a7b` |
| Update ID | `01a02820-cef1-7d13-a3c0-08cb2bca0781` |
| Created | `2026-08-22T06:20:33.905Z` |
| Message | `Android production OTA 1.1.42 validated app updates runtime 30cba832` |
| Manifest | `https://u.expo.dev/update/01a02820-cef1-7d13-a3c0-08cb2bca0781` |
| Dashboard | `https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/f1932556-51e4-4e82-bb65-34f5113e2a7b` |

### iOS

| Field | Verified value |
| --- | --- |
| OTA-visible version | `1.1.42` |
| Compatible EAS build reference | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` — installed/store confirmation required |
| Source commit | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| EAS source status | Dirty isolated release worktree (`2975156...*`) |
| Main-line product source snapshot synced in | `76ca44f183a654b9885904bffd84c25cb4375248` |
| OTA safety-comparison base | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Runtime | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `34458613-1b82-4fad-9b2b-5826b2377130` |
| Update ID | `01a02823-ca49-7de1-834c-7d6c169beb28` |
| Created | `2026-08-22T06:23:49.321Z` |
| Message | `iOS production OTA 1.1.42 validated app updates runtime ef38da27` |
| Manifest | `https://u.expo.dev/update/01a02823-ca49-7de1-834c-7d6c169beb28` |
| Dashboard | `https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/34458613-1b82-4fad-9b2b-5826b2377130` |

### Release validation recorded for `1.1.42`

- Release-blocking test fix first: 8 chart source-contract tests on main had
  drifted behind the recent chart feature commits and failed on both main and
  the release source. Every asserted invariant was verified intact in the
  current code (marker refs cleared via `clearOverlayMarkers`, 5s overlay
  re-push, CHART_READY overlay/live-price restore, pre-setData manual-range
  capture, session `cacheNamespace` propagation, pane-selection gating,
  retained-chart loading gates) before the stale assertions were updated in
  commit `76ca44f1`. No product code changed.
- Full tests on main and in the isolated release worktree: all 363 test files
  passed in each source (re-run after the version bump and again after the
  worktree `npm ci`).
- TypeScript typecheck: passed on main and in the release worktree.
- Production EAS environment validation (`check-eas-env.js production`): passed
  (all 12 required public variables present).
- Native-sensitive comparison against `2975156...`: 814 changed paths inside
  `rtx5-app`; only `app.json` is native-sensitive, and its exact diff is the
  owner metadata already live in `1.1.40`. Project ID, update URL, runtimes,
  native settings, and dependencies stayed unchanged.
- Dependency sections of `package.json` and the full lockfile package set (0
  added, 0 removed, 0 version-changed) verified identical between main and the
  release baseline before syncing; `eas.json` diff limited to the `cli.version`
  pin; the only asset diff is the binary-only `android-adaptive-foreground.png`
  icon, which was kept on the baseline.
- Isolated-source natural fingerprint re-resolved to the exact `1.1.41`
  release-source hashes (`cfd5f88a...` Android / `6ab0fec7...` iOS): zero
  native-surface drift since `1.1.41`.
- Compatible binary build records re-verified live: Android
  `cfe3b101...` (1.1.11, runtime `30cba832...`, source `63ddb981...`) and iOS
  `1b1bd2e3...` (1.1.10, runtime `ef38da27...`, source `63ddb981...`), both
  FINISHED production builds.
- Expo Doctor: 17/18 checks passed. Its only advisory was newer Expo SDK patch
  releases (`expo` 54.0.37, `expo-constants` 18.0.14, and `expo-updates`
  29.0.20); they were intentionally not adopted because this OTA preserves the
  exact dependency set of the compatible binary baseline.
- Worktree `node_modules` was a junction to the main repo tree and broke the
  first export ("Unable to resolve module
  ./../../../rtx5-app/node_modules/expo-router/entry.js"). Replaced with a
  real `npm ci` from the baseline lockfile; hermesc verified (Hermes 0.12.0,
  HBC bytecode 96); Android and iOS production exports then passed.
- Live `channel:view`/`update:list` and both `update:view` checks: passed
  before and after publishing.
- Physical-device delivery confirmation: Android confirmed on the connected
  test phone (`com.rtx5.app` 1.1.11/vc28, the compatible `30cba832...` build):
  the app's update prompt downloaded and installed the OTA on first launch and
  the About screen then showed `Version 1.1.42`. iOS physical confirmation
  still pending (no iOS device connected).

The previous `1.1.41` groups were Android
`ffe5adbd-82c6-4648-a2eb-a4b73bfbf486` and iOS
`629fb1e1-6550-467b-b69a-c5efa8e71867`.

## Start From Another Computer

```powershell
git clone https://github.com/YoForex005/RTX-5Mobile-App.git
cd RTX-5Mobile-App
git pull --ff-only origin main
git fetch --all --tags --prune
git status --short
git rev-parse HEAD
cd rtx5-app
```

Stop if the worktree is unexpectedly dirty or if the checked-out commit is not
the intended release source.

## Mandatory Fail-Closed Preflight

First verify the live production channel and updates:

```powershell
npx.cmd --yes eas-cli@21.4.0 whoami
npx.cmd --yes eas-cli@21.4.0 channel:view production --json --non-interactive
npx.cmd --yes eas-cli@21.4.0 update:list --branch production --limit 20 --json --non-interactive
```

Then verify environment, native-change safety, and runtime compatibility:

Do not confuse these two source references:

- **Target binary source commit:** the native source used to build the intended
  installed/store binary. It is evidence for the build and its runtime; confirm
  it independently for each platform.
- **OTA safety-comparison base:** the reviewed compatible source from which the
  proposed OTA changes are measured by `check-ota-safety.js --base`. For a
  normal direct release this may be the target binary source commit. For an
  isolated prior-runtime continuation it may be the previous audited OTA source.

For `1.1.32`, the reference target binary source was `63ddb981...`, while the
isolated release safety-comparison base was `2975156...`. A zero-change result
against the safety base does not by itself prove that an installed binary is
compatible; its exact runtime must still be confirmed.

```powershell
$targetBinarySourceCommit = "<verified-installed-binary-source-commit>"
$otaSafetyBase = "<approved-ota-compatible-source-commit>"

git status --short
npm run typecheck
npm test
node .\scripts\ota\check-eas-env.js production
node .\scripts\ota\check-ota-safety.js --base $otaSafetyBase
node .\scripts\ota\print-update-context.js --channel production
npx.cmd expo-updates runtimeversion:resolve --platform android
npx.cmd expo-updates runtimeversion:resolve --platform ios
npx.cmd expo-doctor
```

Publishing is blocked unless:

- The working tree and source commit are deliberate and recorded.
- The environment check passes.
- The target binary source/build and the OTA safety-comparison base are both
  deliberate, independently verified, and recorded.
- The safety check reports zero native-impacting changes from the approved OTA
  safety-comparison base, unless the only reported path is the separately
  reviewed ownership metadata already live on the same project/runtime line.
- On the normal path, the resolved Android and iOS runtimes exactly match the
  intended binaries.
- On an explicitly approved prior-runtime continuation, each platform is
  published separately only after its installed-binary runtime is proven and
  the isolated source preserves the reviewed compatible native baseline.
- The live channel/update history still matches this baseline.
- Provider credentials or other secrets are not printed or committed.

If Android and iOS use different binary source commits or only one platform's
runtime matches, validate and publish each platform separately. Never publish
`--platform all` merely because one platform matches.

## Publishing

GitHub workflow path — available only when an approved remote `release` branch
already exists:

1. Prepare and validate the exact release source.
2. Ensure the GitHub `release` branch points to that approved source.
3. Open GitHub Actions and run `RTX5 OTA Update` manually.
4. Select branch `release`.
5. Set `channel: production`.
6. Select only the validated platform, or `all` only when both match.
7. Enter the approved OTA safety-comparison base in the required `base-ref`
   input; do not assume it is the same as the target binary source commit.
8. Use a message containing the intended visible version and short source SHA.

Current direct path from `rtx5-app` when no approved `release` branch exists:

```powershell
$env:RTX5_OTA_BASE_REF="<approved-ota-safety-comparison-base>"
npm run update:prod -- --message "production <visible-version> $(git rev-parse --short HEAD)"
```

The `update:prod` wrapper owns `--platform all`. Use it only when both platform
runtime decisions are independently approved for the same release. When Android
and iOS require separate runtime targeting, run the same preflight first and use
separate reviewed, platform-scoped EAS update commands. Never try to override
the wrapper's protected `--platform` or runtime flags.

Do not set `RTX5_FORCE_RUNTIME_VERSION` on raw or unreviewed source merely to
bypass a runtime mismatch. The `1.1.40` release used explicit per-platform
runtime targeting only after isolating the prior compatible OTA source and
verifying zero native-impacting changes before the required owner-transfer
metadata update. Releases `1.1.41` and `1.1.42` then repeated the isolation
proof and confirmed that the same owner-only metadata was the entire
native-sensitive diff (with the `1.1.42` natural fingerprint also matching the
`1.1.41` release-source hashes exactly). Repeat that full proof before any
similar exception.

## Required Update After Every Production Publish

After EAS confirms the publish:

1. Re-run `channel:view production` and `update:list`.
2. Record each platform's source commit, runtime, group, update ID, timestamp,
   message, and target binary.
3. Record whether the publish source was clean or dirty.
4. Update this file only from verified live results.
5. Commit and push this file so every computer receives the new baseline.
6. Verify the installed physical Android and iOS builds receive the intended
   update.

Never store `EXPO_TOKEN`, passwords, feed tokens, `.env` values, signing keys,
or service-account JSON in this file.
