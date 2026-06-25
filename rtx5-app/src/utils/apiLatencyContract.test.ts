import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const walkSourceFiles = (root: string): string[] => {
  const absoluteRoot = resolve(process.cwd(), root);
  const entries = readdirSync(absoluteRoot);
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = resolve(absoluteRoot, entry);
    const relativePath = `${root}/${entry}`;
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      files.push(...walkSourceFiles(relativePath));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      files.push(relativePath);
    }
  }

  return files;
};

test('REST API calls are routed through the backend latency recorder', () => {
  const files = [
    ...walkSourceFiles('src/api'),
    ...walkSourceFiles('src/domain/candles/api'),
  ];
  const rawFetchPattern = /(^|[^\w.])fetch\s*\(/;

  for (const file of files) {
    const source = stripComments(readSource(file));
    assert.doesNotMatch(
      source,
      rawFetchPattern,
      `${file} must use timedFetch/apiClient so backend response times are recorded`,
    );
  }
});

test('trade and registration paths record backend response latency', () => {
  const orderSource = readSource('src/api/orders/placeMarketOrder.ts');
  const authSource = readSource('src/api/auth.ts');
  const publicDemoSource = readSource('src/api/publicDemo.ts');
  const mt5AccountSource = readSource('src/api/mt5Account.ts');
  const apiClientSource = readSource('src/api/apiClient.ts');
  const apiLatencySource = readSource('src/utils/apiLatency.ts');
  const candlesSource = readSource('src/domain/candles/api/candles.ts');
  const brokerSource = readSource('src/api/broker.ts');
  const healthSource = readSource('src/api/health.ts');

  assert.match(apiClientSource, /import \{ timedFetch \} from '..\/utils\/apiLatency'/);
  assert.match(apiClientSource, /label: `apiClient\.\$\{method\}`/);
  assert.match(apiClientSource, /label: 'apiClient\.refresh'/);
  assert.match(apiLatencySource, /export const API_FETCH_TIMEOUT_MS = Math\.max/);
  assert.match(apiLatencySource, /Number\(process\.env\.EXPO_PUBLIC_API_FETCH_TIMEOUT_MS\) \|\| 7000/);
  assert.match(apiLatencySource, /const controller = new AbortController\(\)/);
  assert.match(apiLatencySource, /signal: controller\.signal/);
  assert.match(apiLatencySource, /Promise\.race\(\[fetchPromise, timedRequest\.timeoutPromise\]\)/);
  assert.match(apiLatencySource, /Request timed out after \$\{timeoutMs\}ms/);
  assert.match(authSource, /label: 'auth\.login'/);
  assert.match(authSource, /label: 'auth\.register'/);
  assert.match(publicDemoSource, /label: 'publicDemo\.status'/);
  assert.match(publicDemoSource, /label: 'publicDemo\.groups'/);
  assert.match(publicDemoSource, /label: 'publicDemo\.createAccount'/);
  assert.match(mt5AccountSource, /label: 'mt5Account\.create'/);
  assert.match(candlesSource, /label: 'candles\.publicHistory'/);
  assert.match(brokerSource, /const BROKER_SERVERS_TIMEOUT_MS = 3500/);
  assert.match(brokerSource, /const BROKER_HEALTH_TIMEOUT_MS = 3000/);
  assert.match(brokerSource, /const controller = new AbortController\(\)/);
  assert.match(brokerSource, /timedFetch\(`\$\{PUBLIC_BROKER_DIRECTORY_BASE_URL\}\/broker\/servers`/);
  assert.match(brokerSource, /label: 'broker\.servers'/);
  assert.match(brokerSource, /label: 'broker\.health'/);
  assert.match(brokerSource, /Broker list request timed out\. Please check your connection and try again\./);
  assert.match(brokerSource, /clearTimeout\(timeout\)/);
  assert.match(healthSource, /buildBrokerHealthUrl\(brokerServerUrl\)/);
  assert.match(healthSource, /label: 'health\.broker'/);
  assert.match(orderSource, /recordApiLatency\(\{/);
  assert.match(orderSource, /label: `trade\.placeMarketOrder\.\$\{requestedSide\}`/);
  assert.match(orderSource, /endpoint: '\/orders'/);
  assert.match(orderSource, /source: 'trade'/);
});

test('expired broker sessions fail fast and do not keep stale secure tokens alive', () => {
  const brokerApiSource = readSource('src/api/brokerApi.ts');
  const brokerRealtimeSource = readSource('src/api/ws/BrokerRealtimeService.ts');

  assert.match(brokerApiSource, /const AUTH_REFRESH_TIMEOUT_MS = 2500/);
  assert.match(brokerApiSource, /const AUTH_REFRESH_FAILURES_BEFORE_LOGOUT = 2/);
  assert.match(brokerApiSource, /const AUTH_REFRESH_FAILURE_WINDOW_MS = 30_000/);
  assert.match(brokerApiSource, /clearAuthSessionTokens/);
  assert.match(brokerApiSource, /private sessionInvalidated = false/);
  assert.match(brokerApiSource, /private consecutiveRefreshAuthFailures = 0/);
  assert.match(brokerApiSource, /createUnauthenticatedResponse/);
  assert.match(brokerApiSource, /return createUnauthenticatedResponse\(AUTH_SESSION_EXPIRED_MESSAGE\)/);
  assert.match(brokerApiSource, /this\.recordRefreshAuthFailure\(session\)/);
  assert.match(brokerApiSource, /this\.consecutiveRefreshAuthFailures >= AUTH_REFRESH_FAILURES_BEFORE_LOGOUT[\s\S]*await this\.invalidateAuthSession\(\)/);
  assert.match(brokerApiSource, /private resetRefreshAuthFailures\(\): void \{/);
  assert.match(brokerApiSource, /await clearAuthSessionTokens\(\)/);
  assert.match(brokerApiSource, /const liveServerUrl = normalizeBrokerServerUrl\(state\.brokerServerUrl \|\| ''\)/);
  assert.match(brokerApiSource, /if \(state\.isLoggedIn && state\.brokerId && liveServerUrl && liveAccessToken\)/);
  assert.match(brokerApiSource, /activeToken = await this\.getValidAccessTokenForSession\(session, false\)/);
  assert.match(brokerApiSource, /shouldLoadStoredAuth \? getSecureItemAsync\(ACCESS_TOKEN_KEY\) : Promise\.resolve\(null\)/);
  assert.match(brokerRealtimeSource, /AUTH_SESSION_UNAVAILABLE_PATTERN/);
  assert.match(brokerRealtimeSource, /private hasAuthenticatedSession\(\): boolean/);
  assert.match(brokerRealtimeSource, /private pauseUntilNextLogin\(\): void/);
  assert.match(brokerRealtimeSource, /this\.pauseUntilNextLogin\(\)/);
});
