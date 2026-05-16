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

test('about build labels prefer native build numbers with app version fallback', () => {
  assert.equal(
    resolveAboutBuildLabel({ platform: 'android', appVersion: '1.0.0', androidVersionCode: 5660 }),
    'Build 5660',
  );
  assert.equal(
    resolveAboutBuildLabel({ platform: 'ios', appVersion: '1.0.0', iosBuildNumber: '42' }),
    'Build 42',
  );
  assert.equal(resolveAboutBuildLabel({ platform: 'android', appVersion: '1.0.0' }), 'Build 1.0.0');
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

test('about platform labels are presentation safe', () => {
  assert.equal(formatAboutPlatform('ios'), 'iOS');
  assert.equal(formatAboutPlatform('android'), 'Android');
  assert.equal(formatAboutPlatform('web'), 'Web preview');
  assert.equal(formatAboutPlatform('native'), 'NATIVE');
});

test('about screen follows the active app theme and owns its drawer', () => {
  const screenSource = readSource('src/features/settings/AboutScreen.tsx');
  const stylesSource = readSource('src/features/settings/AboutScreen.styles.ts');

  assert.match(screenSource, /useUserPreferences\(\(s\) => s\.themeMode\) === 'dark'/);
  assert.match(screenSource, /makeAboutStyles\(isDark\)/);
  assert.match(screenSource, /<SidebarDrawer \/>/);
  assert.match(screenSource, /latencyLabel="about\.menu"/);
  assert.match(screenSource, /onPress=\{\(\) => setSidebarOpen\(true\)\}/);
  assert.doesNotMatch(screenSource, /onPressIn=\{\(\) => setSidebarOpen\(true\)\}/);
  assert.match(stylesSource, /export const makeAboutStyles = \(isDark = false\)/);
  assert.match(stylesSource, /screen: isDark \? '#050607' : '#FFFFFF'/);
  assert.match(stylesSource, /surface: isDark \? '#0B0F14' : '#FFFFFF'/);
  assert.match(stylesSource, /text: isDark \? '#F8FAFC' : '#050505'/);
});
