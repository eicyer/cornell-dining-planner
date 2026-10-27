import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { UnitSystem } from '../api';
import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg } from '../units';
import NumberField from './NumberField';
import { interaction, space, type, colors } from '../theme';

export type BodyStatsChange = { height_cm?: number; weight_kg?: number; unit_system?: UnitSystem };

// Height and weight with their units in the fields ("5 ft 9 in", "150 lb")
// and the units switch on the Height row, where people look for it. Shared
// by Setup and Preferences. Storage stays metric either way; the ft/in/lb
// values here only exist to display and edit it.
export default function BodyStatsFields({
  heightCm,
  weightKg,
  unitSystem,
  onChange,
}: {
  heightCm: number | null;
  weightKg: number | null;
  unitSystem: UnitSystem;
  onChange: (change: BodyStatsChange) => void;
}) {
  const [feet, setFeet] = useState<number | null>(() => (heightCm ? cmToFeetInches(heightCm).feet : null));
  const [inches, setInches] = useState<number | null>(() => (heightCm ? cmToFeetInches(heightCm).inches : null));
  const [pounds, setPounds] = useState<number | null>(() => (weightKg ? kgToLb(weightKg) : null));
  const imperial = unitSystem === 'imperial';

  // Switching to imperial re-derives ft/in/lb from the stored metric values,
  // so a number typed in cm/kg shows up converted rather than stale.
  function switchUnits() {
    if (!imperial) {
      setFeet(heightCm ? cmToFeetInches(heightCm).feet : null);
      setInches(heightCm ? cmToFeetInches(heightCm).inches : null);
      setPounds(weightKg ? kgToLb(weightKg) : null);
    }
    onChange({ unit_system: imperial ? 'metric' : 'imperial' });
  }

  return (
    <View>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Height</Text>
        <Pressable
          onPress={switchUnits}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.switch}>{imperial ? 'Use cm · kg' : 'Use ft · lb'}</Text>
        </Pressable>
      </View>
      {imperial ? (
        <View style={styles.row}>
          <NumberField
            compact
            suffix="ft"
            value={feet}
            onChange={(v) => {
              setFeet(v);
              onChange({ height_cm: feetInchesToCm(v, inches ?? 0) });
            }}
          />
          <NumberField
            compact
            suffix="in"
            value={inches}
            max={11}
            onChange={(v) => {
              setInches(v);
              onChange({ height_cm: feetInchesToCm(feet ?? 0, v) });
            }}
          />
        </View>
      ) : (
        <NumberField decimal suffix="cm" value={heightCm} onChange={(v) => onChange({ height_cm: v })} />
      )}
      <Text style={styles.caption}>{imperial ? 'e.g. 5 ft 9 in · 3 ft 11 in – 7 ft 6 in' : '120–230 cm'}</Text>

      <Text style={styles.label}>Weight</Text>
      {imperial ? (
        <NumberField
          suffix="lb"
          value={pounds}
          onChange={(v) => {
            setPounds(v);
            onChange({ weight_kg: lbToKg(v) });
          }}
        />
      ) : (
        <NumberField decimal suffix="kg" value={weightKg} onChange={(v) => onChange({ weight_kg: v })} />
      )}
      <Text style={styles.caption}>{imperial ? '66–661 lb' : '30–300 kg'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...type.kicker, marginTop: space.sm, marginBottom: space.sm },
  switch: { ...type.kicker, color: colors.accent },
  pressed: { opacity: interaction.pressedOpacity },
  row: { flexDirection: 'row', gap: space.xl },
  // NumberField's own bottom margin sits above this, so pull it up to read as
  // the fields' caption rather than a separate line.
  caption: { ...type.caption, marginTop: -space.sm, marginBottom: space.md },
});
