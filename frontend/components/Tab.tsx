import { Pressable, StyleSheet, Text } from 'react-native';
import { selection } from '../haptics';
import { colors, space, type } from '../theme';

// Single-select underline idiom (vs. Chip's multi-select) — used for
// meal-period tabs (EateryDetailScreen) and target-mode tabs
// (PreferencesForm). Same hitSlop rationale as Chip.tsx.
export default function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  function handlePress() {
    if (!active) selection();
    onPress();
  }
  return (
    <Pressable
      onPress={handlePress}
      // paddingVertical(4)*2 + kicker lineHeight(16) = 24px content height —
      // hitSlop 12 clears the 44pt minimum (touchTarget.min); 8 (the
      // original value) landed short at 40px. See Phase 6 ergonomics audit.
      hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tab: { paddingVertical: space.xs, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { ...type.kicker, color: colors.inkTertiary },
  tabTextActive: { color: colors.ink },
});
