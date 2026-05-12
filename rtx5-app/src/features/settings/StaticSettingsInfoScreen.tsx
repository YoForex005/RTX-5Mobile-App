import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../ui/components/Screen';
import { useTheme, type ThemeColors } from '../../ui/theme/useTheme';
import { useUserPreferences } from '../../state/userPreferences';

type InfoVariant = 'traders-community' | 'mql5-algo-trading' | 'user-guide' | 'about';

type InfoConfig = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  sections: Array<{ title: string; body: string }>;
};

const INFO_CONFIG: Record<InfoVariant, InfoConfig> = {
  'traders-community': {
    title: 'Traders Community',
    subtitle: 'Market discussion, shared ideas, and trader updates.',
    icon: 'people-outline',
    sections: [
      { title: 'Community feed', body: 'Follow trader discussions, shared setups, and market notes from the RTX5 workspace.' },
      { title: 'Coming online', body: 'Community features are ready as a frontend destination and can be connected to the live community API when available.' },
    ],
  },
  'mql5-algo-trading': {
    title: 'MQL5 Algo Trading',
    subtitle: 'Automation tools, expert advisors, and signal workflows.',
    icon: 'code-slash-outline',
    sections: [
      { title: 'Automation hub', body: 'Review algorithmic trading resources and prepare expert-advisor workflows from one place.' },
      { title: 'Runtime note', body: 'RTX5 keeps this frontend-only and does not run server-side trading automation inside the mobile app.' },
    ],
  },
  'user-guide': {
    title: 'User Guide',
    subtitle: 'A quick guide for charting, trading, quotes, and settings.',
    icon: 'help-circle-outline',
    sections: [
      { title: 'Trading basics', body: 'Use Quotes to pick a symbol, Chart to inspect price action, and Trade to manage open positions.' },
      { title: 'Personalization', body: 'Theme, watchlist, chart symbol, timeframe, drawings, and trading preferences are stored locally on this device.' },
    ],
  },
  about: {
    title: 'About',
    subtitle: 'RTX5 mobile trading terminal.',
    icon: 'information-circle-outline',
    sections: [
      { title: 'Application', body: 'RTX5 is a React Native trading experience built with Expo, local preferences, live quotes, and a custom chart engine.' },
      { title: 'Release model', body: 'Updates are delivered through the configured EAS Update channels with runtime gating.' },
    ],
  },
};

export function StaticSettingsInfoScreen({ variant }: { variant: InfoVariant }) {
  const T = useTheme();
  const isDark = useUserPreferences((state) => state.themeMode) === 'dark';
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const config = INFO_CONFIG[variant];

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name={config.icon} size={28} color={T.accent} />
          </View>
          <Text style={styles.title}>{config.title}</Text>
          <Text style={styles.subtitle}>{config.subtitle}</Text>
        </View>

        {config.sections.map((section) => (
          <View key={section.title} style={styles.card}>
            <Text style={styles.cardTitle}>{section.title}</Text>
            <Text style={styles.cardText}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? '#0E1522' : '#FFFFFF';
  const panelBg = isDark ? 'rgba(37,99,235,0.12)' : 'rgba(37,99,235,0.08)';

  return StyleSheet.create({
    screen: {
      backgroundColor: T.bg,
    },
    content: {
      padding: 16,
      paddingBottom: 36,
      gap: 12,
    },
    hero: {
      borderRadius: 8,
      padding: 18,
      backgroundColor: cardBg,
      borderWidth: 1,
      borderColor: T.border,
    },
    heroIcon: {
      width: 54,
      height: 54,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: panelBg,
      marginBottom: 14,
    },
    title: {
      color: T.text,
      fontSize: 22,
      fontWeight: '800',
    },
    subtitle: {
      color: T.textSub,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '600',
      marginTop: 6,
    },
    card: {
      borderRadius: 8,
      padding: 14,
      backgroundColor: cardBg,
      borderWidth: 1,
      borderColor: T.border,
    },
    cardTitle: {
      color: T.text,
      fontSize: 14,
      fontWeight: '800',
      marginBottom: 6,
    },
    cardText: {
      color: T.textSub,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '600',
    },
  });
}
