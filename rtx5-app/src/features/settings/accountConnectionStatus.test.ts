import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { hasAuthenticatedAccountSession } from './accountConnectionStatus';

const authenticatedAccount = {
  id: '900001',
  name: 'Account 900001',
  server: 'Orrnn',
  credentials: {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: '2026-06-18T00:00:00.000Z',
  },
};

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('connected account status requires a completed authenticated session', () => {
  assert.equal(hasAuthenticatedAccountSession(true, authenticatedAccount), true);
  assert.equal(hasAuthenticatedAccountSession(false, authenticatedAccount), false);
  assert.equal(hasAuthenticatedAccountSession(true, null), false);
  assert.equal(
    hasAuthenticatedAccountSession(true, {
      ...authenticatedAccount,
      id: '',
    }),
    false,
  );
  assert.equal(
    hasAuthenticatedAccountSession(true, {
      ...authenticatedAccount,
      credentials: {
        ...authenticatedAccount.credentials,
        accessToken: '',
      },
    }),
    false,
  );
});

test('settings screens gate connected badges behind authenticated session state', () => {
  const settingsSource = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');
  const accountsSource = readSource('src/features/settings/AccountsScreen.tsx');

  assert.match(settingsSource, /hasAuthenticatedAccountSession\(isLoggedIn, accountDetails\)/);
  assert.match(accountsSource, /hasAuthenticatedAccountSession\(isLoggedIn, accountDetails\)/);

  const settingsBadgeStart = settingsSource.indexOf('{isAccountConnected ? (');
  const settingsBadgeEnd = settingsSource.indexOf('<Text style={[styles.accName', settingsBadgeStart);
  const settingsBadgeBlock = settingsSource.slice(settingsBadgeStart, settingsBadgeEnd);

  assert.notEqual(settingsBadgeStart, -1);
  assert.match(settingsBadgeBlock, /styles\.connectedPill/);
  assert.match(settingsBadgeBlock, /styles\.greenDot/);
  assert.match(settingsBadgeBlock, /t\('Connected'\)/);
  assert.match(settingsBadgeBlock, /\) : null\}/);

  const accountsBadgeStart = accountsSource.indexOf('{hasConnectedAccount ? (');
  const accountsBadgeEnd = accountsSource.indexOf('</View>', accountsBadgeStart);
  const accountsBadgeBlock = accountsSource.slice(accountsBadgeStart, accountsBadgeEnd + '</View>'.length);

  assert.notEqual(accountsBadgeStart, -1);
  assert.match(accountsBadgeBlock, /styles\.connectedBadge/);
  assert.match(accountsBadgeBlock, /styles\.connectedDot/);
  assert.match(accountsBadgeBlock, /t\('Connected'\)/);
});
