# GitHub OTA Setup Steps // important file for OTA

Use this file when you want GitHub to publish Expo OTA updates for the RTX5 phone app.

## One Time Setup

### Step 1: Create Expo Token

1. Open Expo access tokens page:

   ```text
   https://expo.dev/accounts/yoforex/settings/access-tokens
   ```

2. Click `Create token`.

3. Give any easy name, for example:

   ```text
   github-ota-rtx5
   ```

4. Create the token.

5. Copy the token value.

Important: save/copy the token immediately because Expo may show it only once.

### Step 2: Add Token In GitHub

1. Open GitHub repository:

   ```text
   https://github.com/YoForex005/RTX-5Mobile-App
   ```

2. Go to:

   ```text
   Settings -> Secrets and variables -> Actions
   ```

3. Click:

   ```text
   New repository secret
   ```

4. In `Name`, enter exactly:

   ```text
   EXPO_TOKEN
   ```

5. In `Secret`, paste the Expo token value.

6. Click:

   ```text
   Add secret
   ```

Do not enter `${{ secrets.EXPO_TOKEN }}` in the GitHub secret name field. The name must be only `EXPO_TOKEN`.

### Step 3: Create Release Branch

Open PowerShell in the project root:

```powershell
cd C:\Users\ADMIN\RTX-5Mobile-App
```

Create the release branch:

```powershell
git switch -c release
```

Create a safe first commit:

```powershell
git commit --allow-empty -m "Create release branch [skip ci]"
```

Push the release branch:

```powershell
git push -u origin release
```

The `release` branch is the production OTA branch.

## Manual Production OTA From GitHub

Use this when you want to manually publish production OTA from GitHub.

1. Open GitHub Actions:

   ```text
   https://github.com/YoForex005/RTX-5Mobile-App/actions
   ```

2. Click:

   ```text
   RTX5 OTA Update
   ```

3. Click:

   ```text
   Run workflow
   ```

4. Select:

   ```text
   Branch: release
   ```

5. Select:

   ```text
   EAS Update channel: production
   ```

6. Select:

   ```text
   Platform: all
   ```

7. In update message, write something clear:

   ```text
   Production OTA update
   ```

8. Click the green:

   ```text
   Run workflow
   ```

9. Wait until the workflow shows:

   ```text
   Success
   ```

When it shows success, the production OTA update is published.

## Future Automatic Production OTA

Use this when you change app code and want GitHub to publish OTA automatically.

1. Open PowerShell:

   ```powershell
   cd C:\Users\ADMIN\RTX-5Mobile-App
   ```

2. Switch to release branch:

   ```powershell
   git switch release
   ```

3. Check changed files:

   ```powershell
   git status --short
   ```

4. Add only the files you want to publish.

   Example:

   ```powershell
   git add rtx5-app/app rtx5-app/src
   ```

5. Commit:

   ```powershell
   git commit -m "Production OTA update"
   ```

6. Push:

   ```powershell
   git push origin release
   ```

7. GitHub will automatically run:

   ```text
   RTX5 OTA Update
   ```

8. If it shows success, production OTA is published.

## Phone Check After OTA

After OTA success:

1. Open the installed app on phone.
2. Wait 5-10 seconds.
3. Fully close the app.
4. Open the app again.
5. Confirm the new change is visible.

Expo usually downloads the update on one app open and applies it after restart/reload.

## Important Rule

OTA is only for JavaScript, TypeScript, UI, and normal bundled asset changes.

Do not use OTA when you changed:

- `rtx5-app/app.json`
- `rtx5-app/eas.json`
- `rtx5-app/package.json`
- `rtx5-app/package-lock.json`
- native permissions
- Android/iOS native folders
- app icon or splash native config

For those changes, make a new production build and upload to Play Store/App Store.

