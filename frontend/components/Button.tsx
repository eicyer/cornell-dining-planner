import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, interaction, radius, space, touchTarget, type } from '../theme';

type ButtonVariant = 'solid' | 'outline';

// Solid = primary CTA (Log this meal, Save, Sign in). Outline reuses the
// same accent hue for the one "done/confirmed" state (e.g. "Logged ✓") —
// Design.md deliberately never introduces a second color for that.
export default function Button({
  label,
  onPress,
  variant = 'solid',
  disabled = false,
  fullWidth = true,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        variant === 'outline' ? styles.outline : styles.solid,
        // The gray "can't act yet" treatment only applies to solid buttons.
        // Outline is always the deliberate "done/confirmed" look (e.g.
        // "Logged ✓") — that state is disabled (non-interactive) but must
        // never look grayed-out/broken.
        disabled && variant !== 'outline' && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.text, variant === 'outline' && styles.textOutline]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.none,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget.min,
  },
  fullWidth: { alignSelf: 'stretch' },
  solid: { backgroundColor: colors.accent },
  outline: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.accent },
  disabled: { backgroundColor: colors.disabled },
  pressed: { opacity: interaction.pressedOpacity },
  text: { ...type.button },
  textOutline: { color: colors.accent },
});
