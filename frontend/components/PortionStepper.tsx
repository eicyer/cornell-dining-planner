import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { describePortion, getPortionUnit, stepPortionGrams } from '../foodDensity';
import { colors, radius, space, type } from '../theme';

// Step size is half the suggested portion — so tapping +/- moves through the
// "0.5, 1, 1.5, 2, 3..." multiples of the suggestion a user actually thinks
// in, rather than an arbitrary gram increment. The gram figure itself stays
// directly editable for anyone who wants an exact number instead.
const STEP_FRACTION = 0.5;

function formatMultiplier(originalGrams: number, grams: number): string {
  if (originalGrams <= 0) return '';
  const rounded = Math.round((grams / originalGrams) * 2) / 2;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}×`;
}

export default function PortionStepper({
  name,
  originalGrams,
  grams,
  onChange,
  disabled = false,
}: {
  name: string;
  originalGrams: number;
  grams: number;
  onChange: (grams: number) => void;
  disabled?: boolean;
}) {
  const step = Math.max(5, Math.round(originalGrams * STEP_FRACTION));
  const unit = getPortionUnit({ name });
  // Portion buttons and the grams TextInput both write the same `grams`
  // via the same onChange — that's what keeps the two rows in sync no
  // matter which one the user adjusts.
  const portionLabel = describePortion({ name, grams }) || `0 ${unit.pluralLabel}`;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Pressable
          onPress={() => onChange(Math.max(0, grams - step))}
          hitSlop={10}
          style={styles.stepButton}
          disabled={disabled || grams <= 0}
        >
          <Text style={[styles.stepButtonText, (disabled || grams <= 0) && styles.stepButtonTextDisabled]}>–</Text>
        </Pressable>
        <TextInput
          style={styles.gramsInput}
          keyboardType="numeric"
          value={String(Math.round(grams))}
          editable={!disabled}
          onChangeText={(t) => onChange(Math.max(0, Number(t.replace(/[^0-9]/g, '')) || 0))}
        />
        <Pressable onPress={() => onChange(grams + step)} hitSlop={10} style={styles.stepButton} disabled={disabled}>
          <Text style={[styles.stepButtonText, disabled && styles.stepButtonTextDisabled]}>+</Text>
        </Pressable>
      </View>
      <View style={[styles.row, styles.portionRow]}>
        <Pressable
          onPress={() => onChange(stepPortionGrams({ name }, grams, -1))}
          hitSlop={10}
          style={styles.stepButton}
          disabled={disabled || grams <= 0}
        >
          <Text style={[styles.stepButtonText, (disabled || grams <= 0) && styles.stepButtonTextDisabled]}>–</Text>
        </Pressable>
        <Text style={[styles.portionLabel, disabled && styles.stepButtonTextDisabled]} numberOfLines={1}>
          {portionLabel}
        </Text>
        <Pressable
          onPress={() => onChange(stepPortionGrams({ name }, grams, 1))}
          hitSlop={10}
          style={styles.stepButton}
          disabled={disabled}
        >
          <Text style={[styles.stepButtonText, disabled && styles.stepButtonTextDisabled]}>+</Text>
        </Pressable>
      </View>
      <Text style={styles.caption} numberOfLines={1}>
        {formatMultiplier(originalGrams, grams)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  portionRow: { marginTop: 2 },
  stepButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.ink,
  },
  stepButtonText: { fontFamily: 'IBMPlexMono_500Medium', fontSize: 15, color: colors.ink, lineHeight: 16 },
  stepButtonTextDisabled: { color: colors.inkTertiary },
  gramsInput: {
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    borderRadius: radius.none,
    width: 44,
    textAlign: 'center',
    paddingVertical: 2,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 14,
    color: colors.ink,
  },
  portionLabel: {
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 12,
    color: colors.inkSecondary,
    minWidth: 64,
    textAlign: 'center',
  },
  caption: { ...type.caption, marginTop: 2 },
});
