import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('broker rows render a plain chevron without a circular shell', () => {
  const source = readSource('src/features/settings/BrokersScreen/BrokersScreen.tsx');
  const rowStart = source.indexOf('renderItem={({ item }) => (');
  const rowEnd = source.indexOf('ListEmptyComponent=', rowStart);
  const rowSource = source.slice(rowStart, rowEnd);
  const selectBtnStart = source.indexOf('selectBtn: {');
  const selectBtnEnd = source.indexOf('emptyState:', selectBtnStart);
  const selectBtnStyle = source.slice(selectBtnStart, selectBtnEnd);

  assert.notEqual(rowStart, -1);
  assert.notEqual(rowEnd, -1);
  assert.match(rowSource, /style=\{styles\.selectBtn\}[\s\S]*pointerEvents="none"[\s\S]*<Ionicons name="chevron-forward"/);
  assert.notEqual(selectBtnStart, -1);
  assert.notEqual(selectBtnEnd, -1);
  assert.match(selectBtnStyle, /width: 36/);
  assert.match(selectBtnStyle, /height: 36/);
  assert.match(selectBtnStyle, /alignItems: 'center'/);
  assert.match(selectBtnStyle, /justifyContent: 'center'/);
  assert.doesNotMatch(selectBtnStyle, /borderRadius|borderWidth|borderColor|backgroundColor/);
});
