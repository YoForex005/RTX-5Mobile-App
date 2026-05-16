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
  const candlesSource = readSource('src/domain/candles/api/candles.ts');

  assert.match(apiClientSource, /import \{ timedFetch \} from '..\/utils\/apiLatency'/);
  assert.match(apiClientSource, /label: `apiClient\.\$\{method\}`/);
  assert.match(apiClientSource, /label: 'apiClient\.refresh'/);
  assert.match(authSource, /label: 'auth\.login'/);
  assert.match(authSource, /label: 'auth\.register'/);
  assert.match(publicDemoSource, /label: 'publicDemo\.status'/);
  assert.match(publicDemoSource, /label: 'publicDemo\.groups'/);
  assert.match(publicDemoSource, /label: 'publicDemo\.createAccount'/);
  assert.match(mt5AccountSource, /label: 'mt5Account\.create'/);
  assert.match(candlesSource, /label: 'candles\.publicHistory'/);
  assert.match(orderSource, /recordApiLatency\(\{/);
  assert.match(orderSource, /label: `trade\.placeMarketOrder\.\$\{requestedSide\}`/);
  assert.match(orderSource, /endpoint: '\/orders'/);
  assert.match(orderSource, /source: 'trade'/);
});
