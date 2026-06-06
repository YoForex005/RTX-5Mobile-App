# GitHub Production OTA Push Guide // important file 

From now, when code is uploaded to GitHub for a production OTA update, use this way.

## Production OTA Git Commands

Example:

```powershell
cd C:\Users\ADMIN\RTX-5Mobile-App
git switch release

git add rtx5-app/src/features/quotes/useLiveQuotes.ts
git commit -m "Production OTA update"
git push origin release
```

After this command:

```powershell
git push origin release
```

GitHub will run:

```text
RTX5 OTA Update
```

It will publish OTA to:

```text
production
```

## GitHub Setup Checked

```text
release branch exists: YES
main branch exists: YES
staging branch exists: NO
OTA workflow exists on release: YES
release branch maps to production OTA: YES
GitHub Actions OTA workflow is enabled: YES
latest release OTA run success: YES
```

Recent GitHub OTA run:

```text
RTX5 OTA Update
branch: release
status: success
date: 2026-06-03
```

## Important

OTA does not upload a new app to App Store or Play Store.

OTA updates the already-installed app using Expo.

For App Store or Play Store new build, use the separate workflow:

```text
RTX5 EAS Build
```

## Check OTA After Push

Use this link after pushing:

```text
https://github.com/YoForex005/RTX-5Mobile-App/actions/workflows/eas-update.yml
```

## Clear Rule

```text
Production OTA update -> push to release
Preview testing update -> push to main
Staging update -> staging branch is not created yet
```
