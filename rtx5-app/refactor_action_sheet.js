const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'src', 'components', 'ActionSheet.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

// 1. Add imports
if (!content.includes(`import { useTheme, ThemeColors } from '../theme/useTheme';`)) {
  content = content.replace(
    `import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';\nimport { useSafeAreaInsets } from 'react-native-safe-area-context';`,
    `import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';\nimport { useSafeAreaInsets } from 'react-native-safe-area-context';\nimport { useTheme, ThemeColors } from '../theme/useTheme';\nimport { useUserPreferences } from '../state/userPreferences';`
  );
}

// 2. Inject useTheme inside ActionSheet
content = content.replace(
  `export function ActionSheet({ visible, title, actions, onClose }: ActionSheetProps) {\n  const insets = useSafeAreaInsets();`,
  `export function ActionSheet({ visible, title, actions, onClose }: ActionSheetProps) {
  const insets = useSafeAreaInsets();
  const T = useTheme();
  const { themeMode } = useUserPreferences();
  const isDark = themeMode === 'dark';
  const styles = makeStyles(T, isDark);`
);

// 3. Remove const styles = StyleSheet.create({...});
// We will replace everything from `const styles = StyleSheet.create({` to the end of the file.
const stylesStart = content.indexOf('const styles = StyleSheet.create({');
if (stylesStart !== -1) {
  content = content.substring(0, stylesStart);
}

// 4. Append new makeStyles
const newStyles = `
const SCREEN_HEIGHT = Dimensions.get('window').height;

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 9999,
      elevation: 9999,
      backgroundColor: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.3)',
      justifyContent: 'flex-end',
    },
    sheet: {
      width: '100%',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderLeftWidth: 0,
      borderRightWidth: 0,
      borderTopWidth: 1,
      borderColor: T.border,
      backgroundColor: T.glass2,
      maxHeight: SCREEN_HEIGHT * 0.70,
    },
    handle: {
      alignSelf: 'center',
      marginTop: 8,
      marginBottom: 6,
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: T.border,
    },
    title: {
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '600',
      paddingBottom: 12,
      borderBottomWidth: 1,
      color: T.textSub,
      borderBottomColor: T.border,
    },
    actionsScroll: {
      maxHeight: SCREEN_HEIGHT * 0.55,
    },
    action: {
      minHeight: 56,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    actionDivider: {
      borderBottomWidth: 1,
      borderBottomColor: T.border,
    },
    actionDanger: {
      backgroundColor: isDark ? 'rgba(255, 75, 66, 0.05)' : 'rgba(239, 68, 68, 0.05)',
    },
    actionPressed: {
      opacity: isDark ? 0.8 : 0.6,
      backgroundColor: T.glass3,
    },
    actionText: {
      fontSize: 17,
      fontWeight: '500',
    },
    actionTextNormal: { color: T.text },
    actionTextDanger:  { color: T.trading.sell.primary },
    chevron: {
      fontSize: 21,
      lineHeight: 21,
      color: T.textSub,
    },
    cancelButton: {
      width: '100%',
      marginTop: 0,
      minHeight: 54,
      borderRadius: 0,
      borderTopWidth: 1,
      borderColor: T.border,
      backgroundColor: T.glass2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: {
      fontSize: 17,
      fontWeight: '600',
      color: T.text,
    },
  });
}
`;

// remove the extra SCREEN_HEIGHT at top since we moved it
content = content.replace(/const SCREEN_HEIGHT = Dimensions\.get\('window'\)\.height;\n/g, '');

content += newStyles;

fs.writeFileSync(targetPath, content, 'utf8');
console.log('ActionSheet fully refactored.');
