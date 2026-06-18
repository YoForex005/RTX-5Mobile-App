import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = () => readFileSync(resolve(process.cwd(), 'src/query/positions.ts'), 'utf8');

test('positions query mapper preserves swap and commission separately from net pnl', () => {
  const positionsSource = source();

  assert.match(positionsSource, /pnl: dto\.profit \+ \(dto\.swap \|\| 0\) \+ \(dto\.commission \|\| 0\)/);
  assert.match(positionsSource, /swap: dto\.swap \|\| 0/);
  assert.match(positionsSource, /commission: dto\.commission \|\| 0/);
});
