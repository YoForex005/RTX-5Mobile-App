# RTX5 OTA Update Information

> **Current live production OTA: `1.1.42` for Android and iOS.**
>
> Live EAS state last verified: `2026-08-22` (Asia/Calcutta).
>
> **DOCUMENTATION ONLY:** this file does not authorize an OTA publish. Do not
> publish, change the app version, or target a runtime until the user explicitly
> requests the next OTA.

This file is the quick production reference. The detailed compatibility,
validation, binary, and release history source of truth is:

- [`docs/guide/OTA_PRODUCTION_BASELINE.md`](docs/guide/OTA_PRODUCTION_BASELINE.md)
- [`WORKSPACE_TOOLCHAIN.json`](WORKSPACE_TOOLCHAIN.json)
- [`docs/guide/NEW_WINDOWS_MACHINE_SETUP.md`](docs/guide/NEW_WINDOWS_MACHINE_SETUP.md)

Read and verify the production baseline before publishing from any computer. Do not
run production EAS commands from the repository root; the production Expo app
is under `rtx5-app`.

## Current Production Answer - OTA `1.1.42`

This is the exact OTA that is currently live. These identifiers are recorded so
the next agent can understand the existing Android and iOS release; they are not
instructions to publish it again.

| Field | Android | iOS |
| --- | --- | --- |
| Current OTA-visible version | `1.1.42` | `1.1.42` |
| Publication state | **LIVE** | **LIVE** |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `f1932556-51e4-4e82-bb65-34f5113e2a7b` | `34458613-1b82-4fad-9b2b-5826b2377130` |
| Update ID | `01a02820-cef1-7d13-a3c0-08cb2bca0781` | `01a02823-ca49-7de1-834c-7d6c169beb28` |
| EAS source commit | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Source status | Dirty isolated release worktree (`2975156...*`) | Dirty isolated release worktree (`2975156...*`) |
| OTA safety-comparison base used | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Main-line product source snapshot synced into the release worktree | `76ca44f183a654b9885904bffd84c25cb4375248` | `76ca44f183a654b9885904bffd84c25cb4375248` |
| Channel / branch / environment | `production` / `production` / `production` | `production` / `production` / `production` |
| Created | `2026-08-22T06:20:33.905Z` | `2026-08-22T06:23:49.321Z` |

The isolated release worktree lives at `.codex-tmp/ota-release-1.1.41` (linked
git worktree, detached at `2975156c...`, kept dirty with main's app code).
Do not delete it during repo cleanups; if lost, rebuild per the baseline guide.

The isolated source contains 814 changed paths against `2975156c...` inside
`rtx5-app` (790 tracked modifications plus 24 newly added app/test source
files, including `design-qa.md` and `poll2.png`). The only native-sensitive
path is `app.json`, and its exact diff remains the ownership metadata change
`yoforex` to `yoforex-organisation` already used by live OTA `1.1.40`. The
project ID, update URL, platform runtimes, native settings, and dependencies
remain unchanged; main's `package.json` dependency sections and the full
lockfile package set were re-verified identical to the baseline before syncing
(0 added, 0 removed, 0 version-changed packages).

## Instructions for the Next OTA Agent

No next OTA is authorized or published by this documentation change. When the
user later explicitly requests another OTA, follow this decision table:

| Release field | Reuse from `1.1.42`? | Required next-agent action |
| --- | --- | --- |
| Expo owner/project, EAS project ID, update URL | **Normally yes** | Current owner/project is `yoforex-organisation/rtx5-app`; verify it live before publishing. |
| Channel, branch, EAS environment | **Normally yes: `production`** | Verify the channel is active and still points to the production branch. |
| Android runtime | **Conditional only** | Target `30cba832...` again only if the intended installed Android binary uses it and the exact release source passes every safety check. |
| iOS runtime | **Conditional only** | Target `ef38da27...` again only if the intended installed iOS binary uses it and the exact release source passes every safety check. |
| Android/iOS update group | **No** | EAS must generate a new group for each new platform publication. |
| Android/iOS update ID | **No** | EAS must generate a new update ID for each new platform publication. |
| Timestamp, manifest, dashboard URL | **No** | Record the newly generated values after the publish succeeds. |
| OTA-visible version and message | **No** | Use only the new version and message explicitly requested by the user. |
| Release source commit/status | **Re-determine** | Record the exact validated source used for the new OTA. |
| OTA safety-comparison base | **Re-determine** | Select and record the reviewed compatible base; do not copy `2975156...` automatically. |
| Target binary/build record | **Re-confirm** | Verify the installed/store build and its platform runtime. |

The current `1.1.42` group and update IDs are historical evidence only. Never
pass them to a future publish command and never describe them as the IDs for the
next OTA. Keep the top of this file at `1.1.42` until both newly requested
platform updates have actually been published and verified through live EAS.

## Production Destination — Reuse After Live Verification

| Field | Production value |
| --- | --- |
| Working directory | `rtx5-app` |
| Expo owner/project | `yoforex-organisation/rtx5-app` |
| EAS project ID | `092a58db-dea9-469a-a383-f27300598812` |
| Update URL | `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812` |
| Channel | `production` |
| Channel ID | `019e4e07-2048-7da5-b4e7-e6d115eac5f2` |
| Branch | `production` |
| Branch ID | `019e4e07-1eb3-7000-bd63-d79591ead50e` |
| EAS environment | `production` |
| Runtime policy | `fingerprint` |
| Effective Expo config | `rtx5-app/app.config.js`, based on `rtx5-app/app.json` |
| Platform method | Validate and publish Android and iOS separately |

These values identify the production destination. Confirm them with live EAS
before every publish; do not assume a saved snapshot is still current.

## Current Live OTA `1.1.42` — Android

| Field | Verified value |
| --- | --- |
| Compatible EAS build reference | `cfe3b101-ab15-4e18-854b-ef808e96d708` — installed/store confirmation still required |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` |
| Update group | `f1932556-51e4-4e82-bb65-34f5113e2a7b` |
| Update ID | `01a02820-cef1-7d13-a3c0-08cb2bca0781` |
| Source commit recorded by EAS | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Source status | Dirty isolated release worktree (`2975156...*`) |
| OTA safety-comparison base used | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Created | `2026-08-22T06:20:33.905Z` |
| Message | `Android production OTA 1.1.42 validated app updates runtime 30cba832` |
| Manifest | `https://u.expo.dev/update/01a02820-cef1-7d13-a3c0-08cb2bca0781` |
| Dashboard | `https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/f1932556-51e4-4e82-bb65-34f5113e2a7b` |

## Current Live OTA `1.1.42` — iOS

| Field | Verified value |
| --- | --- |
| Compatible EAS build reference | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` — installed/store confirmation still required |
| Runtime | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `34458613-1b82-4fad-9b2b-5826b2377130` |
| Update ID | `01a02823-ca49-7de1-834c-7d6c169beb28` |
| Source commit recorded by EAS | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Source status | Dirty isolated release worktree (`2975156...*`) |
| OTA safety-comparison base used | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Created | `2026-08-22T06:23:49.321Z` |
| Message | `iOS production OTA 1.1.42 validated app updates runtime ef38da27` |
| Manifest | `https://u.expo.dev/update/01a02823-ca49-7de1-834c-7d6c169beb28` |
| Dashboard | `https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/34458613-1b82-4fad-9b2b-5826b2377130` |

## Critical Rule for the Next OTA

The two runtime values above are **conditional compatibility values**. Use the
same Android or iOS runtime again only when all of the following are proven:

1. The intended installed/store binary uses that exact platform runtime.
2. The exact release source passes the OTA safety check with zero
   native-impacting changes.
3. The resolved runtime and live production state have been verified.

If any check fails, stop and create/validate the required native build. Never
force an old runtime merely to make an incompatible source publish.

The following `1.1.42` values are **historical and must not be reused**:

- Update group
- Update ID
- Created timestamp
- Manifest URL
- Dashboard URL
- Version and release message

EAS automatically creates a new group, update ID, timestamp, manifest URL, and
dashboard URL for every new platform publication. They cannot be selected in
advance. If the user later explicitly authorizes another OTA, it may
conditionally target the same compatible runtimes, but it must receive new
Android and iOS group/update IDs. This file records `1.1.42` as published but
does not authorize a later OTA.

The release source commit/status, safety-comparison base, and target binary must
also be freshly determined and recorded for every OTA; do not copy them without
verification.

## Required Next-OTA Record

Before publishing:

1. For the OTA-visible version number, edit
   `rtx5-app/src/config/appDisplayVersion.ts` and
   `rtx5-app/src/config/appDisplayVersion.test.ts` after confirming the
   requested version. This does not limit the other validated application code
   included in the OTA.
2. Verify the live channel, production environment, target installed binaries,
   native-change safety, Android runtime, and iOS runtime.
3. Publish each platform only to its verified runtime.

After publishing, record here and in the production baseline:

- Version and exact release source/status
- Android runtime, group, update ID, timestamp, message, manifest, and dashboard
- iOS runtime, group, update ID, timestamp, message, manifest, and dashboard
- Target binary/build record and safety-comparison base
- Validation results and physical-device delivery confirmation
