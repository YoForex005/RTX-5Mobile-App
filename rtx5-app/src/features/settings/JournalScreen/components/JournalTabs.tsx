import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface JournalTabsProps {
  activeTab: 'Journal' | 'Analytics' | 'Review';
  setActiveTab: (tab: 'Journal' | 'Analytics' | 'Review') => void;
  isDark: boolean;
}

export function JournalTabs({ activeTab, setActiveTab, isDark }: JournalTabsProps) {
  const tabs = ['Journal', 'Analytics', 'Review'] as const;

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0F1724' : '#E2E8F0' }]}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab;
        return (
          <Pressable 
            key={tab} 
            style={styles.tabBtn} 
            onPress={() => setActiveTab(tab)}
          >
            {isActive && (
              <LinearGradient
                colors={isDark ? ['#007ACC', '#005999'] : ['#007ACC', '#005999']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[StyleSheet.absoluteFillObject, { borderRadius: 10 }]}
              />
            )}
            <Text style={[
              styles.tabText, 
              { color: isDark ? '#94A3B8' : '#64748B' },
              isActive && styles.tabTextActive
            ]}>
              {tab}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    marginBottom: 20,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    overflow: 'hidden',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  }
});
