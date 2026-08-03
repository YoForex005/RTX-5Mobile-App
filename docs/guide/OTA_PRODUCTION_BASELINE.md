# RTX5 Production OTA Baseline

> **CURRENT STATUS: PRODUCTION OTA `1.1.32` IS LIVE FOR ANDROID AND IOS.
> DO NOT PUBLISH THE ASSESSED `main` SOURCE LINE DIRECTLY TO THE OLD RUNTIMES.**
>
> This tracked file is the shared production OTA baseline. It is a
> last-verified snapshot, not permission to publish. Always verify live EAS
> state, the installed binary source commit, and both resolved runtimes before
> an OTA.

Last verified: `2026-08-03` (Asia/Calcutta)

## Authoritative Project Location

- Repository: `YoForex005/RTX-5Mobile-App`
- Production app working directory: `rtx5-app`
- Effective Expo config: `rtx5-app/app.config.js`
- Base Expo config loaded by it: `rtx5-app/app.json`
- EAS profiles: `rtx5-app/eas.json`
- Expo owner/project: see `owner` and `slug` in `rtx5-app/app.json`
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
`yoforex/rtx5-app`, EAS project ID
`092a58db-dea9-469a-a383-f27300598812`, channel/branch `production`, EAS
environment `production`, and the project update URL shown above.

The last verified runtime targets are conditional compatibility values:

| Platform | Runtime used by production OTA `1.1.32` |
| --- | --- |
| Android | `30cba83220fc6c92180eed477863c3e3e3087ce6` |
| iOS | `ef38da275b765380037fc377f5c596de31690b7d` |

Reuse a runtime only when the intended installed/store binary uses that exact
runtime and the exact release source passes all safety and compatibility checks.
If it does not match, stop; do not force it merely to complete a publish.

Update groups, update IDs, timestamps, manifests, and dashboard URLs are EAS
generated identifiers. The `1.1.32` values below are historical records and
cannot be reused for the next OTA. Every later Android and iOS publish receives
new identifiers. The version, message, release source/status, safety base, and
target binary must also be freshly determined and recorded.

## Current Compatibility Decision

| Item | Android | iOS |
| --- | --- | --- |
| Last verified `1.1.32` target runtime; installed/store confirmation required | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Assessed `9f39e0c...` product-source runtime | `9677dac3c4cdd2d471a3def0258968a0670e321e` | `75d947e7eaf665910e2754aff5b4c033c8a2b36b` |
| Runtime match | **NO** | **NO** |

Product-source commit assessed before this documentation-only update:

```text
9f39e0c590b4678e0eacba2bcba23253bf2d9919
```

Documentation-only commits may appear after that SHA. Always run
`git rev-parse HEAD` and resolve both runtimes again; do not infer
compatibility from the branch name or this snapshot.

Latest production OTA source commit:

```text
2975156c15199c21bb3a4c73af8bd35189aaa2bd
```

The assessed `main` source was not published directly. Its normally resolved
runtimes do not match the compatible installed binary runtimes. Production OTA
`1.1.32` was instead assembled in an isolated worktree based on the last OTA
source commit above. Current OTA-deliverable application changes were applied,
while native-sensitive configuration and dependencies remained on that
compatible baseline. EAS therefore records source commit `2975156...` with a
dirty-worktree marker.

The Android and iOS updates were published separately and explicitly targeted
the same platform runtime values used by `1.1.31`. The release safety comparison
against `2975156...` reported zero native-impacting changes. This exceptional,
reviewed continuation of the prior runtime lines is not permission to publish
raw current `main` or another unreviewed source against those runtimes.

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

Production OTA `1.1.32` was published on `2026-08-01` to the same Android and
iOS runtime lines used by `1.1.31`. Re-evaluate runtime compatibility for every
later change.

### Android

| Field | Verified value |
| --- | --- |
| OTA-visible version | `1.1.32` |
| Compatible EAS build reference | `cfe3b101-ab15-4e18-854b-ef808e96d708` — installed/store confirmation required |
| Source commit | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| EAS source status | Dirty isolated release worktree (`2975156...*`) |
| OTA safety-comparison base | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` |
| Update group | `5b7f6e87-870f-4f37-94fc-8639b1c23920` |
| Update ID | `019fbde7-12fc-7876-97d7-fe7493c87f8f` |
| Created | `2026-08-01T15:17:45.340Z` |
| Message | `Android production OTA 1.1.32 trading + chart + account stability runtime 30cba832` |
| Manifest | `https://u.expo.dev/update/019fbde7-12fc-7876-97d7-fe7493c87f8f` |
| Dashboard | `https://expo.dev/accounts/yoforex/projects/rtx5-app/updates/5b7f6e87-870f-4f37-94fc-8639b1c23920` |

### iOS

| Field | Verified value |
| --- | --- |
| OTA-visible version | `1.1.32` |
| Compatible EAS build reference | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` — installed/store confirmation required |
| Source commit | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| EAS source status | Dirty isolated release worktree (`2975156...*`) |
| OTA safety-comparison base | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Runtime | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `827f2197-ee6e-4651-8b6c-11d0190d37d1` |
| Update ID | `019fbde9-9e15-7873-bdf1-c4013264d7df` |
| Created | `2026-08-01T15:20:32.021Z` |
| Message | `iOS production OTA 1.1.32 trading + chart + account stability runtime ef38da27` |
| Manifest | `https://u.expo.dev/update/019fbde9-9e15-7873-bdf1-c4013264d7df` |
| Dashboard | `https://expo.dev/accounts/yoforex/projects/rtx5-app/updates/827f2197-ee6e-4651-8b6c-11d0190d37d1` |

### Release validation recorded for `1.1.32`

- Full tests: 292 test files passed.
- TypeScript typecheck: passed.
- Expo Doctor: 18/18 checks passed.
- Interaction tests: 167/167 passed.
- Stability tests: 291/291 passed.
- Clean Android and iOS production exports: passed.
- Production EAS environment validation: passed.
- OTA safety comparison against `2975156...`: zero native-impacting changes.
- Live `channel:view`, `update:list`, and both `update:view` checks: passed.

The previous `1.1.31` groups were Android
`ce03e9a3-1890-4be1-bfc7-33c017c40f51` and iOS
`ddb13542-3c16-4774-9c46-16920db0d904`.

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
  safety-comparison base.
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
bypass a runtime mismatch. The `1.1.32` release used explicit per-platform
runtime targeting only after isolating the prior compatible OTA source and
verifying zero native-impacting changes; repeat that full proof before any
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
