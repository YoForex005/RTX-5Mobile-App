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
  assert.match(modifyFunctionSource, /signal: requestOptions\.signal/);
  assert.match(modifyFunctionSource, /timeoutMs: requestOptions\.timeoutMs/);
});

test('modify position screen submits only SL and TP fields', () => {
  assert.match(screenSource, /positionsApi\.modifyPosition\([\s\S]*position\.id,[\s\S]*\{ price_sl: requestedSl, price_tp: requestedTp \}/);
  assert.doesNotMatch(screenSource, /trailing_stop: 0/);
  assert.doesNotMatch(screenSource, /trailing_step: 0/);
});

test('modify position screen paints immediately, confirms in background, and rolls back only its own version', () => {
  assert.match(screenSource, /applyLocalStopPatch\(requestedSl, requestedTp, modifiedAt\)/);
  assert.match(screenSource, /const confirmationPromise = positionsApi\.modifyPosition/);
  assert.match(screenSource, /Promise\.race\(\[confirmationPromise, timeoutPromise\]\)/);
  assert.match(screenSource, /readModifiedStopValue\(modifyResult, \['price_sl', 'sl'\], requestedSl\)/);
  assert.match(screenSource, /readModifiedStopValue\(modifyResult, \['price_tp', 'tp'\], requestedTp\)/);
  assert.match(screenSource, /SL\/TP Not Applied/);
  assert.match(screenSource, /applyLocalStopPatch\(previousSl, previousTp, previousPosition\.clientModifiedAt, modifiedAt\)/);
  assert.match(screenSource, /Alert\.alert\(feedback\.title, feedback\.message\)/);
  assert.match(screenSource, /MODIFY_CONFIRMATION_TIMEOUT_MS = 10_000/);
  assert.match(screenSource, /positionSnapshots:/);
  assert.match(screenSource, /\[positionKey\]: \{/);
  assert.match(screenSource, /if \(requestedSl > 0 \|\| requestedTp > 0\) \{[\s\S]*chartShowOnChart\.slTpLevels[\s\S]*setChartShowOnChartItem\('slTpLevels', true\)/);
  assert.match(screenSource, /const sideVisibilityKey = position\.side === 'buy' \? 'buyTrade' : 'sellTrade'/);
  assert.match(screenSource, /setChartShowOnChartItem\(sideVisibilityKey, true\)/);
  const handlerStart = screenSource.indexOf('const handleModify = () =>');
  const handlerEnd = screenSource.indexOf('// Inactive retained layers', handlerStart);
  const submitSource = screenSource.slice(handlerStart, handlerEnd);
  const hideIndex = submitSource.indexOf('handleBack();');
  const yieldIndex = submitSource.indexOf('runAfterModifyClosePaint(() =>');
  const patchIndex = submitSource.indexOf('applyLocalStopPatch(requestedSl, requestedTp, modifiedAt)');
  const requestIndex = submitSource.indexOf('const confirmationPromise = positionsApi.modifyPosition');

  assert.ok(hideIndex > -1);
  assert.ok(hideIndex < yieldIndex);
  assert.ok(yieldIndex < patchIndex);
  assert.ok(patchIndex < requestIndex);
  assert.doesNotMatch(submitSource, /\bawait\b/);
});

test('modify position submit is docked outside the scroll view and activates on touch-down', () => {
  assert.match(screenSource, /const modifySubmittingRef = useRef\(false\)/);
  assert.match(screenSource, /if \(modifySubmittingRef\.current\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(screenSource, /modifyPositionIdsInFlight\.add\(positionKey\)[\s\S]*modifySubmittingRef\.current = true/);
  assert.match(screenSource, /const releaseSubmissionLock = \(\) => \{[\s\S]*modifySubmittingRef\.current = false/);
  assert.match(screenSource, /\.finally\(\(\) => \{[\s\S]*releaseSubmissionLock\(\)/);
  const scrollCloseIndex = screenSource.lastIndexOf('</ScrollView>');
  const submitButtonIndex = screenSource.indexOf('testID="modify-position-submit"');
  assert.ok(scrollCloseIndex > -1);
  assert.ok(submitButtonIndex > scrollCloseIndex);
  assert.match(screenSource, /onPress=\{handleModify\}[\s\S]*activateOnTouchStart[\s\S]*activateOnPressIn[\s\S]*latencyLabel="modifyPosition\.submit"/);
  assert.match(
    screenSource,
    /requestAnimationFrame\(\(\) => \{[\s\S]*setTimeout\(action, 0\)/,
  );
});
