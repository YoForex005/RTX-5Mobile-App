import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('root layout is protected by the app error boundary', () => {
  const source = readSource('app/_layout.tsx');

  assert.match(source, /import \{ ErrorBoundary \} from '\.\.\/src\/ui\/components\/ErrorBoundary'/);
  assert.match(source, /<ErrorBoundary>[\s\S]*<InnerLayout \/>[\s\S]*<\/ErrorBoundary>/);
});

test('error boundary reload remounts the crashed subtree through the fast press path', () => {
  const source = readSource('src/ui/components/ErrorBoundary.tsx');

  assert.match(source, /resetKey: number/);
  assert.match(source, /resetKey: 0/);
  assert.match(source, /getDerivedStateFromError\(error: Error\): Partial<State>/);
  assert.match(source, /this\.setState\(\(state\) => \(\{[\s\S]*resetKey: state\.resetKey \+ 1/);
  assert.match(source, /<React\.Fragment key=\{this\.state\.resetKey\}>/);
  assert.match(source, /latencyLabel="errorBoundary\.restart"/);
  assert.match(source, /accessibilityRole="button"/);
});
