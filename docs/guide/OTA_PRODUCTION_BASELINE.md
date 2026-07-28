# RTX5 Production OTA Baseline

> **CURRENT STATUS: BLOCKED - DO NOT PUBLISH A PRODUCTION OTA FROM THE
> ASSESSED `main` SOURCE LINE.**
>
> This tracked file is the shared production OTA baseline. It is a
> last-verified snapshot, not permission to publish. Always verify live EAS
> state, the installed binary source commit, and both resolved runtimes before
> an OTA.

Last verified: `2026-07-28` (Asia/Calcutta)

## Authoritative Project Location

- Repository: `YoForex005/RTX-5Mobile-App`
- Production app working directory: `rtx5-app`
- Expo config: `rtx5-app/app.json`
- EAS profiles: `rtx5-app/eas.json`
- Expo owner/project: `yoforex/rtx5-app`
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

## Current Compatibility Decision

| Item | Android | iOS |
| --- | --- | --- |
| Compatible production binary runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Assessed product-source runtime | `3b93b456598125d15e65051c4b185ac67aa959b4` | `9a3004379f09edfb61a11cf7f772c791977ecc0b` |
| Runtime match | **NO** | **NO** |

Product-source commit assessed before this documentation-only update:

```text
77d68e1a8eabb9cd25a217f18e48bf71d7f71700
```

Documentation-only commits may appear after that SHA. Always run
`git rev-parse HEAD` and resolve both runtimes again; do not infer
compatibility from the branch name or this snapshot.

Latest production OTA source commit:

```text
2975156c15199c21bb3a4c73af8bd35189aaa2bd
```

The assessed product source has not been published as the production `1.1.31`
OTA. Its resolved runtimes do not match the compatible installed binary
runtimes. Do not force an old runtime value and do not publish this source line
as an OTA to those binaries.

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

The `2026-07-24` OTA did not require a new binary for the matching runtime
lines. Re-evaluate that decision for every later change.

### Android

| Field | Verified value |
| --- | --- |
| OTA-visible version | `1.1.31` |
| Source commit | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` |
| Update group | `ce03e9a3-1890-4be1-bfc7-33c017c40f51` |
| Update ID | `019f92e4-34a2-76c1-b3b3-5fc69034c5f1` |
| Created | `2026-07-24T06:50:57.058Z` |
| Message | `Android production OTA 1.1.31 candle ticks + SLTP position stability runtime 30cba832` |
| Manifest | `https://u.expo.dev/update/019f92e4-34a2-76c1-b3b3-5fc69034c5f1` |
| Dashboard | `https://expo.dev/accounts/yoforex/projects/rtx5-app/updates/ce03e9a3-1890-4be1-bfc7-33c017c40f51` |

### iOS

| Field | Verified value |
| --- | --- |
| OTA-visible version | `1.1.31` |
| Source commit | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Runtime | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `ddb13542-3c16-4774-9c46-16920db0d904` |
| Update ID | `019f92e7-b724-7415-9881-ebe34ef5b8e0` |
| Created | `2026-07-24T06:54:47.076Z` |
| Message | `iOS production OTA 1.1.31 candle ticks + SLTP position stability runtime ef38da27` |
| Manifest | `https://u.expo.dev/update/019f92e7-b724-7415-9881-ebe34ef5b8e0` |
| Dashboard | `https://expo.dev/accounts/yoforex/projects/rtx5-app/updates/ddb13542-3c16-4774-9c46-16920db0d904` |

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
npx eas-cli@latest whoami
npx eas-cli@latest channel:view production --json --non-interactive
npx eas-cli@latest update:list --branch production --limit 20 --json --non-interactive
```

Then verify environment, native-change safety, and runtime compatibility:

```powershell
$binaryCommit = "63ddb9817984c4d71c5e265332e3f5e846267625"

git status --short
npm run typecheck
npm test
node .\scripts\ota\check-eas-env.js production
node .\scripts\ota\check-ota-safety.js --base $binaryCommit
node .\scripts\ota\print-update-context.js --channel production
npx expo-updates runtimeversion:resolve --platform android
npx expo-updates runtimeversion:resolve --platform ios
npx expo-doctor
```

Publishing is blocked unless:

- The working tree and source commit are deliberate and recorded.
- The environment check passes.
- The safety check reports zero native-impacting changes from the verified
  binary source commit.
- The resolved Android runtime exactly matches the intended Android binary.
- The resolved iOS runtime exactly matches the intended iOS binary.
- The live channel/update history still matches this baseline.
- Provider credentials or other secrets are not printed or committed.

If Android and iOS use different binary source commits or only one platform's
runtime matches, validate and publish each platform separately. Never publish
`--platform all` merely because one platform matches.

## Publishing

Preferred path:

1. Prepare and validate the exact release source.
2. Ensure the GitHub `release` branch points to that approved source.
3. Open GitHub Actions and run `RTX5 OTA Update` manually.
4. Select branch `release`.
5. Set `channel: production`.
6. Select only the validated platform, or `all` only when both match.
7. Enter the verified binary source commit in the required `base-ref` input.
8. Use a message containing the intended visible version and short source SHA.

Direct EAS fallback from `rtx5-app`:

```powershell
$env:RTX5_OTA_BASE_REF="<verified-binary-source-commit>"
npm run update:prod -- --message "production <visible-version> $(git rev-parse --short HEAD)"
```

Do not set `RTX5_FORCE_RUNTIME_VERSION` to make incompatible source reach an
older binary.

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
