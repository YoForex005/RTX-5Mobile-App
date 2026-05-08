import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../ui/theme/useTheme';
import { useUserPreferences } from '../../../state/userPreferences';
import { Screen } from '../../../ui/components/Screen';
import { makeJournalStyles } from './styles';
import { MOCK_TRADES } from './mockData';
import { TradeJournalEntry } from './types';
import { fmt } from '../../../utils/format';

import { JournalTabs } from './components/JournalTabs';
import { AnalyticsTab } from './components/AnalyticsTab';
import { ReviewTab } from './components/ReviewTab';
import { TradeDetailDrawer } from './components/TradeDetailDrawer';
import { AddTradeModal } from './components/AddTradeModal';

export function JournalScreen() {
  const T = useTheme();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeJournalStyles(T, isDark), [T, isDark]);
  
  const [trades, setTrades] = useState<TradeJournalEntry[]>(MOCK_TRADES);
  const [activeTab, setActiveTab] = useState<'Journal' | 'Analytics' | 'Review'>('Journal');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<TradeJournalEntry | null>(null);

  // Stats calculation
  const totalTrades = trades.length;
  const winTrades = trades.filter(t => t.result === 'Win').length;
  const winRate = totalTrades > 0 ? Math.round((winTrades / totalTrades) * 100) : 0;
  const totalPnl = trades.reduce((sum, t) => sum + (t.pnlMoney || 0), 0);
  const avgR = trades.reduce((sum, t) => sum + (t.finalRMultiple || 0), 0) / (totalTrades || 1);

  const renderStatCard = (title: string, value: string, sub?: string, isPos?: boolean, isNeg?: boolean) => (
    <View style={styles.statCardWrap}>
      <View style={styles.statCard}>
        <Text style={styles.statTitle}>{title}</Text>
        <Text style={[styles.statValue, isPos && styles.statPos, isNeg && styles.statNeg]}>{value}</Text>
        {sub && <Text style={styles.statSub}>{sub}</Text>}
      </View>
    </View>
  );

  return (
    <Screen style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        
        {/* TOP TABS */}
        <JournalTabs activeTab={activeTab} setActiveTab={setActiveTab} isDark={isDark} />

        {activeTab === 'Journal' && (
          <>
            {/* STATS HERO */}
            <View style={styles.heroGrid}>
              {renderStatCard('WIN RATE', `${winRate}%`, `${winTrades}/${totalTrades} Trades`)}
              {renderStatCard('NET P&L', fmt.price(totalPnl), undefined, totalPnl > 0, totalPnl < 0)}
              {renderStatCard('AVG R MULTIPLE', `${avgR.toFixed(1)}R`, 'Per Trade')}
              {renderStatCard('DISCIPLINE', '6.0', 'Average Score')}
            </View>

            {/* ACTIONS */}
            <View style={styles.actionRow}>
              <Pressable style={styles.addBtn} onPress={() => setIsAddModalOpen(true)}>
                <Ionicons name="add" size={20} color="#FFFFFF" />
                <Text style={styles.addBtnText}>New Trade</Text>
              </Pressable>
              <Pressable style={styles.filterBtn}>
                <Ionicons name="filter-outline" size={20} color={isDark ? '#F8FAFC' : '#0F172A'} />
              </Pressable>
            </View>

            {/* TABLE */}
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <View style={styles.colDate}><Text style={styles.headerText}>Date/Time</Text></View>
                <View style={styles.colSymbol}><Text style={styles.headerText}>Symbol</Text></View>
                <View style={styles.colResult}><Text style={styles.headerText}>Result</Text></View>
                <View style={styles.colPnl}><Text style={styles.headerText}>P&L</Text></View>
              </View>
              
              {trades.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconWrap}>
                    <Ionicons name="reader-outline" size={24} color={isDark ? '#94A3B8' : '#64748B'} />
                  </View>
                  <Text style={styles.emptyText}>No trades logged yet.</Text>
                </View>
              ) : (
                trades.map((trade) => {
                  const dt = new Date(trade.date);
                  const isWin = trade.result === 'Win';
                  return (
                    <Pressable key={trade.id} style={styles.row} onPress={() => setSelectedTrade(trade)}>
                      <View style={styles.colDate}>
                        <Text style={styles.cellText}>{dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
                        <Text style={styles.cellSub}>{dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      <View style={styles.colSymbol}>
                        <Text style={styles.cellText}>{trade.symbol}</Text>
                        <Text style={styles.cellSub}>{trade.tradeType}</Text>
                      </View>
                      <View style={styles.colResult}>
                        <View style={[styles.badge, isWin ? styles.badgeWin : styles.badgeLoss]}>
                          <Text style={isWin ? styles.badgeTextWin : styles.badgeTextLoss}>{trade.result}</Text>
                        </View>
                      </View>
                      <View style={styles.colPnl}>
                        <Text style={isWin ? styles.pnlPos : styles.pnlNeg}>
                          {isWin ? '+' : ''}{fmt.price(trade.pnlMoney || 0)}
                        </Text>
                        <Text style={styles.cellSub}>{isWin ? '+' : ''}{trade.finalRMultiple}R</Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          </>
        )}

        {activeTab === 'Analytics' && <AnalyticsTab isDark={isDark} />}
        
        {activeTab === 'Review' && <ReviewTab isDark={isDark} />}

      </ScrollView>

      {/* FULL ADD TRADE MODAL */}
      {isAddModalOpen && (
        <AddTradeModal onClose={() => setIsAddModalOpen(false)} isDark={isDark} />
      )}

      {/* TRADE DETAIL DRAWER */}
      {selectedTrade && (
        <TradeDetailDrawer trade={selectedTrade} onClose={() => setSelectedTrade(null)} isDark={isDark} />
      )}
    </Screen>
  );
}
