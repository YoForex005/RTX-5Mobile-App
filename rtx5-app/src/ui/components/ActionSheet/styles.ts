import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/useTheme';

export function makeActionSheetStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      width: '100%',
      zIndex: 9999,
      elevation: 9999,
      backgroundColor: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.3)',
      justifyContent: 'flex-end',
    },
    backdrop: {
      zIndex: 0,
      elevation: 0,
    },
    sheetHost: {
      flex: 1,
      width: '100%',
      justifyContent: 'flex-end',
      position: 'relative',
      zIndex: 1,
      elevation: 1,
    },
    sheetContainer: {
      width: '100%',
      justifyContent: 'flex-end',
    },
    sheet: {
      width: '100%',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderTopWidth: 1,
      borderColor: T.border,
      backgroundColor: isDark ? '#0E141F' : T.glass2,
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
    titleContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: T.border,
      marginBottom: 12,
    },
    titlePrefix: {
      fontSize: 12,
      fontWeight: '600',
      color: T.textSub,
      textAlign: 'center',
    },
    titleSuffix: {
      fontSize: 12,
      fontWeight: '600',
      color: T.textSub,
      textAlign: 'center',
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      marginHorizontal: 16,
      marginBottom: 12,
      paddingHorizontal: 12,
      height: 40,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: T.border,
    },
    searchInput: {
      flex: 1,
      color: T.text,
      fontSize: 15,
      height: '100%',
    },
    actionsScroll: {
      flexGrow: 0,
    },
    actionsContent: {
      paddingBottom: 0,
    },
    actionsContentLarge: {
      flexGrow: 1,
    },
    action: {
      minHeight: 56,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    actionWithSubtitle: {
      minHeight: 68,
      paddingVertical: 9,
    },
    actionLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
    },
    actionTextBlock: {
      flex: 1,
      minWidth: 0,
    },
    iconWrap: {
      width: 24,
      marginRight: 12,
      alignItems: 'center',
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
    actionSubtitle: {
      marginTop: 2,
      fontSize: 12,
      fontWeight: '500',
      color: T.textMuted,
    },
    actionTextNormal: {
      color: T.text,
    },
    actionTextDanger: {
      color: T.trading.sell.primary,
    },
    chevron: {
      fontSize: 21,
      lineHeight: 21,
      color: T.textSub,
    },
    actionDisabled: {
      opacity: 0.4,
    },
    actionTextDisabled: {
      color: T.textMuted,
    },
    cancelButton: {
      width: '100%',
      minHeight: 54,
      borderTopWidth: 1,
      borderColor: T.border,
      backgroundColor: isDark ? '#0E141F' : T.glass2,
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
