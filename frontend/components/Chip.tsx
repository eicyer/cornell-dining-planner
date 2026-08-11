import { Pressable, StyleSheet, Text } from 'react-native';
import { selection } from '../haptics';
import { colors, space, type } from '../theme';

// Flat text + accent underline, no fill/border-box — mirrors Tab.tsx's idiom
// per Design.md. Visual size stays compact (the app's whole density depends
// on it); the 44pt touch-target minimum is met via hitSlop instead of
// growing the chip itself, so tap accuracy improves without bloating the
// layout. Asymmetric slop (more vertical than horizontal) avoids swallowing
// taps meant for the next chip over in a wrapped row.
export default function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  function handlePress() {
    selection();
    onPress();
  }
  return (
    <Pressable
      onPress={handlePress}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label.replace('_', ' ')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    paddingVertical: space.xs,
    marginRight: space.xs,
    marginBottom: space.xs,
  },
  chipSelected: { borderBottomColor: colors.accent },
  chipText: { ...type.body, fontSize: 13, color: colors.inkSecondary, textTransform: 'capitalize' },
  chipTextSelected: { color: colors.ink, fontFamily: 'Archivo_600SemiBold' },
});
