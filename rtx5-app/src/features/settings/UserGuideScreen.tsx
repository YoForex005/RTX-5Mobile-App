/**
 * Settings Feature UI: UserGuideScreen
 *
 * About-screen user guide destination for the RTX5 mobile app.
 */

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useCallback, useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIState } from '../../state/uiState';
import { Screen } from '../../ui/components/Screen';
import { FastPressable } from '../../ui/components/FastPressable';
import { AppLogo } from '../../ui/components/AppLogo';
import { SidebarDrawer } from '../../ui/components/SidebarDrawer';
import { makeUserGuideStyles, type UserGuideStyles } from './UserGuideScreen.styles';
import {
  GUIDE_FOOTER_NOTE,
  GUIDE_MANUAL_INTRO,
  GUIDE_MANUAL_SECTIONS,
  buildGuideSummary,
  type GuideManualSection,
} from './userGuideViewModel';

export function UserGuideScreen() {
  const insets = useSafeAreaInsets();
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const styles = useMemo(() => makeUserGuideStyles(), []);
  const summary = useMemo(() => buildGuideSummary(), []);
  const appName = Constants.expoConfig?.name ?? 'RTX5';
  const handleOpenMenu = useCallback(() => {
    hideActionSheet();
    setSidebarOpen(true);
  }, [hideActionSheet, setSidebarOpen]);

  return (
    <Screen noBottomInset style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 14 }]}>
        <FastPressable
          onPress={handleOpenMenu}
          latencyLabel="userGuide.menu"
          hitSlop={12}
          style={styles.menuButton}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <Ionicons name="menu" size={32} color="#050505" />
        </FastPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>User Guide</Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <AppLogo style={styles.logo} />
          <AppNameTitle appName={appName} styles={styles} />
          <Text style={styles.heroSubtitle}>{GUIDE_MANUAL_INTRO.subtitle}</Text>
          <Text style={styles.introText}>{GUIDE_MANUAL_INTRO.body}</Text>

          <View style={styles.summaryRow}>
            <SummaryCard value={summary.sectionCount} label="Sections" styles={styles} />
            <SummaryCard value={summary.bulletCount} label="Guide points" styles={styles} />
            <SummaryCard value={summary.localStateLabel} label="Preferences" styles={styles} />
          </View>
        </View>

        <View style={styles.guideList}>
          {GUIDE_MANUAL_SECTIONS.map((section, index) => (
            <GuideSectionRow
              key={section.id}
              section={section}
              isLast={index === GUIDE_MANUAL_SECTIONS.length - 1}
              styles={styles}
            />
          ))}
        </View>

        <Text style={styles.footerNote}>{GUIDE_FOOTER_NOTE}</Text>
      </ScrollView>

      <SidebarDrawer />
    </Screen>
  );
}

function AppNameTitle({ appName, styles }: { appName: string; styles: UserGuideStyles }) {
  const accentMatch = appName.match(/^(.*?)(5)$/);

  if (!accentMatch) {
    return <Text style={styles.heroTitle}>{appName}</Text>;
  }

  return (
    <Text style={styles.heroTitle}>
      {accentMatch[1]}
      <Text style={styles.heroAccent}>{accentMatch[2]}</Text>
      {' Mobile App'}
    </Text>
  );
}

function SummaryCard({
  value,
  label,
  styles,
}: {
  value: number | string;
  label: string;
  styles: UserGuideStyles;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.summaryLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function GuideSectionRow({
  section,
  isLast,
  styles,
}: {
  section: GuideManualSection;
  isLast: boolean;
  styles: UserGuideStyles;
}) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.indexRail}>
        <View style={styles.indexCircle}>
          <Text style={styles.indexText}>{section.index}</Text>
        </View>
        {!isLast ? <View style={styles.railLine} /> : null}
      </View>

      <View style={styles.sectionContent}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}>
            <Ionicons name={section.icon} size={18} color="#0A6EEB" />
          </View>
          <Text style={styles.sectionTitle} numberOfLines={2}>{section.title}</Text>
        </View>
        <Text style={styles.sectionSummary}>{section.summary}</Text>
        {section.bullets.map((bullet) => (
          <View key={bullet} style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>{bullet}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
