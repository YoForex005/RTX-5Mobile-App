import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const apiSource = readFileSync(resolve(process.cwd(), 'src/api/positions/index.ts'), 'utf8');
const typeSource = readFileSync(resolve(process.cwd(), 'src/api/positions/types.ts'), 'utf8');
const screenSource = readFileSync(resolve(process.cwd(), 'src/features/trade/ModifyPositionScreen.tsx'), 'utf8');
const modifyFunctionSource = apiSource.slice(apiSource.indexOf('modifyPosition: async'));
const modifyPayloadSource = typeSource.match(/export interface ModifyPositionPayload \{[\s\S]*?\n\}/)?.[0] ?? '';

test('modify position uses GTA broker SL/TP PUT contract', () => {
  assert.match(modifyFunctionSource, /apiClient\(`\/positions\/\$\{ticketId\}`,\s*\{\s*method: 'PUT'/);
  assert.doesNotMatch(modifyFunctionSource, /\/positions\/\$\{ticketId\}\/modify/);
  assert.doesNotMatch(modifyFunctionSource, /method: 'POST'/);
  assert.match(modifyPayloadSource, /price_sl: number;/);
  assert.match(modifyPayloadSource, /price_tp: number;/);
  assert.doesNotMatch(modifyPayloadSource, /trailing_stop\?:/);
  assert.doesNotMatch(modifyPayloadSource, /trailing_step\?:/);
});

test('modify position screen submits only SL and TP fields', () => {
  assert.match(screenSource, /positionsApi\.modifyPosition\(position\.id,\s*\{\s*price_sl: requestedSl,\s*price_tp: requestedTp,\s*\}\)/);
  assert.doesNotMatch(screenSource, /trailing_stop: 0/);
  assert.doesNotMatch(screenSource, /trailing_step: 0/);
});

test('modify position screen applies confirmed backend SL and TP response to visible state', () => {
  assert.match(screenSource, /const modifyResult = await positionsApi\.modifyPosition/);
  assert.match(screenSource, /readModifiedStopValue\(modifyResult, \['price_sl', 'sl'\], requestedSl\)/);
  assert.match(screenSource, /readModifiedStopValue\(modifyResult, \['price_tp', 'tp'\], requestedTp\)/);
  assert.match(screenSource, /SL\/TP Not Applied/);
  assert.match(screenSource, /positionSnapshots:/);
  assert.match(screenSource, /\[positionKey\]: \{/);
});

test('modify position submit button activates on press-in with a double-submit guard', () => {
  assert.match(screenSource, /const modifySubmittingRef = useRef\(false\)/);
  assert.match(screenSource, /if \(modifySubmittingRef\.current\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(screenSource, /modifySubmittingRef\.current = true[\s\S]*setIsSubmitting\(true\)/);
  assert.match(screenSource, /finally \{[\s\S]*modifySubmittingRef\.current = false[\s\S]*setIsSubmitting\(false\)/);
  assert.match(screenSource, /onPress=\{handleModify\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="modifyPosition\.submit"/);
});
