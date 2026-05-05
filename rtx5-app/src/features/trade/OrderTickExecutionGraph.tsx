import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

export type TickPoint = {
  time: number;
  bid: number;
  ask: number;
};

export type OrderTickExecutionGraphProps = {
  ticks: TickPoint[];
  height?: number;
  bidColor?: string;
  askColor?: string;
  priceDecimals?: number;
};

type LiveOrderTickExecutionGraphProps = {
  symbol: string;
  bid?: number | null;
  ask?: number | null;
  timestamp?: number | null;
  enabled?: boolean;
  height?: number;
  bidColor?: string;
  askColor?: string;
  maxTicks?: number;
  priceDecimals?: number;
};

const DEFAULT_GRAPH_HEIGHT = 296;
const DEFAULT_MAX_TICKS = 100;
const GRAPH_LEFT_PADDING = 10;
const GRAPH_TOP_PADDING = 16;
const GRAPH_BOTTOM_PADDING = 16;
const GRAPH_LABEL_COUNT = 7;
const GRAPH_AXIS_LABEL_RIGHT_PADDING = 4;
const GRAPH_BADGE_WIDTH = 62;
const GRAPH_BADGE_HEIGHT = 20;
const GRAPH_BADGE_GAP = 2;
const GRAPH_RIGHT_AXIS_WIDTH = GRAPH_BADGE_WIDTH + GRAPH_BADGE_GAP;
const GRAPH_AXIS_LABEL_OFFSET = 48;
const GRAPH_MIN_LINE_GAP = GRAPH_BADGE_HEIGHT + 3;
const GRAPH_TRACE_SOFT_STROKE_WIDTH = 2.2;
const GRAPH_TRACE_MAIN_STROKE_WIDTH = 1.05;
const GRAPH_TRACE_SOFT_OPACITY = 0.18;

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const roundToDecimals = (value: number, priceDecimals: number) =>
  Number(value.toFixed(Math.max(0, priceDecimals)));

const isFiniteTickValue = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isValidTickPoint = (tick: TickPoint | null | undefined): tick is TickPoint =>
  Boolean(
    tick
      && isFiniteTickValue(tick.time)
      && isFiniteTickValue(tick.bid)
      && isFiniteTickValue(tick.ask)
      && tick.ask >= tick.bid,
  );

const appendTick = (ticks: TickPoint[], nextTick: TickPoint, maxTicks: number) => {
  const nextTicks = [...ticks, nextTick];
  return nextTicks.length > maxTicks ? nextTicks.slice(nextTicks.length - maxTicks) : nextTicks;
};

const resolveFallbackTickSize = (ticks: TickPoint[], priceDecimals: number) => {
  const fallbackPoint = Math.pow(10, -Math.max(0, priceDecimals || 0));
  const values = ticks
    .flatMap((tick) => [tick.bid, tick.ask])
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  let minDiff = Number.POSITIVE_INFINITY;
  for (let index = 1; index < values.length; index += 1) {
    const diff = Math.abs(values[index] - values[index - 1]);
    if (diff > 0 && diff < minDiff) {
      minDiff = diff;
    }
  }

  return Number.isFinite(minDiff) ? Math.max(fallbackPoint, minDiff) : fallbackPoint;
};

const createDemoTick = (
  seedTick: TickPoint,
  priceDecimals: number,
  preferredBid?: number | null,
  preferredAsk?: number | null,
): TickPoint => {
  const fallbackPoint = Math.pow(10, -Math.max(0, priceDecimals || 0));
  const referenceSpread = isFiniteTickValue(preferredAsk)
    && isFiniteTickValue(preferredBid)
    && preferredAsk >= preferredBid
    ? preferredAsk - preferredBid
    : seedTick.ask - seedTick.bid;
  const spreadBase = Math.max(referenceSpread, fallbackPoint * 2);
  const deltaUnit = Math.max(fallbackPoint, spreadBase / 6);
  const moveOptions = [-3, -2, -1, 1, 2, 3];
  const shouldMove = Math.random() > 0.35;

  let nextBid = seedTick.bid;
  if (shouldMove) {
    const moveMultiplier = moveOptions[Math.floor(Math.random() * moveOptions.length)];
    nextBid = seedTick.bid + moveMultiplier * deltaUnit;
  }

  const spreadNoise = Math.random() > 0.7 ? deltaUnit * (Math.random() > 0.5 ? 1 : -1) * 0.35 : 0;
  const nextSpread = Math.max(fallbackPoint * 2, spreadBase + spreadNoise);

  return {
    time: Date.now(),
    bid: roundToDecimals(nextBid, priceDecimals),
    ask: roundToDecimals(nextBid + nextSpread, priceDecimals),
  };
};

function useOrderExecutionTicks({
  symbol,
  bid,
  ask,
  timestamp,
  enabled = true,
  maxTicks = DEFAULT_MAX_TICKS,
  priceDecimals = 5,
}: LiveOrderTickExecutionGraphProps) {
  const [ticks, setTicks] = useState<TickPoint[]>([]);
  const ticksRef = useRef<TickPoint[]>([]);
  const lastRealTickKeyRef = useRef('');
  const lastRealTickSeenAtRef = useRef(0);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    ticksRef.current = ticks;
  }, [ticks]);

  useEffect(() => {
    ticksRef.current = [];
    setTicks([]);
    lastRealTickKeyRef.current = '';
    lastRealTickSeenAtRef.current = 0;
  }, [symbol]);

  useEffect(() => {
    if (!enabled || !isFiniteTickValue(bid) || !isFiniteTickValue(ask) || ask < bid) {
      return;
    }

    const tickTime = isFiniteTickValue(timestamp) && timestamp > 0 ? timestamp : Date.now();
    const nextTick: TickPoint = {
      time: tickTime,
      bid: roundToDecimals(bid, priceDecimals),
      ask: roundToDecimals(ask, priceDecimals),
    };
    const tickKey = `${nextTick.time}:${nextTick.bid}:${nextTick.ask}`;
    if (tickKey === lastRealTickKeyRef.current) {
      return;
    }

    lastRealTickKeyRef.current = tickKey;
    lastRealTickSeenAtRef.current = Date.now();
    setTicks((currentTicks) => appendTick(currentTicks, nextTick, maxTicks));
  }, [ask, bid, enabled, maxTicks, priceDecimals, timestamp]);

  useEffect(() => {
    if (!enabled) {
      if (demoTimerRef.current) {
        clearTimeout(demoTimerRef.current);
        demoTimerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const scheduleDemoTick = () => {
      const delay = randomBetween(300, 700);
      demoTimerRef.current = setTimeout(() => {
        if (cancelled) {
          return;
        }

        const now = Date.now();
        const hasFreshRealTick = lastRealTickSeenAtRef.current > 0 && now - lastRealTickSeenAtRef.current < 1400;
        if (!hasFreshRealTick) {
          const seedTick =
            ticksRef.current[ticksRef.current.length - 1]
            ?? (
              isFiniteTickValue(bid)
                && isFiniteTickValue(ask)
                && ask >= bid
                ? {
                    time: now,
                    bid: roundToDecimals(bid, priceDecimals),
                    ask: roundToDecimals(ask, priceDecimals),
                  }
                : null
            );

          if (seedTick) {
            setTicks((currentTicks) =>
              appendTick(currentTicks, createDemoTick(seedTick, priceDecimals, bid, ask), maxTicks),
            );
          }
        }

        scheduleDemoTick();
      }, delay);
    };

    scheduleDemoTick();

    return () => {
      cancelled = true;
      if (demoTimerRef.current) {
        clearTimeout(demoTimerRef.current);
        demoTimerRef.current = null;
      }
    };
  }, [ask, bid, enabled, maxTicks, priceDecimals]);

  return ticks;
}

export const OrderTickExecutionGraph = React.memo(function OrderTickExecutionGraph({
  ticks,
  height = DEFAULT_GRAPH_HEIGHT,
  bidColor = '#2563EB',
  askColor = '#E53935',
  priceDecimals = 5,
}: OrderTickExecutionGraphProps) {
  const [layoutWidth, setLayoutWidth] = useState(0);

  const visibleTicks = useMemo(() => {
    const nextTicks = ticks.filter(isValidTickPoint).slice(-120);
    if (nextTicks.length === 1) {
      return [
        nextTicks[0],
        {
          ...nextTicks[0],
          time: nextTicks[0].time + 1,
        },
      ];
    }
    return nextTicks;
  }, [ticks]);

  const fallbackTickSize = useMemo(
    () => resolveFallbackTickSize(visibleTicks, priceDecimals),
    [priceDecimals, visibleTicks],
  );
  const gridLineSpacing = Math.max(
    0,
    (height - GRAPH_TOP_PADDING - GRAPH_BOTTOM_PADDING) / Math.max(GRAPH_LABEL_COUNT, 1),
  );

  const { chartMin, chartMax } = useMemo(() => {
    const bidValues = visibleTicks.map((tick) => tick.bid);
    const askValues = visibleTicks.map((tick) => tick.ask);
    const allValues = [...bidValues, ...askValues];

    if (allValues.length === 0) {
      return {
        chartMin: 0,
        chartMax: fallbackTickSize * 6,
      };
    }

    const minPrice = Math.min(...allValues);
    const maxPrice = Math.max(...allValues);
    const pricePadding = (maxPrice - minPrice) * 0.15 || fallbackTickSize;

    return {
      chartMin: minPrice - pricePadding,
      chartMax: maxPrice + pricePadding,
    };
  }, [fallbackTickSize, visibleTicks]);

  const plotWidth = Math.max(0, layoutWidth - GRAPH_RIGHT_AXIS_WIDTH - GRAPH_LEFT_PADDING);
  const plotHeight = Math.max(0, gridLineSpacing * Math.max(GRAPH_LABEL_COUNT - 1, 0));
  const plotLeft = GRAPH_LEFT_PADDING;
  const plotRight = plotLeft + plotWidth;
  const graphBottomGuideY = Math.min(height - 1, GRAPH_TOP_PADDING + gridLineSpacing * Math.max(GRAPH_LABEL_COUNT, 1));
  const priceLabelX = Math.min(
    layoutWidth - GRAPH_AXIS_LABEL_RIGHT_PADDING,
    plotRight + GRAPH_AXIS_LABEL_OFFSET,
  );
  const chartSpan = Math.max(chartMax - chartMin, fallbackTickSize);
  const latestTick = visibleTicks[visibleTicks.length - 1];

  const xForTick = (index: number, total: number) => {
    if (total <= 1) {
      return plotLeft;
    }
    return plotLeft + (index / (total - 1)) * plotWidth;
  };

  const yForPrice = (price: number) =>
    GRAPH_TOP_PADDING + plotHeight - ((price - chartMin) / chartSpan) * plotHeight;

  const buildStepPath = (values: number[]) => {
    if (values.length === 0) {
      return '';
    }

    let path = `M ${xForTick(0, values.length)} ${yForPrice(values[0])}`;
    for (let index = 1; index < values.length; index += 1) {
      const x = xForTick(index, values.length);
      const previousY = yForPrice(values[index - 1]);
      const nextY = yForPrice(values[index]);
      path += ` L ${x} ${previousY} L ${x} ${nextY}`;
    }

    return path;
  };

  const askPath = useMemo(
    () => (layoutWidth > 0 ? buildStepPath(visibleTicks.map((tick) => tick.ask)) : ''),
    [layoutWidth, visibleTicks],
  );
  const bidPath = useMemo(
    () => (layoutWidth > 0 ? buildStepPath(visibleTicks.map((tick) => tick.bid)) : ''),
    [layoutWidth, visibleTicks],
  );

  const priceLevels = useMemo(
    () =>
      Array.from({ length: GRAPH_LABEL_COUNT }, (_, index) =>
        chartMax - (chartSpan * index) / Math.max(GRAPH_LABEL_COUNT - 1, 1),
      ),
    [chartMax, chartSpan],
  );
  const bottomGuidePriceLevel =
    chartMin - chartSpan / Math.max(GRAPH_LABEL_COUNT - 1, 1);

  const badgePositions = useMemo(() => {
    if (!latestTick) {
      return null;
    }

    const topLimit = GRAPH_TOP_PADDING;
    const bottomLimit = GRAPH_TOP_PADDING + plotHeight - GRAPH_BADGE_HEIGHT;
    let askTop = clampValue(yForPrice(latestTick.ask) - GRAPH_BADGE_HEIGHT / 2, topLimit, bottomLimit);
    let bidTop = clampValue(yForPrice(latestTick.bid) - GRAPH_BADGE_HEIGHT / 2, topLimit, bottomLimit);

    if (bidTop < askTop + GRAPH_MIN_LINE_GAP) {
      bidTop = Math.min(bottomLimit, askTop + GRAPH_MIN_LINE_GAP);
      if (bidTop >= bottomLimit) {
        askTop = Math.max(topLimit, bidTop - GRAPH_MIN_LINE_GAP);
      }
    }

    return {
      askTop,
      bidTop,
    };
  }, [latestTick, plotHeight]);

  const handleLayout = (event: LayoutChangeEvent) => {
    setLayoutWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={[styles.card, { height }]} onLayout={handleLayout}>
      {layoutWidth > 0 ? (
        <Svg width={layoutWidth} height={height}>
          {priceLevels.map((priceLevel, index) => {
            const y = yForPrice(priceLevel);
            return (
              <Line
                key={`grid-${index}`}
                x1={plotLeft}
                y1={y}
                x2={plotRight}
                y2={y}
                stroke="#D3D8E0"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
            );
          })}

          {askPath ? (
            <>
              <Path
                d={askPath}
                stroke={askColor}
                strokeWidth={GRAPH_TRACE_SOFT_STROKE_WIDTH}
                strokeOpacity={GRAPH_TRACE_SOFT_OPACITY}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <Path
                d={askPath}
                stroke={askColor}
                strokeWidth={GRAPH_TRACE_MAIN_STROKE_WIDTH}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          ) : null}
          {bidPath ? (
            <>
              <Path
                d={bidPath}
                stroke={bidColor}
                strokeWidth={GRAPH_TRACE_SOFT_STROKE_WIDTH}
                strokeOpacity={GRAPH_TRACE_SOFT_OPACITY}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <Path
                d={bidPath}
                stroke={bidColor}
                strokeWidth={GRAPH_TRACE_MAIN_STROKE_WIDTH}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          ) : null}

          {priceLevels.map((priceLevel, index) => (
            <SvgText
              key={`label-${index}`}
              x={priceLabelX}
              y={yForPrice(priceLevel) + 4}
              fill="#7B8794"
              fontSize="10"
              fontWeight="500"
              textAnchor="end"
            >
              {priceLevel.toFixed(priceDecimals)}
            </SvgText>
          ))}

          <Line
            x1={plotLeft}
            y1={graphBottomGuideY}
            x2={plotRight}
            y2={graphBottomGuideY}
            stroke="#D3D8E0"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <SvgText
            x={priceLabelX}
            y={graphBottomGuideY + 4}
            fill="#7B8794"
            fontSize="10"
            fontWeight="500"
            textAnchor="end"
          >
            {bottomGuidePriceLevel.toFixed(priceDecimals)}
          </SvgText>

          {latestTick ? (
            <>
              <Line
                x1={plotRight - 2}
                y1={yForPrice(latestTick.ask)}
                x2={layoutWidth - GRAPH_BADGE_WIDTH - GRAPH_BADGE_GAP}
                y2={yForPrice(latestTick.ask)}
                stroke={askColor}
                strokeWidth="0.9"
              />
              <Line
                x1={plotRight - 2}
                y1={yForPrice(latestTick.bid)}
                x2={layoutWidth - GRAPH_BADGE_WIDTH - GRAPH_BADGE_GAP}
                y2={yForPrice(latestTick.bid)}
                stroke={bidColor}
                strokeWidth="0.9"
              />
            </>
          ) : null}

          {latestTick && badgePositions ? (
            <>
              <G x={layoutWidth - GRAPH_BADGE_WIDTH - GRAPH_BADGE_GAP} y={badgePositions.askTop}>
                <Rect width={GRAPH_BADGE_WIDTH} height={GRAPH_BADGE_HEIGHT} rx={5} fill={askColor} />
                <SvgText
                  x={GRAPH_BADGE_WIDTH / 2}
                  y={GRAPH_BADGE_HEIGHT / 2 + 3}
                  fill="#FFFFFF"
                  fontSize="9"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {latestTick.ask.toFixed(priceDecimals)}
                </SvgText>
              </G>
              <G x={layoutWidth - GRAPH_BADGE_WIDTH - GRAPH_BADGE_GAP} y={badgePositions.bidTop}>
                <Rect width={GRAPH_BADGE_WIDTH} height={GRAPH_BADGE_HEIGHT} rx={5} fill={bidColor} />
                <SvgText
                  x={GRAPH_BADGE_WIDTH / 2}
                  y={GRAPH_BADGE_HEIGHT / 2 + 3}
                  fill="#FFFFFF"
                  fontSize="9"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {latestTick.bid.toFixed(priceDecimals)}
                </SvgText>
              </G>
            </>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
});

export function LiveOrderTickExecutionGraph(props: LiveOrderTickExecutionGraphProps) {
  const ticks = useOrderExecutionTicks(props);

  return (
    <OrderTickExecutionGraph
      ticks={ticks}
      height={props.height}
      bidColor={props.bidColor}
      askColor={props.askColor}
      priceDecimals={props.priceDecimals}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
});
