import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('register demo form scrolls the focused lower fields above the keyboard', () => {
  const source = readSource('app/register.tsx');

  assert.match(source, /type RegisterFieldKey =/);
  assert.match(source, /const REGISTER_FIELD_SCROLL_OFFSET_Y = Platform\.OS === 'android' \? 232 : 176/);
  assert.match(source, /const REGISTER_FIELD_FOCUS_DELAY_MS = Platform\.OS === 'android' \? 260 : 80/);
  assert.match(source, /const REGISTER_KEYBOARD_BOTTOM_PADDING = Platform\.OS === 'android' \? 220 : 120/);
  assert.match(source, /const scrollViewRef = React\.useRef<React\.ElementRef<typeof ScrollView> \| null>\(null\)/);
  assert.match(source, /const fieldYPositionsRef = React\.useRef<Partial<Record<RegisterFieldKey, number>>>\(\{\}\)/);
  assert.match(source, /const fieldFocusTimerRef = React\.useRef<ReturnType<typeof setTimeout> \| null>\(null\)/);
  assert.match(source, /behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/);
  assert.match(source, /ref=\{scrollViewRef\}/);
  assert.match(source, /keyboardDismissMode=\{Platform\.OS === 'ios' \? 'interactive' : 'on-drag'\}/);
  assert.match(source, /paddingBottom: REGISTER_KEYBOARD_BOTTOM_PADDING/);
  assert.match(source, /scrollViewRef\.current\?\.scrollTo\(\{\s*y: Math\.max\(0, fieldY - REGISTER_FIELD_SCROLL_OFFSET_Y\),\s*animated: true,\s*\}\)/);
  assert.match(source, /fieldFocusTimerRef\.current = setTimeout\(\(\) => \{\s*scrollFieldAboveKeyboard\(field\);\s*\}, REGISTER_FIELD_FOCUS_DELAY_MS\)/);

  for (const field of [
    'phone',
    'country',
    'password',
    'investorPassword',
    'initialBalance',
    'originBroker',
  ]) {
    assert.match(
      source,
      new RegExp(
        `<View style=\\{styles\\.inputRow\\} onLayout=\\{handleFieldLayout\\('${field}'\\)\\}>[\\s\\S]*onFocus=\\{\\(\\) => handleFieldFocus\\('${field}'\\)\\}`,
      ),
    );
  }
});
