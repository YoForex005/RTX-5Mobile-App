# RTX5 OTA Update Information

> **Current live production OTA: `1.1.33` for Android and iOS.**
>
> Live EAS state last verified: `2026-08-04` (Asia/Calcutta).
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

## Current Production Answer - OTA `1.1.33`

This is the exact OTA that is currently live. These identifiers are recorded so
the next agent can understand the existing Android and iOS release; they are not
instructions to publish it again.

| Field | Android | iOS |
| --- | --- | --- |
| Current OTA-visible version | `1.1.33` | `1.1.33` |
| Publication state | **LIVE** | **LIVE** |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `69c232da-cddd-4b2b-b298-e3f270eea8a2` | `ed38a801-9549-4949-9888-710a7b9cf63b` |
| Update ID | `019fcd3f-f8c4-7c61-9360-8de8544c3120` | `019fcd42-81b3-77e4-bb3c-75ead61ec1b4` |
| EAS source commit | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Source status | Dirty isolated release worktree (`2975156...*`) | Dirty isolated release worktree (`2975156...*`) |
| OTA safety-comparison base used | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Main-line product source synced into the release worktree | `0d5aaf325afb87a6a935685ad86ca3a33253ee5d` | `0d5aaf325afb87a6a935685ad86ca3a33253ee5d` |
| Channel / branch / environment | `production` / `production` / `production` | `production` / `production` / `production` |
| Created | `2026-08-04T14:49:09.572Z` | `2026-08-04T14:51:55.699Z` |

## Instructions for the Next OTA Agent

No next OTA is authorized or published by this documentation change. When the
user later explicitly requests another OTA, follow this decision table:

| Release field | Reuse from `1.1.33`? | Required next-agent action |
| --- | --- | --- |
| Expo owner/project, EAS project ID, update URL | **Normally yes** | Verify them live before publishing. |
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

The current `1.1.33` group and update IDs are historical evidence only. Never
pass them to a future publish command and never describe them as the IDs for the
next OTA. Keep the top of this file at `1.1.33` until both newly requested
platform updates have actually been published and verified through live EAS.

## Production Destination — Reuse After Live Verification

| Field | Production value |
| --- | --- |
| Working directory | `rtx5-app` |
| Expo owner/project | `yoforex/rtx5-app` |
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

## Current Live OTA `1.1.33` — Android

| Field | Verified value |
| --- | --- |
| Compatible EAS build reference | `cfe3b101-ab15-4e18-854b-ef808e96d708` — installed/store confirmation still required |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` |
| Update group | `69c232da-cddd-4b2b-b298-e3f270eea8a2` |
| Update ID | `019fcd3f-f8c4-7c61-9360-8de8544c3120` |
| Source commit recorded by EAS | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Source status | Dirty isolated release worktree (`2975156...*`) |
| OTA safety-comparison base used | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Created | `2026-08-04T14:49:09.572Z` |
| Message | `Android production OTA 1.1.33 chart SL/TP protected trading runtime 30cba832` |
| Manifest | `https://u.expo.dev/update/019fcd3f-f8c4-7c61-9360-8de8544c3120` |
| Dashboard | `https://expo.dev/accounts/yoforex/projects/rtx5-app/updates/69c232da-cddd-4b2b-b298-e3f270eea8a2` |

## Current Live OTA `1.1.33` — iOS

| Field | Verified value |
| --- | --- |
| Compatible EAS build reference | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` — installed/store confirmation still required |
| Runtime | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `ed38a801-9549-4949-9888-710a7b9cf63b` |
| Update ID | `019fcd42-81b3-77e4-bb3c-75ead61ec1b4` |
| Source commit recorded by EAS | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Source status | Dirty isolated release worktree (`2975156...*`) |
| OTA safety-comparison base used | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Created | `2026-08-04T14:51:55.699Z` |
| Message | `iOS production OTA 1.1.33 chart SL/TP protected trading runtime ef38da27` |
| Manifest | `https://u.expo.dev/update/019fcd42-81b3-77e4-bb3c-75ead61ec1b4` |
| Dashboard | `https://expo.dev/accounts/yoforex/projects/rtx5-app/updates/ed38a801-9549-4949-9888-710a7b9cf63b` |

## Critical Rule for the Next OTA

The two runtime values above are **conditional compatibility values**. Use the
same Android or iOS runtime again only when all of the following are proven:

1. The intended installed/store binary uses that exact platform runtime.
2. The exact release source passes the OTA safety check with zero
   native-impacting changes.
3. The resolved runtime and live production state have been verified.

If any check fails, stop and create/validate the required native build. Never
force an old runtime merely to make an incompatible source publish.

The following `1.1.33` values are **historical and must not be reused**:

- Update group
- Update ID
- Created timestamp
- Manifest URL
- Dashboard URL
- Version and release message

EAS automatically creates a new group, update ID, timestamp, manifest URL, and
dashboard URL for every new platform publication. They cannot be selected in
advance. If the user later explicitly authorizes a `1.1.34` OTA, it may
conditionally target the same compatible runtimes, but it must receive new
Android and iOS group/update IDs. This file does not mark `1.1.34` as published.

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
