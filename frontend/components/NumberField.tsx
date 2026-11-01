import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { light } from '../haptics';
import { colors, interaction, radius, space, touchTarget, type } from '../theme';

// A bordered 1px square, matching PortionStepper's existing +/- idiom rather
// than introducing a second stepper look. 32pt + 10 hitSlop = 52pt tap target.
function StepButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  function handlePress() {
    light();
    onPress();
  }
  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'Increase' : 'Decrease'}
      style={({ pressed }) => [styles.stepButton, pressed && styles.stepButtonPressed]}
    >
      <Text style={[styles.stepButtonText, disabled && styles.stepButtonTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

export default function NumberField({
  label,
  value,
  onChange,
  decimal,
  caption,
  step,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  suffix,
  compact,
}: {
  // Optional when a shared label sits above several fields (e.g. ft + in).
  label?: string;
  value: number | null;
  onChange: (v: number) => void;
  decimal?: boolean;
  caption?: string;
  // Present on the target fields, where nudging by a sensible increment beats
  // selecting text and retyping a four-digit number on a phone. Omitted on the
  // body-stat fields, which are typed once and never adjusted by feel.
  step?: number;
  min?: number;
  max?: number;
  // A unit set right after the value ("ft", "lb"), so the field says what it
  // holds without relying on its label.
  suffix?: string;
  // Narrow input for short values like feet and inches.
  compact?: boolean;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <View style={styles.field}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.numberRow}>
        {step != null && (
          <StepButton label="–" onPress={() => onChange(clamp((value ?? 0) - step))} disabled={(value ?? 0) <= min} />
        )}
        <TextInput
          style={[styles.numberInput, step != null && styles.numberInputStepped, compact && styles.numberInputCompact]}
          keyboardType={decimal ? 'decimal-pad' : 'numeric'}
          value={value == null ? '' : String(value)}
          onChangeText={(text) => {
            const cleaned = decimal ? text.replace(/[^0-9.]/g, '') : text.replace(/[^0-9]/g, '');
            onChange(Number(cleaned) || 0);
          }}
        />
        {suffix && <Text style={styles.suffix}>{suffix}</Text>}
        {step != null && (
          <StepButton label="+" onPress={() => onChange(clamp((value ?? 0) + step))} disabled={(value ?? 0) >= max} />
        )}
      </View>
      {caption && <Text style={styles.fieldCaption}>{caption}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: space.md },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  numberInput: {
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    borderRadius: radius.none,
    paddingVertical: space.sm,
    // Direct backstop for the 44pt touch-target minimum — see Phase 6 audit
    // (same reasoning as EateryDetailScreen's gramsInput).
    minHeight: touchTarget.min,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 17,
    color: colors.ink,
    width: 120,
  },
  // Narrower once flanked by +/- buttons, so the whole control still fits a
  // narrow phone without the row wrapping.
  numberInputStepped: { width: 84, textAlign: 'center' },
  numberInputCompact: { width: 56, textAlign: 'center' },
  suffix: { ...type.mono, color: colors.inkSecondary, marginLeft: -space.xs },
  stepButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.ink,
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  stepButtonPressed: { opacity: interaction.pressedOpacity },
  stepButtonText: { fontFamily: 'IBMPlexMono_500Medium', fontSize: 18, lineHeight: 20, color: colors.ink },
  stepButtonTextDisabled: { color: colors.inkTertiary },
  label: { ...type.kicker, marginTop: space.sm, marginBottom: space.sm },
  fieldCaption: { ...type.caption, marginTop: space.xs },
});
