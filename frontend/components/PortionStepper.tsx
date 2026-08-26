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
          onPress={() => onChange(stepPortionGrams({ name }, grams, -1))}
          hitSlop={10}
          style={styles.stepButtonPrimary}
          disabled={disabled || grams <= 0}
        >
          <Text
            style={[styles.stepButtonPrimaryText, (disabled || grams <= 0) && styles.stepButtonTextDisabled]}
          >
            –
          </Text>
        </Pressable>
        <Text style={[styles.portionLabel, disabled && styles.stepButtonTextDisabled]} numberOfLines={1}>
          {portionLabel}
        </Text>
        <Pressable
          onPress={() => onChange(stepPortionGrams({ name }, grams, 1))}
          hitSlop={10}
          style={styles.stepButtonPrimary}
          disabled={disabled}
        >
          <Text style={[styles.stepButtonPrimaryText, disabled && styles.stepButtonTextDisabled]}>+</Text>
        </Pressable>
      </View>
      <View style={[styles.row, styles.gramsRow]}>
        <Pressable
          onPress={() => onChange(Math.max(0, grams - step))}
          hitSlop={10}
          style={styles.stepButtonSecondary}
          disabled={disabled || grams <= 0}
        >
          <Text
            style={[styles.stepButtonSecondaryText, (disabled || grams <= 0) && styles.stepButtonTextDisabled]}
          >
            –
          </Text>
        </Pressable>
        <TextInput
          style={styles.gramsInput}
          keyboardType="numeric"
          value={String(Math.round(grams))}
          editable={!disabled}
          onChangeText={(t) => onChange(Math.max(0, Number(t.replace(/[^0-9]/g, '')) || 0))}
        />
        <Pressable
          onPress={() => onChange(grams + step)}
          hitSlop={10}
          style={styles.stepButtonSecondary}
          disabled={disabled}
        >
          <Text style={[styles.stepButtonSecondaryText, disabled && styles.stepButtonTextDisabled]}>+</Text>
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
  gramsRow: { marginTop: 3 },
  stepButtonPrimary: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  stepButtonPrimaryText: { fontFamily: 'IBMPlexMono_500Medium', fontSize: 18, color: colors.ink, lineHeight: 19 },
  stepButtonSecondary: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.inkSecondary,
  },
  stepButtonSecondaryText: {
    fontFamily: 'IBMPlexMono_500Medium',
    fontSize: 11,
    color: colors.inkSecondary,
    lineHeight: 12,
  },
  stepButtonTextDisabled: { color: colors.inkTertiary },
  gramsInput: {
    borderBottomWidth: 1,
    borderBottomColor: colors.inkSecondary,
    borderRadius: radius.none,
    width: 36,
    textAlign: 'center',
    paddingVertical: 1,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 11,
    color: colors.inkSecondary,
  },
  portionLabel: {
    fontFamily: 'IBMPlexMono_500Medium',
    fontSize: 16,
    color: colors.ink,
    minWidth: 76,
    textAlign: 'center',
  },
  caption: { ...type.caption, marginTop: 2 },
});
