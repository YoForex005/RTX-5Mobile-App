/**
 * Settings Feature UI: UserGuideScreen
 *
 * Presents operating workflows with searchable guidance, safety posture,
 * and device-local persistence reminders.
 */

import { Ionicons } from '@expo/vector-icons';
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
import { makeUserGuideStyles, type UserGuideStyles } from './UserGuideScreen.styles';
import {
  GUIDE_CHECKLIST,
  GUIDE_FILTERS,
  GUIDE_WORKFLOWS,
  buildGuideSummary,
  filterGuideWorkflows,
  type GuideFilter,
  type GuideWorkflow,
  type GuideWorkflowPriority,
  type GuideWorkflowStatus,
} from './userGuideViewModel';

export function UserGuideScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeUserGuideStyles(T, isDark), [T, isDark]);
  const [selectedFilter, setSelectedFilter] = useState<GuideFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const summary = useMemo(() => buildGuideSummary(GUIDE_WORKFLOWS), []);
  const visibleWorkflows = useMemo(
    () => filterGuideWorkflows(GUIDE_WORKFLOWS, selectedFilter, searchQuery),
    [selectedFilter, searchQuery],
  );
  const leadWorkflow = visibleWorkflows[0] ?? null;
  const workflowRows = leadWorkflow ? visibleWorkflows.slice(1) : [];

  return (
    <Screen>
      <SettingsBackBar title="User Guide" />
      <SettingsEnterpriseHeader
        T={T}
        isDark={isDark}
        styles={styles}
        title="User Guide"
        eyebrow="Operating Manual"
        subtitle="Workflows / Safety / Quick reference"
        icon="book-outline"
        accent={T.up}
        status={{ label: 'Curated', color: T.up, icon: 'checkmark-circle-outline' }}
        search={{
          value: searchQuery,
          onChangeText: setSearchQuery,
          placeholder: 'Search workflow, safety, charting',
        }}
        metrics={[
          { label: 'Flows', value: summary.workflowCount },
          { label: 'Protected', value: summary.protectedCount, accent: SETTINGS_WARNING },
          { label: 'Steps', value: summary.stepCount },
          { label: 'Storage', value: summary.localStateLabel },
        ]}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <EnterpriseFilterRail
          filters={GUIDE_FILTERS}
          selectedFilter={selectedFilter}
          onSelect={setSelectedFilter}
          styles={styles}
        />

        <EnterpriseCoverageStrip
          value={summary.protectedCount}
          label="Protected"
          title="Guide coverage"
          text="Core workflows are organized by trading surface, chart operations, account context, and release safety."
          styles={styles}
        />

        {leadWorkflow ? (
          <LeadGuideBrief workflow={leadWorkflow} T={T} styles={styles} />
        ) : (
          <EnterpriseEmptyState
            T={T}
            styles={styles}
            title="No guide workflows match this view"
            subtitle="Adjust the filter or search query to widen the guide library."
          />
        )}

        {workflowRows.length > 0 && (
          <EnterpriseSectionHeader
            title="Workflow library"
            subtitle="Short operational paths with safety context"
            count={workflowRows.length}
            styles={styles}
          />
        )}

        {workflowRows.map((workflow) => (
          <GuideWorkflowRow key={workflow.id} workflow={workflow} T={T} styles={styles} />
        ))}

        <EnterpriseSectionHeader
          title="Before trading"
          subtitle="Checks that keep account context and preferences intact"
          count={GUIDE_CHECKLIST.length}
          styles={styles}
        />

        <EnterpriseGuardrailList items={GUIDE_CHECKLIST} T={T} styles={styles} accent={T.up} />

        <EnterpriseTrustFooter
          T={T}
          styles={styles}
          icon="information-circle-outline"
          title="Educational reference"
          text="Workflows describe expected app behavior. They do not constitute trading advice or recommendations."
          color={T.up}
        />
      </ScrollView>
    </Screen>
  );
}

function LeadGuideBrief({
  workflow,
  T,
  styles,
}: {
  workflow: GuideWorkflow;
  T: ThemeColors;
  styles: UserGuideStyles;
}) {
  const priorityColor = getPriorityColor(workflow.priority, T);

  return (
    <View style={styles.leadCard}>
      <View style={styles.leadTopRow}>
        <View style={[styles.pill, { backgroundColor: getPriorityTint(workflow.priority, T) }]}>
          <View style={[styles.pillDot, { backgroundColor: priorityColor }]} />
          <Text style={[styles.pillText, { color: priorityColor }]}>{workflow.priority}</Text>
        </View>
        <Text style={styles.metaText} numberOfLines={1}>{workflow.duration} / {workflow.status}</Text>
      </View>

      <Text style={styles.leadHeadline} numberOfLines={3}>{workflow.title}</Text>
      <Text style={styles.leadSummary} numberOfLines={2}>{workflow.summary}</Text>

      <View style={styles.stepList}>
        {workflow.steps.map((step, index) => (
          <Step key={step} step={step} index={index} styles={styles} />
        ))}
      </View>
    </View>
  );
}

function GuideWorkflowRow({
  workflow,
  T,
  styles,
}: {
  workflow: GuideWorkflow;
  T: ThemeColors;
  styles: UserGuideStyles;
}) {
  const priorityColor = getPriorityColor(workflow.priority, T);

  return (
    <View style={styles.row}>
      <View style={[styles.severityRail, { backgroundColor: priorityColor }]} />
      <View style={styles.rowIcon}>
        <Ionicons name={workflow.icon} size={17} color={getStatusColor(workflow.status, T)} />
      </View>

      <View style={styles.rowBody}>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{workflow.audience}</Text>
          <EnterpriseMetaSeparator styles={styles} />
          <Text style={styles.categoryLabel}>{workflow.category}</Text>
          <EnterpriseMetaSeparator styles={styles} />
          <Text style={[styles.metaText, { color: getStatusColor(workflow.status, T) }]}>{workflow.status}</Text>
        </View>

        <Text style={styles.rowTitle} numberOfLines={2}>{workflow.title}</Text>
        <Text style={styles.rowSummary} numberOfLines={2}>{workflow.summary}</Text>

        <View style={styles.rowFooter}>
          <View style={[styles.compactPill, { backgroundColor: getPriorityTint(workflow.priority, T) }]}>
            <Text style={[styles.compactPillText, { color: priorityColor }]}>{workflow.priority}</Text>
          </View>
          <EnterpriseTagRail labels={[workflow.duration, `${workflow.steps.length} steps`]} styles={styles} />
        </View>
      </View>

      <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
    </View>
  );
}

function Step({ step, index, styles }: { step: string; index: number; styles: UserGuideStyles }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBullet}>
        <Text style={styles.stepBulletText}>{index + 1}</Text>
      </View>
      <Text style={styles.stepText}>{step}</Text>
    </View>
  );
}

function getPriorityColor(priority: GuideWorkflowPriority, T: ThemeColors): string {
  switch (priority) {
    case 'Safety':
      return SETTINGS_WARNING;
    case 'Reference':
      return T.accent;
    case 'Core':
    default:
      return T.up;
  }
}

function getPriorityTint(priority: GuideWorkflowPriority, T: ThemeColors): string {
  switch (priority) {
    case 'Safety':
      return 'rgba(245,158,11,0.14)';
    case 'Reference':
      return T.accentGlow;
    case 'Core':
    default:
      return T.upGlow;
  }
}

function getStatusColor(status: GuideWorkflowStatus, T: ThemeColors): string {
  switch (status) {
    case 'Protected':
      return SETTINGS_WARNING;
    case 'Review':
      return T.accent;
    case 'Ready':
    default:
      return T.up;
  }
}
