import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('broker detail existing-account form scrolls above the keyboard on android and ios', () => {
  const source = readSource('src/features/settings/BrokerDetailScreen.tsx');

  assert.match(source, /const scrollRef = useRef<ScrollView>\(null\)/);
  assert.match(source, /const passwordInputRef = useRef<TextInput>\(null\)/);
  assert.match(source, /const loginPanelYRef = useRef\(0\)/);
  assert.match(source, /const loginInputFocusedRef = useRef\(false\)/);
  assert.match(source, /scrollRef\.current\?\.scrollTo\(\{\s*y: Math\.max\(loginPanelYRef\.current - 12, 0\),\s*animated: true,/);
  assert.match(source, /Keyboard\.addListener\(\s*Platform\.OS === 'ios' \? 'keyboardWillShow' : 'keyboardDidShow'/);
  assert.match(source, /behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/);
  assert.match(source, /keyboardDismissMode=\{Platform\.OS === 'ios' \? 'interactive' : 'on-drag'\}/);
  assert.match(source, /automaticallyAdjustKeyboardInsets=\{Platform\.OS === 'ios'\}/);
  assert.match(source, /ref=\{scrollRef\}/);
  assert.match(source, /onLayout=\{\(event\) => \{\s*loginPanelYRef\.current = event\.nativeEvent\.layout\.y;/);
  assert.match(source, /onFocus=\{handleLoginInputFocus\}/);
  assert.match(source, /onBlur=\{handleLoginInputBlur\}/);
  assert.match(source, /onSubmitEditing=\{\(\) => passwordInputRef\.current\?\.focus\(\)\}/);
  assert.match(source, /ref=\{passwordInputRef\}/);
  assert.match(source, /onSubmitEditing=\{submitLogin\}/);
});
