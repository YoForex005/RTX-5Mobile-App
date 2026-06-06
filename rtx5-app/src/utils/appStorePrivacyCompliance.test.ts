import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('demo registration requires explicit legal acceptance and opens legal documents', () => {
  const source = readSource('app/register.tsx');

  assert.match(source, /const \[termsAccepted, setTermsAccepted\] = useState\(false\)/);
  assert.doesNotMatch(source, /const \[termsAccepted, setTermsAccepted\] = useState\(true\)/);
  assert.match(source, /useOrrnnDemoStatus\(isScreenFocused\)/);
  assert.match(source, /useOrrnnDemoGroups\(isScreenFocused && isDemoServiceReady\)/);
  assert.match(source, /useBrokerServers\(isScreenFocused\)/);
  assert.match(source, /if \(!termsAccepted\)/);
  assert.match(source, /router\.push\(\{ pathname: '\/settings\/legal', params: \{ document: 'terms' \} \}\)/);
  assert.match(source, /router\.push\(\{ pathname: '\/settings\/legal', params: \{ document: 'privacy' \} \}\)/);
  assert.match(source, /disabled=\{isLoading \|\| !canSubmitDemoAccount \|\| !termsAccepted\}/);
});

test('protected-resource declarations stay minimized for App Review', () => {
  const appConfig = readSource('app.json');
  const packageManifest = readSource('package.json');
  const packageLock = readSource('package-lock.json');
  const settingsSource = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');

  assert.doesNotMatch(appConfig, /android\.permission\.CAMERA|expo-camera|NSCameraUsageDescription/);
  assert.doesNotMatch(packageManifest, /expo-camera/);
  assert.doesNotMatch(packageLock, /node_modules\/expo-camera|"expo-camera"/);
  assert.doesNotMatch(appConfig, /RECORD_AUDIO|NSMicrophoneUsageDescription/);
  assert.doesNotMatch(appConfig, /NSPhotoLibraryUsageDescription|NSLocationWhenInUseUsageDescription|NSContactsUsageDescription/);
  assert.doesNotMatch(settingsSource, /QRScannerModal|QR Scanner|showScanner|setShowScanner|qr-scanner/);
});

test('about exposes privacy policy and account deletion from the app', () => {
  const aboutViewModelSource = readSource('src/features/settings/aboutViewModel.ts');
  const aboutScreenSource = readSource('src/features/settings/AboutScreen.tsx');

  assert.match(aboutViewModelSource, /id: 'privacy-policy'/);
  assert.match(aboutViewModelSource, /id: 'account-deletion'/);
  assert.match(aboutScreenSource, /case 'privacy-policy':/);
  assert.match(aboutScreenSource, /handleOpenPrivacyPolicy\(\)/);
  assert.match(aboutScreenSource, /pathname: '\/settings\/legal'/);
  assert.match(aboutScreenSource, /case 'account-deletion':/);
  assert.match(aboutScreenSource, /handleOpenAccountDeletionRequest\(\)/);
});

test('legal URL resolver rejects missing and relative policy URLs before opening externally', () => {
  const legalLinksSource = readSource('src/config/legalLinks.ts');
  const layoutSource = readSource('app/_layout.tsx');
  const routeSource = readSource('app/settings/legal.tsx');
  const screenSource = readSource('src/features/settings/LegalDocumentScreen.tsx');

  assert.match(legalLinksSource, /termsUrl: ''/);
  assert.match(legalLinksSource, /privacyPolicyUrl: ''/);
  assert.match(legalLinksSource, /\^https\?:\\\/\\\//);
  assert.match(routeSource, /document === 'terms' \? 'terms' : 'privacy'/);
  assert.match(layoutSource, /<Stack\.Screen name='settings\/legal'/);
  assert.match(screenSource, /getLegalDocument\(document\)/);
  assert.match(screenSource, /keyboardShouldPersistTaps="always"/);
  assert.match(screenSource, /canCancelContentTouches=\{Platform\.OS === 'ios'\}/);
});
