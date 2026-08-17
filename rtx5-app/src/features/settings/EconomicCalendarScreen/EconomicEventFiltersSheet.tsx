import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ImpactLevel } from '../../../dev/mock/calendarData';
import { useTranslation } from '../../../i18n/useTranslation';
import { useIsDarkTheme } from '../../../state/themeMode';
import { FastPressable } from '../../../ui/components/FastPressable';
import { useTheme } from '../../../ui/theme/useTheme';
import { IMPACT_CONFIG, IMPACT_FILTERS } from './eventHelpers';
import { makeEconomicCalendarStyles } from './styles';

// Ignore the open-frame touch so the same finger cannot dismiss immediately.
const EVENT_FILTER_OPEN_GUARD_MS = 220;
const EVENT_FILTER_OPEN_BACKDROP_MS = 170;
const EVENT_FILTER_OPEN_SHEET_MS = 195;
const EVENT_FILTER_CLOSE_MS = 150;
const EVENT_FILTER_ENTRY_TRANSLATE_Y = 32;

const writeEventFilterHiddenValues = (
  backdropOpacity: Animated.Value,
  sheetTranslateY: Animated.Value,
) => {
  backdropOpacity.stopAnimation();
  sheetTranslateY.stopAnimation();
  backdropOpacity.setValue(0);
  sheetTranslateY.setValue(EVENT_FILTER_ENTRY_TRANSLATE_Y);
};

const startEventFilterOpenAnimation = (
  backdropOpacity: Animated.Value,
  sheetTranslateY: Animated.Value,
  reduceMotion: boolean,
) => {
  writeEventFilterHiddenValues(backdropOpacity, sheetTranslateY);
  if (reduceMotion) {
    backdropOpacity.setValue(1);
    sheetTranslateY.setValue(0);
    return;
  }
  Animated.parallel([
    Animated.timing(backdropOpacity, {
      toValue: 1,
      duration: EVENT_FILTER_OPEN_BACKDROP_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
    Animated.timing(sheetTranslateY, {
      toValue: 0,
      duration: EVENT_FILTER_OPEN_SHEET_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
  ]).start();
};

const startEventFilterCloseAnimation = (
  backdropOpacity: Animated.Value,
  sheetTranslateY: Animated.Value,
  reduceMotion: boolean,
) => {
  backdropOpacity.stopAnimation();
  sheetTranslateY.stopAnimation();
  if (reduceMotion) {
    writeEventFilterHiddenValues(backdropOpacity, sheetTranslateY);
    return;
  }
  Animated.parallel([
    Animated.timing(backdropOpacity, {
      toValue: 0,
      duration: EVENT_FILTER_CLOSE_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }),
    Animated.timing(sheetTranslateY, {
      toValue: EVENT_FILTER_ENTRY_TRANSLATE_Y,
      duration: EVENT_FILTER_CLOSE_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }),
  ]).start();
};

export type EconomicEventFiltersSheetHandle = {
  open: () => void;
  close: () => void;
};

type EconomicEventFiltersSheetProps = {
  selectedImpacts: ReadonlySet<ImpactLevel>;
  onApply: (nextImpacts: Set<ImpactLevel>) => void;
};

/**
 * Retained multi-select filter sheet. It owns visibility and draft selections
 * so opening, closing, and toggling filters do not rebuild the calendar rows
 * behind it. The parent receives one update only after Apply is pressed.
 *
 * The host stays mounted and measured behind a React-owned visibility barrier.
 * Opening therefore performs only UI-thread opacity/translate work instead of
 * creating a new Android Modal window on the user's tap.
 */
export const EconomicEventFiltersSheet = React.memo(React.forwardRef<
  EconomicEventFiltersSheetHandle,
  EconomicEventFiltersSheetProps
>(function EconomicEventFiltersSheet({ selectedImpacts, onApply }, ref) {
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const styles = React.useMemo(
    () => makeEconomicCalendarStyles(T, isDark),
    [T, isDark],
  );
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [openRevision, setOpenRevision] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [draftImpacts, setDraftImpacts] = useState<Set<ImpactLevel>>(
    () => new Set(selectedImpacts),
  );
  const visibleRef = useRef(false);
  const selectedImpactsRef = useRef(selectedImpacts);
  selectedImpactsRef.current = selectedImpacts;
  const openedAtRef = useRef(0);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(
    new Animated.Value(EVENT_FILTER_ENTRY_TRANSLATE_Y),
  ).current;
  const backdropColor = isDark ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.3)';

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const finishHidden = useCallback(() => {
    clearCloseTimer();
    writeEventFilterHiddenValues(backdropOpacity, sheetTranslateY);
    setVisible(false);
    setDraftImpacts(new Set(selectedImpactsRef.current));
  }, [
    backdropOpacity,
    clearCloseTimer,
    sheetTranslateY,
  ]);

  const hideNow = useCallback(() => {
    if (!visibleRef.current) return;
    visibleRef.current = false;
    clearCloseTimer();
    startEventFilterCloseAnimation(backdropOpacity, sheetTranslateY, reduceMotion);
    if (reduceMotion) {
      finishHidden();
      return;
    }
    closeTimerRef.current = setTimeout(finishHidden, EVENT_FILTER_CLOSE_MS);
  }, [
    backdropOpacity,
    clearCloseTimer,
    finishHidden,
    reduceMotion,
    sheetTranslateY,
  ]);

  const open = useCallback(() => {
    clearCloseTimer();
    visibleRef.current = true;
    openedAtRef.current = Date.now();
    setVisible(true);
    setOpenRevision((current) => current + 1);
  }, [clearCloseTimer]);

  useImperativeHandle(ref, () => ({ open, close: hideNow }), [hideNow, open]);

  useLayoutEffect(() => {
    if (!visible || !visibleRef.current) return;
    startEventFilterOpenAnimation(backdropOpacity, sheetTranslateY, reduceMotion);
  }, [
    backdropOpacity,
    openRevision,
    reduceMotion,
    sheetTranslateY,
    visible,
  ]);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  useEffect(() => {
    if (!visibleRef.current) {
      setDraftImpacts(new Set(selectedImpacts));
    }
  }, [selectedImpacts]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!visibleRef.current) return false;
      hideNow();
      return true;
    });
    return () => subscription.remove();
  }, [hideNow]);

  const toggleDraftImpact = useCallback((impact: ImpactLevel) => {
    setDraftImpacts((current) => {
      const next = new Set(current);
      if (next.has(impact)) next.delete(impact);
      else next.add(impact);
      return next;
    });
  }, []);

  const handleBackdropPress = useCallback(() => {
    if (Date.now() - openedAtRef.current < EVENT_FILTER_OPEN_GUARD_MS) return;
    hideNow();
  }, [hideNow]);

  const handleApply = useCallback(() => {
    const nextImpacts = new Set(draftImpacts);
    hideNow();
    onApply(nextImpacts);
  }, [draftImpacts, hideNow, onApply]);

  return (
    <View
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      accessibilityViewIsModal={visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.filterSheetHost,
        visible ? null : styles.filterSheetHostHidden,
      ]}
      testID="economic-event-filters-sheet-host"
    >
      <View
        pointerEvents={visible ? 'box-none' : 'none'}
        style={styles.filterSheetAnimatedHost}
      >
        <View style={styles.modalOverlay} testID="economic-event-filters-sheet">
          {/* Backdrop is a sibling of the sheet — never parent opacity of the card. */}
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: backdropColor },
              { opacity: backdropOpacity },
            ]}
          />
          <FastPressable
            style={StyleSheet.absoluteFillObject}
            onPress={handleBackdropPress}
            activateOnPressIn
            activateOnTouchStart
            latencyLabel="economicCalendar.filters.dismiss"
            unstable_pressDelay={0}
          />

          <Animated.View
            collapsable={false}
            style={[
              styles.modalCard,
              { transform: [{ translateY: sheetTranslateY }] },
            ]}
            testID="economic-event-filters-card"
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>{t('Event Filters')}</Text>
              <Text style={styles.modalSub}>{t('Customize which events appear')}</Text>
            </View>

            <Text style={styles.modalGroupTitle}>{t('IMPACT LEVEL')}</Text>
            <View style={styles.modalImpactRow}>
              {IMPACT_FILTERS.map((impact) => {
                const config = IMPACT_CONFIG[impact];
                const isActive = draftImpacts.has(impact);
                return (
                  <FastPressable
                    key={impact}
                    style={[
                      styles.modalImpactBtn,
                      isActive && {
                        borderColor: `${config.color}60`,
                        backgroundColor: `${config.color}10`,
                      },
                    ]}
                    onPress={() => toggleDraftImpact(impact)}
                    activateOnPressIn
                    latencyLabel={`economicCalendar.filters.${impact}`}
                    unstable_pressDelay={0}
                  >
                    <View style={[styles.modalImpactIndicator, { opacity: isActive ? 1 : 0.6 }]}>
                      <View
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 7,
                          backgroundColor: isActive ? `${config.color}30` : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: isActive ? config.color : isDark ? T.textMuted : '#CBD5E1',
                          }}
                        />
                      </View>
                    </View>
                    <Text style={[styles.modalImpactLabel, isActive && { color: config.color }]}>
                      {t(config.label)}
                    </Text>
                  </FastPressable>
                );
              })}
            </View>

            <Text style={styles.modalGroupTitle}>{t('OTHER')}</Text>
            <FastPressable
              style={[
                styles.modalToggleRow,
                draftImpacts.has('holiday') && styles.modalToggleRowActive,
              ]}
              onPress={() => toggleDraftImpact('holiday')}
              activateOnPressIn
              latencyLabel="economicCalendar.filters.holiday"
              unstable_pressDelay={0}
            >
              <Ionicons name="calendar" size={16} color="#8B5CF6" />
              <Text style={styles.modalToggleLabel}>{t('Show Bank Holidays')}</Text>
              <View style={[styles.modalToggle, draftImpacts.has('holiday') && styles.modalToggleOn]}>
                <View
                  style={[
                    styles.modalToggleThumb,
                    draftImpacts.has('holiday') && styles.modalToggleThumbOn,
                  ]}
                />
              </View>
            </FastPressable>

            <FastPressable
              style={styles.modalDoneBtn}
              onPress={handleApply}
              activateOnPressIn
              activateOnTouchStart
              latencyLabel="economicCalendar.filters.apply"
              unstable_pressDelay={0}
            >
              <LinearGradient
                colors={isDark ? [T.accent, T.trading.buy.active] : ['#4F46E5', '#4338CA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[StyleSheet.absoluteFillObject, { borderRadius: 14 }]}
              />
              <Text style={styles.modalDoneBtnText}>{t('Apply Filters')}</Text>
            </FastPressable>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}));
