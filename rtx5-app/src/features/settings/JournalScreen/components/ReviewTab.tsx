import React from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';

export function ReviewTab({ isDark }: { isDark: boolean }) {
  const cardBg = isDark ? '#111827' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#F8FAFC' : '#0F172A';
  const subText = isDark ? '#64748B' : '#94A3B8';
  const inputBg = isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC';

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: textColor }]}>Weekly / Monthly Review</Text>
      
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <Text style={[styles.cardTitle, { color: textColor }]}>Reflective Journal</Text>
        
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: subText }]}>Overall Performance</Text>
          <TextInput 
            style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]} 
            multiline 
            placeholder="How did I perform against my goals?" 
            placeholderTextColor={subText} 
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: subText }]}>Best Setup & Why</Text>
          <TextInput 
            style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]} 
            multiline 
            placeholder="What trade was my best and why?" 
            placeholderTextColor={subText} 
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: subText }]}>Worst Mistake</Text>
          <TextInput 
            style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]} 
            multiline 
            placeholder="What triggered this mistake?" 
            placeholderTextColor={subText} 
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: subText }]}>Actionable Rules</Text>
          <TextInput 
            style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]} 
            multiline 
            placeholder="3 rules I must follow strictly next week/month." 
            placeholderTextColor={subText} 
          />
        </View>

        <Pressable style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>Save Reflection</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 16 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 16 },
  formGroup: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveBtn: {
    backgroundColor: '#06B6D4',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
