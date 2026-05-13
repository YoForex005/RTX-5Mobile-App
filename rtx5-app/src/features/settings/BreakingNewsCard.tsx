import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

export type BreakingNewsCardData = {
  id: string;
  title: string;
  summary: string;
  source: string;
  published_at: string;
  relative_time: string;
  affected_symbols: string[];
  is_saved: boolean;
  read_url: string;
};

type BreakingNewsCardProps = {
  breakingNews?: BreakingNewsCardData | null;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onReadMore?: (readUrl: string, id: string) => void;
  onToggleSaved?: (id: string, nextSaved: boolean) => void;
};

const MAX_VISIBLE_SYMBOLS = 5;
const SYMBOL_ROW_GAP = 5;
const SYMBOL_RAIL_SCREEN_GUTTER = 80;
const FOOTER_ACTION_GAP = 10;
const READ_MORE_BUTTON_WIDTH = 102;

export function BreakingNewsCard({
  breakingNews,
  isLoading = false,
  errorMessage,
  onRetry,
  onReadMore,
  onToggleSaved,
}: BreakingNewsCardProps) {
  if (isLoading) {
    return <BreakingNewsSkeleton />;
  }

  if (errorMessage) {
    return <BreakingNewsError message={errorMessage} onRetry={onRetry} />;
  }

  if (!breakingNews) {
    return null;
  }

  const handleReadMore = () => {
    if (onReadMore) {
      onReadMore(breakingNews.read_url, breakingNews.id);
      return;
    }

    if (breakingNews.read_url) {
      Linking.openURL(breakingNews.read_url).catch(() => undefined);
    }
  };

  return (
    <LinearGradient
      colors={['#050B14', '#07111F', '#160A12']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <LinearGradient
        colors={['rgba(255,77,90,0.22)', 'rgba(7,17,31,0.2)', 'rgba(255,77,90,0.12)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        pointerEvents="none"
        style={styles.redGlow}
      />
      <MarketPulseGraphic />

      <View style={styles.topRow}>
        <BreakingBadge />
        <SaveButton
          isSaved={breakingNews.is_saved}
          onPress={() => onToggleSaved?.(breakingNews.id, !breakingNews.is_saved)}
        />
      </View>

      <View style={styles.leftColumn}>
        <NewsTimeRow relativeTime={breakingNews.relative_time || breakingNews.published_at} />
        <NewsHeadline title={breakingNews.title} />
        <NewsSummary summary={breakingNews.summary} />
        <NewsMetaRow source={breakingNews.source} publishedAt={breakingNews.published_at} />
      </View>

      <View style={styles.divider} />

      <View style={styles.bottomRow}>
        <AffectedSymbolsRow symbols={breakingNews.affected_symbols} />
        <ReadMoreButton onPress={handleReadMore} />
      </View>
    </LinearGradient>
  );
}

function BreakingBadge() {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>BREAKING NEWS</Text>
    </View>
  );
}

function SaveButton({ isSaved, onPress }: { isSaved: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.saveButton} hitSlop={8} onPress={onPress}>
      <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={24} color="#F8FAFC" />
    </Pressable>
  );
}

function NewsTimeRow({ relativeTime }: { relativeTime: string }) {
  return (
    <View style={styles.timeRow}>
      <View style={styles.liveDot} />
      <Text style={styles.timeText} numberOfLines={1}>{relativeTime}</Text>
    </View>
  );
}

function NewsHeadline({ title }: { title: string }) {
  return (
    <Text style={styles.headline} numberOfLines={3}>
      {title}
    </Text>
  );
}

function NewsSummary({ summary }: { summary: string }) {
  return (
    <Text style={styles.summary} numberOfLines={2}>
      {summary}
    </Text>
  );
}

function NewsMetaRow({ source, publishedAt }: { source: string; publishedAt: string }) {
  return (
    <View style={styles.metaRow}>
      <Ionicons name="globe-outline" size={15} color="#AEB6C4" />
      <Text style={[styles.metaText, styles.metaSourceText]} numberOfLines={1}>{source}</Text>
      <View style={styles.metaDivider} />
      <Ionicons name="time-outline" size={15} color="#AEB6C4" />
      <Text style={[styles.metaText, styles.metaTimeText]} numberOfLines={1}>{publishedAt}</Text>
    </View>
  );
}

function AffectedSymbolsRow({ symbols }: { symbols: string[] }) {
  const { width } = useWindowDimensions();

  if (symbols.length === 0) return null;

  const railWidth = Math.max(
    128,
    width - SYMBOL_RAIL_SCREEN_GUTTER - READ_MORE_BUTTON_WIDTH - FOOTER_ACTION_GAP,
  );
  const { visibleSymbols, overflowCount } = getOneLineSymbolSet(symbols, railWidth);

  return (
    <View style={styles.symbolBlock}>
      <Text style={styles.symbolLabel}>Affected Symbols</Text>
      <View style={styles.symbolRail}>
        {visibleSymbols.map((symbol) => (
          <View key={symbol} style={styles.symbolChip}>
            <Text style={styles.symbolText} numberOfLines={1}>{symbol}</Text>
          </View>
        ))}
        {overflowCount > 0 ? (
          <View style={styles.symbolChip}>
            <Text style={styles.symbolText}>+{overflowCount}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function getOneLineSymbolSet(symbols: string[], railWidth: number) {
  let usedWidth = 0;
  const visibleSymbols: string[] = [];

  for (let index = 0; index < symbols.length && visibleSymbols.length < MAX_VISIBLE_SYMBOLS; index += 1) {
    const symbol = symbols[index];
    const remainingAfterThis = symbols.length - index - 1;
    const symbolWidth = getEstimatedSymbolChipWidth(symbol);
    const symbolGap = visibleSymbols.length > 0 ? SYMBOL_ROW_GAP : 0;
    const overflowWidth = remainingAfterThis > 0 ? SYMBOL_ROW_GAP + getEstimatedSymbolChipWidth(`+${remainingAfterThis}`) : 0;

    if (usedWidth + symbolGap + symbolWidth + overflowWidth > railWidth) break;

    usedWidth += symbolGap + symbolWidth;
    visibleSymbols.push(symbol);
  }

  if (visibleSymbols.length === 0) {
    return {
      visibleSymbols: symbols.slice(0, 1),
      overflowCount: Math.max(0, symbols.length - 1),
    };
  }

  return {
    visibleSymbols,
    overflowCount: Math.max(0, symbols.length - visibleSymbols.length),
  };
}

function getEstimatedSymbolChipWidth(symbol: string) {
  return Math.min(66, Math.max(28, symbol.length * 6.5 + 18));
}

function ReadMoreButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.readButton} hitSlop={8} onPress={onPress}>
      <LinearGradient
        colors={['#005BFF', '#007BFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.readButtonFill}
      >
        <Text style={styles.readText}>Read More</Text>
        <Ionicons name="arrow-forward" size={18} color="#45C7FF" />
      </LinearGradient>
    </Pressable>
  );
}

function MarketPulseGraphic() {
  const mapDotRows: Array<{ y: number; ranges: Array<[number, number, number]> }> = [
    { y: 24, ranges: [[66, 96, 6], [176, 206, 6], [228, 282, 6]] },
    { y: 30, ranges: [[52, 112, 6], [164, 212, 6], [220, 304, 6]] },
    { y: 36, ranges: [[44, 124, 6], [154, 206, 6], [214, 322, 6]] },
    { y: 42, ranges: [[38, 116, 6], [150, 194, 6], [210, 330, 6]] },
    { y: 48, ranges: [[42, 104, 6], [158, 204, 6], [218, 334, 6]] },
    { y: 54, ranges: [[52, 98, 6], [164, 216, 6], [228, 326, 6]] },
    { y: 60, ranges: [[62, 108, 6], [170, 224, 6], [238, 314, 6]] },
    { y: 66, ranges: [[72, 116, 6], [176, 230, 6], [248, 300, 6]] },
    { y: 72, ranges: [[82, 122, 6], [180, 236, 6], [258, 292, 6]] },
    { y: 78, ranges: [[90, 126, 6], [184, 238, 6], [268, 288, 6]] },
    { y: 84, ranges: [[94, 122, 6], [188, 236, 6]] },
    { y: 90, ranges: [[98, 124, 6], [190, 232, 6]] },
    { y: 96, ranges: [[102, 124, 6], [192, 228, 6]] },
    { y: 102, ranges: [[106, 126, 6], [194, 224, 6]] },
    { y: 108, ranges: [[110, 126, 6], [196, 222, 6]] },
    { y: 114, ranges: [[112, 128, 6], [198, 218, 6]] },
    { y: 120, ranges: [[116, 128, 6], [200, 216, 6]] },
    { y: 126, ranges: [[118, 130, 6], [204, 216, 6], [280, 310, 6]] },
    { y: 132, ranges: [[120, 130, 6], [208, 216, 6], [274, 322, 6]] },
    { y: 138, ranges: [[124, 130, 6], [282, 316, 6]] },
    { y: 144, ranges: [[288, 306, 6]] },
  ];
  const mapDots = mapDotRows.flatMap((row) =>
    row.ranges.flatMap(([start, end, step]) =>
      Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, index) => ({
        cx: start + index * step,
        cy: row.y,
      })),
    ),
  );

  return (
    <View style={styles.graphic} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 360 190">
        <Defs>
          <RadialGradient id="globeGlow" cx="48%" cy="35%" r="68%">
            <Stop offset="0%" stopColor="#FF4D5A" stopOpacity={0.28} />
            <Stop offset="58%" stopColor="#7F1D1D" stopOpacity={0.12} />
            <Stop offset="100%" stopColor="#020617" stopOpacity={0} />
          </RadialGradient>
          <SvgLinearGradient id="signalStroke" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor="#8B1E2D" stopOpacity={0.65} />
            <Stop offset="46%" stopColor="#FF3D4F" stopOpacity={1} />
            <Stop offset="100%" stopColor="#FF8A92" stopOpacity={0.95} />
          </SvgLinearGradient>
        </Defs>
        <Circle cx={214} cy={78} r={128} fill="url(#globeGlow)" />
        <G opacity={0.22}>
          <Path d="M34 92C34 48 92 20 178 20C278 20 338 50 338 92C338 137 278 166 178 166C88 166 34 138 34 92Z" stroke="#FF4D5A" strokeWidth={0.75} fill="none" />
          <Path d="M34 92H338M72 53C125 66 250 66 306 53M72 132C126 117 250 117 306 132M178 20C150 48 138 70 138 92C138 116 150 139 178 166M178 20C208 48 222 70 222 92C222 116 208 139 178 166M98 30C86 58 80 78 80 92C80 113 91 137 114 157M258 30C270 58 276 78 276 92C276 113 265 137 242 157" stroke="#FF4D5A" strokeWidth={0.55} fill="none" />
        </G>
        <G opacity={0.82}>
          {mapDots.map(({ cx, cy }, index) => (
            <Circle key={`${cx}-${cy}-${index}`} cx={cx} cy={cy} r={1.25} fill="#FF3D4F" opacity={index % 3 === 0 ? 0.82 : 0.46} />
          ))}
        </G>
        <G opacity={0.18}>
          {Array.from({ length: 12 }).map((_, index) => (
            <Path
              key={index}
              d={`M${168 + index * 13} 172V${126 - (index % 5) * 12}`}
              stroke="#FF4D5A"
              strokeWidth={5}
              strokeLinecap="round"
            />
          ))}
        </G>
        <Path
          d="M126 132H148L158 113L170 143L182 116L196 126L211 94L226 111L242 68L258 102L274 86L289 112L306 62L323 82L348 66"
          stroke="#7F1D1D"
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={0.26}
        />
        <Path
          d="M126 132H148L158 113L170 143L182 116L196 126L211 94L226 111L242 68L258 102L274 86L289 112L306 62L323 82L348 66"
          stroke="url(#signalStroke)"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

function BreakingNewsSkeleton() {
  return (
    <View style={styles.card}>
      <View style={[styles.skeletonBlock, styles.skeletonBadge]} />
      <View style={[styles.skeletonLine, { width: '28%', marginTop: 24 }]} />
      <View style={[styles.skeletonLine, { width: '58%', height: 22, marginTop: 14 }]} />
      <View style={[styles.skeletonLine, { width: '48%', height: 22, marginTop: 8 }]} />
      <View style={[styles.skeletonLine, { width: '54%', marginTop: 18 }]} />
      <View style={styles.divider} />
      <View style={styles.bottomRow}>
        <View style={[styles.skeletonBlock, { width: 130, height: 34 }]} />
        <View style={[styles.skeletonBlock, { width: 138, height: 48 }]} />
      </View>
    </View>
  );
}

function BreakingNewsError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[styles.card, styles.stateCard]}>
      <Text style={styles.stateTitle}>Breaking news unavailable</Text>
      <Text style={styles.stateText}>{message}</Text>
      {onRetry ? (
        <Pressable style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 326,
    borderRadius: 22,
    padding: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,70,90,0.28)',
    backgroundColor: '#050B14',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 6,
  },
  redGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },
  topRow: {
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  badge: {
    minHeight: 34,
    maxWidth: '76%',
    paddingHorizontal: 13,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,45,65,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,70,90,0.65)',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  saveButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,16,30,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(220,230,255,0.42)',
  },
  leftColumn: {
    zIndex: 2,
    width: '68%',
  },
  timeRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF4D5A',
  },
  timeText: {
    color: '#C8CDD6',
    fontSize: 13,
    fontWeight: '500',
  },
  headline: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 23,
    fontWeight: '800',
    letterSpacing: 0,
  },
  summary: {
    marginTop: 9,
    color: '#C5CAD3',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  metaRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  metaText: {
    color: '#B9C0CC',
    fontSize: 12,
    fontWeight: '500',
  },
  metaSourceText: {
    maxWidth: 86,
  },
  metaTimeText: {
    maxWidth: 54,
  },
  metaDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  divider: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 104,
    zIndex: 2,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  bottomRow: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 18,
    zIndex: 3,
    minHeight: 55,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: FOOTER_ACTION_GAP,
  },
  symbolBlock: {
    flex: 1,
    minWidth: 0,
  },
  symbolLabel: {
    marginBottom: 7,
    color: '#A8B0BD',
    fontSize: 12,
    fontWeight: '500',
  },
  symbolRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'nowrap',
    overflow: 'hidden',
  },
  symbolChip: {
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 14,
    justifyContent: 'center',
    flexShrink: 0,
    maxWidth: 66,
    backgroundColor: 'rgba(5,11,20,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(180,190,210,0.35)',
  },
  symbolText: {
    maxWidth: 50,
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
  },
  readButton: {
    width: READ_MORE_BUTTON_WIDTH,
    height: 38,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,180,255,0.65)',
    shadowColor: '#007BFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 4,
  },
  readButtonFill: {
    flex: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  readText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  graphic: {
    position: 'absolute',
    left: 102,
    right: -82,
    top: 74,
    height: 182,
    opacity: 0.84,
  },
  skeletonBlock: {
    borderRadius: 12,
    backgroundColor: 'rgba(148,163,184,0.16)',
  },
  skeletonBadge: {
    width: 170,
    height: 38,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(148,163,184,0.16)',
  },
  stateCard: {
    minHeight: 180,
    justifyContent: 'center',
  },
  stateTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  stateText: {
    marginTop: 6,
    color: '#C5CAD3',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  retryButton: {
    marginTop: 14,
    alignSelf: 'flex-start',
    minHeight: 38,
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,91,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(0,180,255,0.45)',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
