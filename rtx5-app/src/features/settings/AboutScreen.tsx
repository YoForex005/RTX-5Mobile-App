/**
 * Settings Feature UI: AboutScreen
 *
 * Presents RTX5 platform posture, release model, and non-negotiable
 * product boundaries in a professional operating-summary layout.
 */

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Screen } from '../../ui/components/Screen';
import type { ThemeColors } from '../../ui/theme/glass';
import { useTheme } from '../../ui/theme/useTheme';
import { useUserPreferences } from '../../state/userPreferences';
import {
  EnterpriseCoverageStrip,
  EnterpriseEmptyState,
  EnterpriseFilterRail,
  EnterpriseGuardrailList,
  EnterpriseMetaSeparator,
  EnterpriseSectionHeader,
  EnterpriseTagRail,
  EnterpriseTrustFooter,
  SettingsEnterpriseHeader,
} from './SettingsEnterpriseComponents';
import { SETTINGS_WARNING } from './SettingsEnterpriseScreen.styles';
import { SettingsBackBar } from './SettingsBackBar';
import { makeAboutStyles, type AboutStyles } from './AboutScreen.styles';
import {
  ABOUT_CAPABILITIES,
  ABOUT_FILTERS,
  RELEASE_GUARDRAILS,
  buildAboutMetrics,
  buildAboutSummary,
  filterAboutCapabilities,
  type AboutCapability,
  type AboutCapabilityStatus,
  type AboutFilter,
} from './aboutViewModel';

export function AboutScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeAboutStyles(T, isDark), [T, isDark]);
  const appVersion = Constants.expoConfig?.version ?? 'Local';
  const metrics = useMemo(() => buildAboutMetrics(appVersion), [appVersion]);
  const summary = useMemo(() => buildAboutSummary(ABOUT_CAPABILITIES), []);
  const [selectedFilter, setSelectedFilter] = useState<AboutFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const visibleCapabilities = useMemo(
    () => filterAboutCapabilities(ABOUT_CAPABILITIES, selectedFilter, searchQuery),
    [selectedFilter, searchQuery],
  );
  const leadCapability = visibleCapabilities[0] ?? null;
  const capabilityRows = leadCapability ? visibleCapabilities.slice(1) : [];

  return (
    <Screen>
      <SettingsBackBar title="About" />
      <SettingsEnterpriseHeader
        T={T}
        isDark={isDark}
        styles={styles}
        title="About RTX5"
        eyebrow="Platform Dossier"
        subtitle={`Build ${appVersion} / Frontend terminal / EAS gated`}
        icon="layers-outline"
        accent={T.accent}
        status={{ label: 'Active', color: T.up, icon: 'checkmark-circle-outline' }}
        search={{
          value: searchQuery,
          onChangeText: setSearchQuery,
          placeholder: 'Search platform, release, privacy',
        }}
        metrics={metrics.map((metric) => ({ label: metric.label, value: metric.value }))}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <EnterpriseFilterRail
          filters={ABOUT_FILTERS}
          selectedFilter={selectedFilter}
          onSelect={setSelectedFilter}
          styles={styles}
        />

        <EnterpriseCoverageStrip
          value={summary.releaseLabel}
          label="Release"
          title="Product posture"
          text="RTX5 remains a frontend-only mobile trading terminal with guarded release channels and device-local personalization."
          styles={styles}
        />

        {leadCapability ? (
          <LeadAboutBrief capability={leadCapability} T={T} styles={styles} />
        ) : (
          <EnterpriseEmptyState
            T={T}
            styles={styles}
            title="No platform details match this view"
            subtitle="Adjust the filter or search query to widen the dossier."
          />
        )}

        {capabilityRows.length > 0 && (
          <EnterpriseSectionHeader
            title="Capability register"
            subtitle="Platform, trading, personalization, and release boundaries"
            count={capabilityRows.length}
            styles={styles}
          />
        )}

        {capabilityRows.map((capability) => (
          <AboutCapabilityRow key={capability.id} capability={capability} T={T} styles={styles} />
        ))}

        <EnterpriseSectionHeader
          title="Release guardrails"
          subtitle="Constraints that keep the mobile app aligned with RTX5 policy"
          count={RELEASE_GUARDRAILS.length}
          styles={styles}
        />

        <EnterpriseGuardrailList items={RELEASE_GUARDRAILS} T={T} styles={styles} accent={T.accent} />

        <EnterpriseTrustFooter
          T={T}
          styles={styles}
          icon="ribbon-outline"
          title={`RTX5 Mobile / Build ${appVersion}`}
          text="Released through EAS preview, staging, and production channels gated by runtime compatibility."
          color={T.up}
        />
      </ScrollView>
    </Screen>
  );
}

function LeadAboutBrief({
  capability,
  T,
  styles,
}: {
  capability: AboutCapability;
  T: ThemeColors;
  styles: AboutStyles;
}) {
  const statusColor = getStatusColor(capability.status, T);

  return (
    <View style={styles.leadCard}>
      <View style={styles.leadTopRow}>
        <View style={[styles.pill, { backgroundColor: getStatusTint(capability.status, T) }]}>
          <View style={[styles.pillDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.pillText, { color: statusColor }]}>{capability.status}</Text>
        </View>
        <Text style={styles.metaText} numberOfLines={1}>{capability.owner}</Text>
      </View>

      <Text style={styles.leadHeadline} numberOfLines={3}>{capability.title}</Text>
      <Text style={styles.leadSummary} numberOfLines={2}>{capability.summary}</Text>

      <View style={styles.leadMetaRow}>
        <EnterpriseTagRail labels={[capability.category, capability.proof]} styles={styles} />
      </View>
    </View>
  );
}

function AboutCapabilityRow({
  capability,
  T,
  styles,
}: {
  capability: AboutCapability;
  T: ThemeColors;
  styles: AboutStyles;
}) {
  const statusColor = getStatusColor(capability.status, T);

  return (
    <View style={styles.row}>
      <View style={[styles.severityRail, { backgroundColor: statusColor }]} />
      <View style={styles.rowIcon}>
        <Ionicons name={capability.icon} size={17} color={statusColor} />
      </View>

      <View style={styles.rowBody}>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{capability.owner}</Text>
          <EnterpriseMetaSeparator styles={styles} />
          <Text style={styles.categoryLabel}>{capability.category}</Text>
          <EnterpriseMetaSeparator styles={styles} />
          <Text style={[styles.metaText, { color: statusColor }]}>{capability.status}</Text>
        </View>

        <Text style={styles.rowTitle} numberOfLines={2}>{capability.title}</Text>
        <Text style={styles.rowSummary} numberOfLines={2}>{capability.summary}</Text>

        <View style={styles.rowFooter}>
          <View style={[styles.compactPill, { backgroundColor: getStatusTint(capability.status, T) }]}>
            <Text style={[styles.compactPillText, { color: statusColor }]}>{capability.status}</Text>
          </View>
          <EnterpriseTagRail labels={[capability.proof]} styles={styles} />
        </View>
      </View>

      <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
    </View>
  );
}

function getStatusColor(status: AboutCapabilityStatus, T: ThemeColors): string {
  switch (status) {
    case 'Guarded':
      return SETTINGS_WARNING;
    case 'Local':
      return T.accent;
    case 'Active':
    default:
      return T.up;
  }
}

function getStatusTint(status: AboutCapabilityStatus, T: ThemeColors): string {
  switch (status) {
    case 'Guarded':
      return 'rgba(245,158,11,0.14)';
    case 'Local':
      return T.accentGlow;
    case 'Active':
    default:
      return T.upGlow;
  }
}
