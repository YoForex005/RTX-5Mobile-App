import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/settings/InterfaceScreen.tsx'),
  'utf8',
);

test('language preference tick updates before app-wide language commit', () => {
  assert.match(source, /const \[visualLanguage, setVisualLanguage\] = useState<LanguageCode>\(language\)/);
  assert.match(source, /const handleLanguagePress = useCallback\(\(nextLanguage: LanguageCode\) => \{[\s\S]*setVisualLanguage\(nextLanguage\)[\s\S]*setLanguage\(nextLanguage\)/);
  assert.match(source, /requestAnimationFrame\(\(\) => \{[\s\S]*setTimeout\(commitIfCurrent, 0\)/);
  assert.match(source, /extraData=\{visualLanguage\}/);
  assert.match(source, /const selected = item\.code === visualLanguage/);
  assert.match(source, /onPress=\{\(\) => handleLanguagePress\(item\.code\)\}[\s\S]*activateOnPressIn[\s\S]*latencyBudgetMs=\{50\}/);
});
