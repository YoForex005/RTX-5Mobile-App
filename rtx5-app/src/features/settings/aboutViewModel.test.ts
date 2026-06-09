import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  ABOUT_ACTIONS,
  ABOUT_CONTACT_CATEGORIES,
  ABOUT_EXTERNAL_LINKS,
  buildDeveloperMailto,
  formatAboutPlatform,
  getAboutStoreTarget,
  resolveAboutBuildLabel,
} from './aboutViewModel';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('about actions match the reference screen order and labels', () => {
  assert.deepEqual(ABOUT_ACTIONS.map((action) => [action.id, action.title]), [
    ['rate-experience', 'Rate your experience'],
    ['user-guide', 'User guide'],
    ['privacy-policy', 'Privacy Policy'],
    ['account-deletion', 'Request Account Deletion'],
    ['contact-developer', 'Contact Developer'],
  ]);
  assert.equal(new Set(ABOUT_ACTIONS.map((action) => action.id)).size, ABOUT_ACTIONS.length);
});

test('about contact categories cover supportable app areas with deterministic ids', () => {
  const ids = ABOUT_CONTACT_CATEGORIES.map((category) => category.id);

  assert.deepEqual(ids, [
    'bug-report',
    'feature-request',
    'trading-account-problem',
    'account-deletion',
    'other',
  ]);
  assert.equal(new Set(ids).size, ids.length);
});

test('about store targets route android and ios to native store first with browser fallback', () => {
  const android = getAboutStoreTarget('android');
  const ios = getAboutStoreTarget('ios');
  const iosExact = getAboutStoreTarget('ios', {
    ...ABOUT_EXTERNAL_LINKS,
    iosAppStoreId: '1234567890',
  });

  assert.equal(android.storeLabel, 'Google Play');
  assert.equal(android.primaryUrl, `market://details?id=${ABOUT_EXTERNAL_LINKS.androidPackageName}`);
  assert.match(android.fallbackUrl, /play\.google\.com\/store\/apps\/details/);

  assert.equal(ios.storeLabel, 'App Store');
  assert.match(ios.primaryUrl, /^itms-apps:\/\/itunes\.apple\.com\/search/);
  assert.match(ios.fallbackUrl, /^https:\/\/apps\.apple\.com\/us\/search/);

  assert.equal(iosExact.primaryUrl, 'itms-apps://itunes.apple.com/app/id1234567890');
  assert.equal(iosExact.fallbackUrl, 'https://apps.apple.com/app/id1234567890');
});

test('about version label shows the OTA display version instead of native build numbers', () => {
  assert.equal(resolveAboutBuildLabel({ appVersion: '1.1.2' }), 'Version 1.1.2');
  assert.equal(resolveAboutBuildLabel({ appVersion: '1.1' }), 'Version 1.1');
  assert.equal(resolveAboutBuildLabel({ appVersion: '' }), 'Version Local');
});

test('about developer mailto includes selected category and device context', () => {
  const category = ABOUT_CONTACT_CATEGORIES.find((item) => item.id === 'bug-report');
  assert.ok(category);

  const mailto = buildDeveloperMailto({
    appName: 'RTX5',
    appVersion: '2.4.1',
    platform: 'Android',
    category,
    requesterName: 'Alex',
    requesterEmail: 'alex@example.com',
    title: 'Chart issue',
    message: 'Chart freezes after symbol change.',
  });
  const decoded = decodeURIComponent(mailto);

  assert.match(mailto, /^mailto:support@rtx5\.app\?/);
  assert.match(decoded, /subject=Chart issue/);
  assert.match(decoded, /App: RTX5/);
  assert.match(decoded, /Version: 2.4.1/);
  assert.match(decoded, /Platform: Android/);
  assert.match(decoded, /Category: Bug Report/);
  assert.match(decoded, /Name: Alex/);
  assert.match(decoded, /Email: alex@example.com/);
  assert.match(decoded, /Chart freezes after symbol change\./);
});

test('about account deletion request is available as an in-app contact category', () => {
  const category = ABOUT_CONTACT_CATEGORIES.find((item) => item.id === 'account-deletion');
  assert.ok(category);
  assert.equal(category.label, 'Account Deletion');

  const screenSource = readSource('src/features/settings/AboutScreen.tsx');
  assert.match(screenSource, /case 'account-deletion':/);
  assert.match(screenSource, /setContactTitle\('Account deletion request'\)/);
  assert.match(screenSource, /buildAccountDeletionRequestMessage\(\{/);
  assert.match(screenSource, /getConfiguredPrivacyPolicyUrl\(\)/);
});

test('about platform labels are presentation safe', () => {
  assert.equal(formatAboutPlatform('ios'), 'iOS');
  assert.equal(formatAboutPlatform('android'), 'Android');
  assert.equal(formatAboutPlatform('web'), 'Web preview');
  assert.equal(formatAboutPlatform('native'), 'NATIVE');
});

test('about screen follows the active app theme and owns its drawer', () => {
  const screenSource = readSource('src/features/settings/AboutScreen.tsx');
  const stylesSource = readSource('src/features/settings/AboutScreen.styles.ts');

  assert.match(screenSource, /const isDark = useIsDarkTheme\(\)/);
  assert.match(screenSource, /makeAboutStyles\(isDark\)/);
  assert.match(screenSource, /<SidebarDrawer \/>/);
  assert.match(screenSource, /latencyLabel="about\.menu"/);
  assert.match(screenSource, /const handleOpenMenu = useCallback\(\(\) => \{[\s\S]*hideActionSheet\(\);[\s\S]*setSidebarOpen\(true\);/);
  assert.match(screenSource, /onPress=\{handleOpenMenu\}/);
  assert.doesNotMatch(screenSource, /onPressIn=\{\(\) => setSidebarOpen\(true\)\}/);
  assert.doesNotMatch(screenSource, /ABOUT_BOTTOM_TABS|about\.bottomNav|styles\.bottomNav/);
  assert.doesNotMatch(stylesSource, /bottomNav|bottomTab|bottomIconWrap|bottomLabel/);
  assert.match(stylesSource, /export const makeAboutStyles = \(isDark = false\)/);
  assert.match(stylesSource, /screen: isDark \? '#050607' : '#FFFFFF'/);
  assert.match(stylesSource, /surface: isDark \? '#0B0F14' : '#FFFFFF'/);
  assert.match(stylesSource, /text: isDark \? '#F8FAFC' : '#050505'/);
});
