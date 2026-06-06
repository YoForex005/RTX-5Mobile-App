import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsDarkTheme } from '../../state/themeMode';
import { FastPressable } from '../../ui/components/FastPressable';
import { Screen } from '../../ui/components/Screen';
import { safeRouterBack } from '../../utils/navigation';
import { getLegalDocument, type LegalDocument } from './legalDocumentViewModel';

export type LegalDocumentKind = 'terms' | 'privacy';

export function LegalDocumentScreen({ document }: { document: LegalDocumentKind }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const legalDocument = useMemo(() => getLegalDocument(document), [document]);
  const iconColor = isDark ? '#60A5FA' : '#1D4ED8';
  const backIconColor = isDark ? '#F8FAFC' : '#050505';

  return (
    <Screen noBottomInset style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 12 }]}>
        <FastPressable
          onPress={() => safeRouterBack(router, '/settings/about')}
          latencyLabel="legal.back"
          hitSlop={12}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={28} color={backIconColor} />
        </FastPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{legalDocument.title}</Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <LegalHero document={legalDocument} iconColor={iconColor} styles={styles} />
        <View style={styles.sectionList}>
          {legalDocument.sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

function LegalHero({
  document,
  iconColor,
  styles,
}: {
  document: LegalDocument;
  iconColor: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroIcon}>
        <Ionicons name={document.icon} size={28} color={iconColor} />
      </View>
      <View style={styles.heroCopy}>
        <Text style={styles.heroTitle}>{document.title}</Text>
        <Text style={styles.heroSubtitle}>{document.subtitle}</Text>
        <Text style={styles.updatedLabel}>{document.updatedLabel}</Text>
      </View>
    </View>
  );
}

const makeStyles = (isDark: boolean) => {
  const palette = {
    bg: isDark ? '#050607' : '#F6F8FB',
    surface: isDark ? '#0B0F14' : '#FFFFFF',
    text: isDark ? '#F8FAFC' : '#101828',
    muted: isDark ? '#94A3B8' : '#667085',
    soft: isDark ? '#CBD5E1' : '#344054',
    border: isDark ? 'rgba(148,163,184,0.18)' : '#E4E7EC',
    accentSoft: isDark ? 'rgba(96,165,250,0.14)' : '#EEF4FF',
  };

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.bg,
    },
    header: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingBottom: 12,
      backgroundColor: palette.surface,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    backButton: {
      width: 40,
      height: 42,
      alignItems: 'flex-start',
      justifyContent: 'center',
      marginRight: 10,
    },
    headerTitle: {
      flex: 1,
      color: palette.text,
      fontSize: 21,
      lineHeight: 27,
      fontWeight: '700',
      letterSpacing: 0,
    },
    scroll: {
      flex: 1,
      backgroundColor: palette.bg,
    },
    content: {
      padding: 16,
      paddingBottom: 34,
    },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    heroIcon: {
      width: 52,
      height: 52,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.accentSoft,
    },
    heroCopy: {
      flex: 1,
      minWidth: 0,
    },
    heroTitle: {
      color: palette.text,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '800',
      letterSpacing: 0,
    },
    heroSubtitle: {
      color: palette.muted,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      letterSpacing: 0,
      marginTop: 3,
    },
    updatedLabel: {
      color: palette.soft,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '800',
      letterSpacing: 0,
      marginTop: 7,
      textTransform: 'uppercase',
    },
    sectionList: {
      marginTop: 14,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    section: {
      padding: 15,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    sectionTitle: {
      color: palette.text,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '800',
      letterSpacing: 0,
      marginBottom: 6,
    },
    sectionBody: {
      color: palette.soft,
      fontSize: 14,
      lineHeight: 21,
      fontWeight: '500',
      letterSpacing: 0,
    },
  });
};
