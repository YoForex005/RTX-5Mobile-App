const fs = require('fs');
const path = require('path');

function refactorFile(filePath) {
  let code = fs.readFileSync(filePath, 'utf8');

  // 1. Replacements for imports
  code = code.replace(
    /import \{ G \} from '\.\.\/\.\.\/theme\/glass';/,
    `import { useTheme } from '../../theme/useTheme';\nimport { ThemeColors } from '../../theme/glass';`
  );

  // 2. Remove old constants
  code = code.replace(
    /const APP_BG = G\.bg;[\s\S]*?const PILL_BG = G\.glass1;/,
    ''
  );

  // 3. Inject hooks and new constants inside ChartScreen
  code = code.replace(
    /export function ChartScreen\(\) \{/,
    `export function ChartScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const APP_BG = T.bg;
  const CARD_BG = isDark ? '#0B0F19' : T.glass2; 
  const BLUE = T.trading.buy.primary;
  const RED = T.trading.sell.primary;
  const GRID = T.borderSubtle;
  const TEXT = T.text;
  const TEXT_MUTED = T.textMuted;
  const BTN_BG = T.glass2;
  const PILL_BG = T.glass1;`
  );

  // 4. Change const styles = StyleSheet.create({ to function makeStyles(T: ThemeColors, isDark: boolean) { return StyleSheet.create({
  code = code.replace(
    /const styles = StyleSheet\.create\(\{/,
    `function makeStyles(T: ThemeColors, isDark: boolean) {
  const APP_BG = T.bg;
  const CARD_BG = isDark ? '#0B0F19' : T.glass2;
  const BLUE = T.trading.buy.primary;
  const RED = T.trading.sell.primary;
  const GRID = T.borderSubtle;
  const TEXT = T.text;
  const TEXT_MUTED = T.textMuted;
  const BTN_BG = T.glass2;
  const PILL_BG = T.glass1;

  return StyleSheet.create({`
  );

  // Close the function at the very end
  code = code.replace(/}\);\s*$/, '  });\n}\n');

  // Also replace usages of G. in the styles
  code = code.replace(/G\.bg/g, 'T.bg');
  code = code.replace(/G\.border/g, 'T.border');
  code = code.replace(/G\.textMuted/g, 'T.textMuted');
  code = code.replace(/G\.textSub/g, 'T.textSub');
  code = code.replace(/G\.text/g, 'T.text');
  code = code.replace(/G\.glass1/g, 'T.glass1');
  code = code.replace(/G\.glass2/g, 'T.glass2');
  code = code.replace(/G\.glass3/g, 'T.glass3');
  code = code.replace(/G\.up/g, 'T.up');

  fs.writeFileSync(filePath, code, 'utf8');
  console.log('Refactored', filePath);
}

refactorFile(path.join(__dirname, 'src/features/chart/ChartScreen.native.tsx'));
refactorFile(path.join(__dirname, 'src/features/chart/ChartScreen.web.tsx'));
