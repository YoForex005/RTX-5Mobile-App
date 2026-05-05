import React, {  } from 'react';
import { Dimensions, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '../../../i18n/useTranslation';
import { OVERLAY_MODAL_PROPS } from '../../../ui/overlayModalProps';
import {
  normalizeTradeVolume,
  resolveTradeVolumeBounds,
  type TradeVolumeBounds,
} from '../../../utils/tradeVolume';
import {
  type ChartTimeRange,
} from '../timeRangePresets';
import {
  buildFooterLotPickerQuickAdjustments,
  buildFooterLotPickerValues,
  type FooterLotPickerMode,
} from '../chartTradeInteractionUtils';


import { makeStyles } from "../ChartScreen.styles";
import { CHART_TRADE_SLIDER_THUMB_SIZE, FOOTER_LOT_PICKER_VALUE_ITEM_HEIGHT } from "../ChartScreen.constants";


export function ChartStepperModal({
  visible,
  title,
  initial,
  step,
  decimals,
  min,
  max,
  styles,
  onClose,
  onCommit,
}: {
  visible: boolean;
  title: string;
  initial: number;
  step: number;
  decimals: number;
  min?: number;
  max?: number;
  styles: ReturnType<typeof makeStyles>;
  onClose: () => void;
  onCommit: (next: number) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = React.useState(initial);
  React.useEffect(() => {
    if (visible) setValue(initial);
  }, [visible, initial]);

  const clamp = React.useCallback(
    (v: number) => {
      let out = v;
      if (typeof min === 'number') out = Math.max(min, out);
      if (typeof max === 'number') out = Math.min(max, out);
      return Number(out.toFixed(Math.max(decimals, 0)));
    },
    [decimals, max, min],
  );

  const bump = React.useCallback(
    (dir: -1 | 1) => setValue((v) => clamp(v + dir * step)),
    [clamp, step],
  );

  if (!visible) return null;
  const prev = clamp(value - step);
  const next = clamp(value + step);

  return (
    <Modal
      transparent
      visible
      animationType='fade'
      {...OVERLAY_MODAL_PROPS}
      onRequestClose={onClose}
    >
      <View style={styles.stepperModalLayer}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.stepperModalCard}>
          {title ? <Text style={styles.stepperModalTitle}>{title}</Text> : null}
          <View style={styles.stepperModalBody}>
            <Pressable style={styles.stepperModalMinus} onPress={() => bump(-1)} hitSlop={10}>
              <Text style={styles.stepperModalMinusText}>−</Text>
            </Pressable>
            <View style={styles.stepperModalStack}>
              <Text style={styles.stepperModalGhost}>{prev.toFixed(decimals)}</Text>
              <View style={styles.stepperModalDivider} />
              <Text style={styles.stepperModalMain}>{value.toFixed(decimals)}</Text>
              <View style={styles.stepperModalDivider} />
              <Text style={styles.stepperModalGhost}>{next.toFixed(decimals)}</Text>
            </View>
            <Pressable style={styles.stepperModalPlus} onPress={() => bump(1)} hitSlop={10}>
              <Text style={styles.stepperModalPlusText}>+</Text>
            </Pressable>
          </View>
          <View style={styles.stepperModalActions}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.stepperModalCancel}>{t('Cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onCommit(value);
                onClose();
              }}
              hitSlop={8}
            >
              <Text style={styles.stepperModalOk}>{t('OK')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function ChartFooterLotPicker({
  visible,
  mode,
  value,
  bounds,
  bottomOffset,
  styles,
  onClose,
  onSelect,
}: {
  visible: boolean;
  mode: FooterLotPickerMode;
  value: number;
  bounds?: TradeVolumeBounds;
  bottomOffset: number;
  styles: ReturnType<typeof makeStyles>;
  onClose: () => void;
  onSelect: (next: number) => void;
}) {
  const windowSize = Dimensions.get('window');
  const valueScrollRef = React.useRef<ScrollView>(null);
  const [activeRangeMultiplier, setActiveRangeMultiplier] = React.useState<number | null>(null);
  const resolved = React.useMemo(() => resolveTradeVolumeBounds(bounds), [bounds]);
  const quickAdjustments = React.useMemo(
    () => buildFooterLotPickerQuickAdjustments(value, mode, bounds),
    [bounds, mode, value],
  );
  const defaultRangeMultiplier = quickAdjustments[0]?.multiplier ?? 1;
  const selectedRangeMultiplier = mode === 'absolute'
    ? undefined
    : activeRangeMultiplier ?? defaultRangeMultiplier;
  const valueOptions = React.useMemo(
    () => buildFooterLotPickerValues(value, mode, bounds, selectedRangeMultiplier),
    [bounds, mode, selectedRangeMultiplier, value],
  );
  const normalizedValue = normalizeTradeVolume(value, bounds);
  const selectionEpsilon = resolved.stepVolume / 1000;
  const activeValueStartIndex = mode === 'absolute'
    ? 0
    : Math.max(0, valueOptions.findIndex((option) => option.multiplier >= (selectedRangeMultiplier ?? 0)));

  React.useEffect(() => {
    setActiveRangeMultiplier(null);
  }, [bounds, mode, visible]);

  React.useEffect(() => {
    if (!visible || mode === 'absolute' || activeValueStartIndex < 0) {
      return;
    }
    requestAnimationFrame(() => {
      valueScrollRef.current?.scrollTo({
        y: activeValueStartIndex * FOOTER_LOT_PICKER_VALUE_ITEM_HEIGHT,
        animated: true,
      });
    });
  }, [activeValueStartIndex, mode, selectedRangeMultiplier, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.footerLotPickerLayer}>
      <Pressable
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: Math.max(0, bottomOffset - 8),
        }}
        onPress={onClose}
      />
      <View
        style={[
          styles.footerLotPickerCard,
          styles.footerLotPickerCardVertical,
          {
            bottom: bottomOffset,
            width: Math.max(168, Math.min(windowSize.width - 24, 228)),
            maxHeight: Math.max(220, Math.min(windowSize.height - bottomOffset - 72, 384)),
          },
        ]}
      >
        <View style={styles.footerLotPickerVerticalBody}>
          <View style={styles.footerLotPickerQuickRail}>
            {quickAdjustments.map((option) => {
              const active = mode !== 'absolute' && option.multiplier === selectedRangeMultiplier;
              return (
                <Pressable
                  key={option.key}
                  style={[styles.footerLotPickerQuickButton, active && styles.footerLotPickerQuickButtonActive]}
                  onPress={() => {
                    if (mode === 'absolute') {
                      onSelect(option.nextValue);
                      return;
                    }
                    setActiveRangeMultiplier(option.multiplier);
                  }}
                  hitSlop={6}
                >
                  <Text style={[styles.footerLotPickerQuickText, active && styles.footerLotPickerQuickTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <ScrollView
            ref={valueScrollRef}
            showsVerticalScrollIndicator={valueOptions.length > 5}
            style={styles.footerLotPickerValuesScrollVertical}
            contentContainerStyle={styles.footerLotPickerValuesContentVertical}
            keyboardShouldPersistTaps="handled"
          >
            {valueOptions.map((option) => {
              const active = mode === 'absolute' && Math.abs(option.value - normalizedValue) <= selectionEpsilon;
              const isRangeSelector = mode !== 'absolute' && typeof option.rangeMultiplier === 'number';
              const isRangeBoundary = isRangeSelector && option.multiplier === selectedRangeMultiplier;
              return (
                <Pressable
                  key={option.key}
                  style={[
                    styles.footerLotPickerValueButton,
                    styles.footerLotPickerValueButtonVertical,
                    active && styles.footerLotPickerValueButtonActive,
                    isRangeBoundary && styles.footerLotPickerValueButtonRange,
                  ]}
                  onPress={() => {
                    if (isRangeSelector && typeof option.rangeMultiplier === 'number') {
                      setActiveRangeMultiplier(option.rangeMultiplier);
                    }
                    onSelect(option.value);
                  }}
                  hitSlop={6}
                >
                  <Text
                    style={[
                      styles.footerLotPickerValueText,
                      active && styles.footerLotPickerValueTextActive,
                      isRangeBoundary && styles.footerLotPickerValueTextRange,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

export function ChartTradeVolumeSlider({
  styles,
  value,
  bounds,
  onChange,
}: {
  styles: ReturnType<typeof makeStyles>;
  value: number;
  bounds: { minVolume?: number | null; maxVolume?: number | null; stepVolume?: number | null };
  onChange: (next: number) => void;
}) {
  const resolved = React.useMemo(() => resolveTradeVolumeBounds(bounds), [bounds]);
  const { minVolume, maxVolume } = resolved;
  const resolvedRef = React.useRef(resolved);
  React.useEffect(() => {
    resolvedRef.current = resolved;
  }, [resolved]);

  const [trackWidth, setTrackWidth] = React.useState(0);
  const trackWidthRef = React.useRef(0);
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const range = Math.max(maxVolume - minVolume, resolved.stepVolume);
  const clampedValue = Math.min(maxVolume, Math.max(minVolume, value));
  const progress = (clampedValue - minVolume) / range;
  const thumbRadius = CHART_TRADE_SLIDER_THUMB_SIZE / 2;
  const usableWidth = Math.max(0, trackWidth - CHART_TRADE_SLIDER_THUMB_SIZE);
  const thumbCenterX = thumbRadius + progress * usableWidth;

  const applyFromX = React.useCallback((x: number) => {
    const width = trackWidthRef.current;
    if (width <= 0) return;
    const usable = Math.max(1, width - CHART_TRADE_SLIDER_THUMB_SIZE);
    const ratio = Math.min(1, Math.max(0, (x - CHART_TRADE_SLIDER_THUMB_SIZE / 2) / usable));
    const r = resolvedRef.current;
    const raw = r.minVolume + ratio * (r.maxVolume - r.minVolume);
    onChangeRef.current(normalizeTradeVolume(raw, {
      minVolume: r.minVolume,
      maxVolume: r.maxVolume,
      stepVolume: r.stepVolume,
    }));
  }, []);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: (evt) => applyFromX(evt.nativeEvent.locationX),
        onPanResponderMove: (evt) => applyFromX(evt.nativeEvent.locationX),
        onPanResponderRelease: (evt) => applyFromX(evt.nativeEvent.locationX),
        onPanResponderTerminationRequest: () => false,
      }),
    [applyFromX],
  );

  return (
    <View
      style={styles.chartTradeSliderTouch}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        trackWidthRef.current = w;
        setTrackWidth(w);
      }}
      {...panResponder.panHandlers}
    >
      <View style={styles.chartTradeSliderTrack}>
        <View style={[styles.chartTradeSliderFill, { width: thumbCenterX }]} />
      </View>
      <View
        style={[
          styles.chartTradeSliderThumb,
          { left: thumbCenterX - thumbRadius },
        ]}
      />
    </View>
  );
}
