/**
 * Settings Feature UI: HelpScreen
 *
 * Professional FAQ-only help surface for RTX5 settings.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsDarkTheme } from '../../state/themeMode';
import { FastPressable } from '../../ui/components/FastPressable';
import { Screen } from '../../ui/components/Screen';
import { safeRouterBack } from '../../utils/navigation';
import { makeHelpStyles, type HelpStyles } from './HelpScreen.styles';
import {
  HELP_CATEGORY_FILTERS,
  HELP_HEADER,
  getHelpCategoryCounts,
  selectHelpFaqItems,
  type HelpFaqCategory,
  type HelpFaqItem,
} from './helpViewModel';

export function HelpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => makeHelpStyles(isDark), [isDark]);
  const [selectedCategory, setSelectedCategory] = useState<HelpFaqCategory>('All');
  const [faqQuery, setFaqQuery] = useState('');
  const [expandedFaqId, setExpandedFaqId] = useState<string>('connect-account');
  const categoryCounts = useMemo(() => getHelpCategoryCounts(), []);
  const visibleFaqItems = useMemo(
    () => selectHelpFaqItems({ category: selectedCategory, query: faqQuery }),
    [faqQuery, selectedCategory],
  );
  const normalizedQuery = faqQuery.trim();
  const backIconColor = isDark ? '#F8FAFC' : '#050505';
  const accentColor = isDark ? '#60A5FA' : '#0A6EEB';

  const handleBack = useCallback(() => {
    safeRouterBack(router, '/(tabs)/settings');
  }, [router]);

  const updateVisibleSelection = useCallback((category: HelpFaqCategory, query: string) => {
    setExpandedFaqId(selectHelpFaqItems({ category, query })[0]?.id ?? '');
  }, []);

  const handleSelectCategory = useCallback((category: HelpFaqCategory) => {
    setSelectedCategory(category);
    updateVisibleSelection(category, faqQuery);
  }, [faqQuery, updateVisibleSelection]);

  const handleChangeQuery = useCallback((query: string) => {
    setFaqQuery(query);
    updateVisibleSelection(selectedCategory, query);
  }, [selectedCategory, updateVisibleSelection]);

  const handleClearQuery = useCallback(() => {
    setFaqQuery('');
    updateVisibleSelection(selectedCategory, '');
  }, [selectedCategory, updateVisibleSelection]);

  return (
    <Screen noBottomInset style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 14 }]}>
        <FastPressable
          onPress={handleBack}
          latencyLabel="help.back"
          hitSlop={12}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={28} color={backIconColor} />
        </FastPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Help</Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryPanel}>
          <View style={styles.summaryTopRow}>
            <View style={styles.summaryIcon}>
              <Ionicons name="help-buoy-outline" size={22} color={accentColor} />
            </View>
            <View style={styles.summaryTitleWrap}>
              <Text style={styles.summaryLabel}>{HELP_HEADER.label}</Text>
              <Text style={styles.summaryTitle}>{HELP_HEADER.title}</Text>
            </View>
          </View>
          <Text style={styles.summaryBody}>{HELP_HEADER.body}</Text>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={accentColor} />
            <TextInput
              value={faqQuery}
              onChangeText={handleChangeQuery}
              placeholder="Search FAQ"
              placeholderTextColor={isDark ? 'rgba(203,213,225,0.54)' : '#98A2B3'}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {faqQuery ? (
              <FastPressable
                onPress={handleClearQuery}
                latencyLabel="help.search.clear"
                hitSlop={8}
                style={styles.searchClear}
                accessibilityRole="button"
                accessibilityLabel="Clear FAQ search"
              >
                <Ionicons name="close-circle" size={18} color={isDark ? '#94A3B8' : '#667085'} />
              </FastPressable>
            ) : null}
          </View>
        </View>

        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          canCancelContentTouches={Platform.OS === 'ios'}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRail}
        >
          {HELP_CATEGORY_FILTERS.map((category) => {
            const selected = category === selectedCategory;
            return (
              <FastPressable
                key={category}
                style={[styles.filterChip, selected && styles.filterChipActive]}
                onPress={() => handleSelectCategory(category)}
                latencyLabel={`help.filter.${category}`}
                accessibilityRole="button"
              >
                <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                  {category}
                </Text>
                <Text style={[styles.filterChipCount, selected && styles.filterChipCountActive]}>
                  {categoryCounts[category]}
                </Text>
              </FastPressable>
            );
          })}
        </ScrollView>

        <View style={styles.listHeader}>
          <View style={styles.listHeaderCopy}>
            <Text style={styles.listEyebrow}>
              {selectedCategory === 'All' ? 'FAQ Library' : `${selectedCategory} FAQ`}
            </Text>
            <Text style={styles.listTitle}>
              {normalizedQuery ? 'Search results' : 'Frequently asked questions'}
            </Text>
          </View>
          <View style={styles.resultPill}>
            <Text style={styles.resultPillText}>
              {visibleFaqItems.length}
            </Text>
          </View>
        </View>

        <View style={styles.faqList}>
          {visibleFaqItems.length > 0 ? visibleFaqItems.map((item) => (
            <FaqRow
              key={item.id}
              item={item}
              expanded={item.id === expandedFaqId}
              styles={styles}
              iconColor={accentColor}
              onToggle={() => setExpandedFaqId((current) => (current === item.id ? '' : item.id))}
            />
          )) : (
            <View style={styles.emptyPanel}>
              <View style={styles.emptyIcon}>
                <Ionicons name="search-outline" size={22} color={accentColor} />
              </View>
              <Text style={styles.emptyTitle}>No FAQ found</Text>
              <Text style={styles.emptyBody}>Change the keyword or topic filter.</Text>
            </View>
          )}
        </View>
      </ScrollView>

    </Screen>
  );
}

function FaqRow({
  item,
  expanded,
  styles,
  iconColor,
  onToggle,
}: {
  item: HelpFaqItem;
  expanded: boolean;
  styles: HelpStyles;
  iconColor: string;
  onToggle: () => void;
}) {
  return (
    <FastPressable
      style={[styles.faqRow, expanded && styles.faqRowExpanded]}
      onPress={onToggle}
      latencyLabel={`help.faq.${item.id}`}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
    >
      <View style={styles.faqQuestionRow}>
        <View style={styles.faqIcon}>
          <Ionicons name={item.icon} size={18} color={iconColor} />
        </View>
        <View style={styles.faqQuestionContent}>
          <Text style={styles.faqCategory}>{item.category}</Text>
          <Text style={styles.faqQuestion}>{item.question}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={iconColor} />
      </View>
      {expanded ? (
        <View style={styles.answerPanel}>
          <Text style={styles.answerText}>{item.answer}</Text>
        </View>
      ) : null}
    </FastPressable>
  );
}
