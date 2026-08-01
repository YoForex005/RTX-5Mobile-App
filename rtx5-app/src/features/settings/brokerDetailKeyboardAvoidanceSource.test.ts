import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('broker detail existing-account form scrolls above the keyboard on android and ios', () => {
  const source = readSource('src/features/settings/BrokerDetailScreen.tsx');
  const appConfig = JSON.parse(readSource('app.json'));

  assert.match(source, /const scrollRef = useRef<ScrollView>\(null\)/);
  assert.match(source, /const passwordInputRef = useRef<TextInput>\(null\)/);
  assert.match(source, /const loginInputFocusedRef = useRef\(false\)/);
  assert.match(source, /scrollRef\.current\?\.scrollToEnd\(\{ animated: true \}\)/);
  assert.doesNotMatch(source, /loginPanelYRef|loginPanelYRef\.current/);
  assert.match(source, /Keyboard\.addListener\(\s*'keyboardDidShow'/);
  assert.match(source, /behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/);
  assert.match(source, /keyboardDismissMode=\{Platform\.OS === 'ios' \? 'interactive' : 'on-drag'\}/);
  assert.match(source, /automaticallyAdjustKeyboardInsets=\{Platform\.OS === 'ios'\}/);
  assert.match(source, /ref=\{scrollRef\}[\s\S]*style=\{styles\.scrollViewport\}[\s\S]*onLayout=\{handleLoginScrollLayout\}/);
  assert.match(source, /scrollViewport: \{ flex: 1 \}/);
  assert.match(source, /scrollContent: \{[\s\S]*flexGrow: 1,[\s\S]*paddingBottom: 48/);
  assert.match(source, /onFocus=\{handleLoginInputFocus\}/);
  assert.match(source, /onBlur=\{handleLoginInputBlur\}/);
  assert.match(source, /onSubmitEditing=\{\(\) => passwordInputRef\.current\?\.focus\(\)\}/);
  assert.match(source, /ref=\{passwordInputRef\}/);
  assert.match(source, /onSubmitEditing=\{submitLogin\}/);
  assert.equal(appConfig.expo.android.softwareKeyboardLayoutMode, 'resize');
});
