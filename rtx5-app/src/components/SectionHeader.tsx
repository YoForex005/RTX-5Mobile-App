import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

type SectionHeaderProps = {
  title: string;
  rightLabel?: string;
};

export function SectionHeader({ title, rightLabel = '•••' }: SectionHeaderProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.dots}>{rightLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#0b0f17',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1b2130',
  },
  title: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
  },
  dots: {
    color: '#7f8795',
    fontSize: 13,
    letterSpacing: 0.4,
  },
});
