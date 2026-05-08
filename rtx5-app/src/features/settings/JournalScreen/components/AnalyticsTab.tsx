import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function AnalyticsTab({ isDark }: { isDark: boolean }) {
  const cardBg = isDark ? '#111827' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#F8FAFC' : '#0F172A';
  const subText = isDark ? '#64748B' : '#94A3B8';

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: textColor }]}>Performance Analytics</Text>
      
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: textColor }]}>Equity Curve</Text>
          <Ionicons name="trending-up" size={20} color="#10B981" />
        </View>
        <View style={styles.placeholderChart}>
          <Text style={{ color: subText }}>[Line Chart Placeholder]</Text>
          <Text style={{ color: subText, fontSize: 11, marginTop: 4 }}>Shows balance growth over time</Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor, flex: 1, marginRight: 8 }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: textColor }]}>Win / Loss Ratio</Text>
          </View>
          <View style={[styles.placeholderChart, { height: 120 }]}>
            <Ionicons name="pie-chart-outline" size={40} color={isDark ? '#334155' : '#CBD5E1'} />
            <Text style={{ color: subText, fontSize: 11, marginTop: 8 }}>[Donut Chart Placeholder]</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: cardBg, borderColor, flex: 1, marginLeft: 8 }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: textColor }]}>Strategy Performance</Text>
          </View>
          <View style={[styles.placeholderChart, { height: 120 }]}>
            <Ionicons name="bar-chart-outline" size={40} color={isDark ? '#334155' : '#CBD5E1'} />
            <Text style={{ color: subText, fontSize: 11, marginTop: 8 }}>[Bar Chart Placeholder]</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 16 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  placeholderChart: {
    height: 180,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: { flexDirection: 'row' }
});
