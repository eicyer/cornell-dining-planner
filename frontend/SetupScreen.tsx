import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ACTIVITY_LEVELS,
  ALLERGENS,
  DIET_TAGS,
  HEALTH_GOALS,
  Preferences,
  RecommendedTargets,
  Sex,
  UnitSystem,
  WEEKLY_PACES_KG,
  putPreferences,
  recommendTargets,
} from './api';
import {
  ACTIVITY_LABELS,
  DEFAULT_PREFERENCES,
  HEALTH_GOAL_LABELS,
  floorMessage,
  paceForGoal,
  paceLabel,
} from './goals';
import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg } from './units';
import Button from './components/Button';
import Chip from './components/Chip';
import NumberField from './components/NumberField';
import Tab from './components/Tab';
import { colors, interaction, space, type } from './theme';

// First run for a user with no saved preferences (docs/adr/0031): their goal,
// then optional Hard Constraints, then the Diary. Everything else in
// Preferences keeps its default until they open it from More.

const round = (n: number) => Math.round(n).toLocaleString('en-US');

// The ranges PUT /preferences accepts; outside them there's nothing to
// recommend yet, so the live estimate just waits.
function statsInRange(p: Preferences): boolean {
  return (
    p.age != null && p.age >= 13 && p.age <= 100 &&
    p.height_cm != null && p.height_cm >= 120 && p.height_cm <= 230 &&
    p.weight_kg != null && p.weight_kg >= 30 && p.weight_kg <= 300
  );
}

export default function SetupScreen({
  onDone,
  onManual,
}: {
  onDone: (prefs: Preferences) => void;
  onManual: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [heightFeet, setHeightFeet] = useState<number | null>(null);
  const [heightInches, setHeightInches] = useState<number | null>(null);
  const [weightLb, setWeightLb] = useState<number | null>(null);
  const [result, setResult] = useState<RecommendedTargets | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unitSystem = prefs.unit_system;
  const ready =
    statsInRange(prefs) && prefs.sex != null && prefs.activity_level != null && prefs.health_goal != null;

  // Re-estimates as soon as every input is in, so the number is on screen
  // before "Next" rather than behind a "Calculate" button.
  useEffect(() => {
    if (!ready) {
      setResult(null);
      return;
    }
    let cancelled = false;
    recommendTargets({
      age: prefs.age!,
      sex: prefs.sex!,
      height_cm: prefs.height_cm!,
      weight_kg: prefs.weight_kg!,
      activity_level: prefs.activity_level!,
      health_goal: prefs.health_goal!,
      macro_style: 'balanced',
      weekly_pace_kg: prefs.weekly_pace_kg,
    })
      .then((r) => !cancelled && setResult(r))
      .catch((err: any) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [ready, prefs.age, prefs.sex, prefs.height_cm, prefs.weight_kg, prefs.activity_level, prefs.health_goal, prefs.weekly_pace_kg]);

  function switchUnitSystem(system: UnitSystem) {
    if (system === 'imperial') {
      const { feet, inches } = prefs.height_cm ? cmToFeetInches(prefs.height_cm) : { feet: null, inches: null };
      setHeightFeet(feet);
      setHeightInches(inches);
      setWeightLb(prefs.weight_kg ? kgToLb(prefs.weight_kg) : null);
    }
    setPrefs((p) => ({ ...p, unit_system: system }));
  }

  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  async function save(withConstraints: boolean) {
    if (!result) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await putPreferences({
        ...prefs,
        diet_restrictions: withConstraints ? prefs.diet_restrictions : [],
        allergens: withConstraints ? prefs.allergens : [],
        calorie_goal: result.calorie_goal,
        protein_goal_g: result.protein_goal_g,
        carb_goal_g: result.carb_goal_g,
        fat_goal_g: result.fat_goal_g,
        macro_style: 'balanced',
        target_mode: 'recommended',
      });
      onDone(saved);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (step === 2) {
    return (
      <View style={styles.container}>
        <Text style={styles.kicker}>Step 2 of 2</Text>
        <Text style={styles.title}>Anything you can't eat?</Text>
        <Text style={styles.subtitle}>
          Suggested meals will leave these out. Logging works the same either way, and you can change them later in
          More.
        </Text>

        <Text style={styles.label}>Diet</Text>
        <View style={styles.chipRow}>
          {DIET_TAGS.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              selected={prefs.diet_restrictions.includes(tag)}
              onPress={() => setPrefs({ ...prefs, diet_restrictions: toggle(prefs.diet_restrictions, tag) })}
            />
          ))}
        </View>

        <Text style={styles.label}>Allergens to avoid</Text>
        <Text style={styles.caption}>
          Allergen tags are AI-estimated from menu item names, not verified by dining staff. Always double-check in
          person if a reaction would be serious.
        </Text>
        <View style={styles.chipRow}>
          {ALLERGENS.map((a) => (
            <Chip
              key={a}
              label={a}
              selected={prefs.allergens.includes(a)}
              onPress={() => setPrefs({ ...prefs, allergens: toggle(prefs.allergens, a) })}
            />
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Button
          label={saving ? 'Saving…' : 'Start my diary →'}
          onPress={() => save(true)}
          disabled={saving}
          style={styles.primary}
        />
        <View style={styles.links}>
          <TextLink label="← Back" onPress={() => setStep(1)} />
          <TextLink label="Skip" onPress={() => save(false)} disabled={saving} />
        </View>
      </View>
    );
  }

  const floor = result && prefs.sex ? floorMessage(result, prefs.sex) : null;
  const paces = prefs.health_goal ? WEEKLY_PACES_KG[prefs.health_goal] : [];

  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>Step 1 of 2</Text>
      <Text style={styles.title}>Set your daily goal</Text>
      <Text style={styles.subtitle}>A few numbers give you a starting calorie budget. You can adjust it anytime.</Text>

      <Text style={styles.label}>Units</Text>
      <View style={styles.tabRow}>
        <Tab label="ft/in · lb" active={unitSystem === 'imperial'} onPress={() => switchUnitSystem('imperial')} />
        <Tab label="cm · kg" active={unitSystem === 'metric'} onPress={() => switchUnitSystem('metric')} />
      </View>

      <NumberField label="Age" value={prefs.age} caption="13–100" onChange={(v) => setPrefs({ ...prefs, age: v })} />

      {unitSystem === 'imperial' ? (
        <>
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <NumberField
                label="Height (ft)"
                value={heightFeet}
                onChange={(feet) => {
                  setHeightFeet(feet);
                  setPrefs((p) => ({ ...p, height_cm: feetInchesToCm(feet, heightInches ?? 0) }));
                }}
              />
            </View>
            <View style={styles.rowItem}>
              <NumberField
                label="Height (in)"
                value={heightInches}
                onChange={(inches) => {
                  setHeightInches(inches);
                  setPrefs((p) => ({ ...p, height_cm: feetInchesToCm(heightFeet ?? 0, inches) }));
                }}
              />
            </View>
          </View>
          <NumberField
            label="Weight (lb)"
            value={weightLb}
            onChange={(lb) => {
              setWeightLb(lb);
              setPrefs((p) => ({ ...p, weight_kg: lbToKg(lb) }));
            }}
          />
        </>
      ) : (
        <>
          <NumberField
            label="Height (cm)"
            decimal
            value={prefs.height_cm}
            onChange={(v) => setPrefs({ ...prefs, height_cm: v })}
          />
          <NumberField
            label="Weight (kg)"
            decimal
            value={prefs.weight_kg}
            onChange={(v) => setPrefs({ ...prefs, weight_kg: v })}
          />
        </>
      )}

      <Text style={styles.label}>Sex</Text>
      <Text style={styles.caption}>Used only for the calorie formula.</Text>
      <View style={styles.chipRow}>
        {(['male', 'female'] as Sex[]).map((s) => (
          <Chip key={s} label={s} selected={prefs.sex === s} onPress={() => setPrefs({ ...prefs, sex: s })} />
        ))}
      </View>

      <Text style={styles.label}>Activity level</Text>
      <View style={styles.chipRow}>
        {ACTIVITY_LEVELS.map((level) => (
          <Chip
            key={level}
            label={ACTIVITY_LABELS[level]}
            selected={prefs.activity_level === level}
            onPress={() => setPrefs({ ...prefs, activity_level: level })}
          />
        ))}
      </View>
      <Text style={styles.caption}>Pick your level without workouts you'll log; logged exercise adds to your budget.</Text>

      <Text style={styles.label}>Goal</Text>
      <View style={styles.chipRow}>
        {HEALTH_GOALS.map((goal) => (
          <Chip
            key={goal}
            label={HEALTH_GOAL_LABELS[goal]}
            selected={prefs.health_goal === goal}
            onPress={() =>
              setPrefs({ ...prefs, health_goal: goal, weekly_pace_kg: paceForGoal(goal, prefs.weekly_pace_kg) })
            }
          />
        ))}
      </View>

      {paces.length > 0 && (
        <>
          <Text style={styles.label}>Weekly pace</Text>
          <View style={styles.chipRow}>
            {paces.map((pace) => (
              <Chip
                key={pace}
                label={paceLabel(pace, unitSystem)}
                selected={prefs.weekly_pace_kg === pace}
                onPress={() => setPrefs({ ...prefs, weekly_pace_kg: pace })}
              />
            ))}
          </View>
        </>
      )}

      {result && (
        <View style={styles.result}>
          <Text style={styles.label}>Your daily budget</Text>
          <Text style={styles.headline}>{round(result.calorie_goal)} cal</Text>
          <Text style={styles.mono}>
            {result.protein_goal_g}g protein · {result.carb_goal_g}g carbs · {result.fat_goal_g}g fat
          </Text>
          {floor && <Text style={styles.caption}>{floor}</Text>}
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Button label="Next →" onPress={() => setStep(2)} disabled={!result} style={styles.primary} />
      <View style={styles.links}>
        <TextLink label="Enter my own numbers instead →" onPress={onManual} />
      </View>
    </View>
  );
}

function TextLink({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
      accessibilityRole="button"
      style={({ pressed }) => [styles.linkWrap, pressed && styles.linkPressed]}
    >
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 40 },
  kicker: { ...type.kicker, color: colors.inkSecondary, marginBottom: space.xs },
  title: { fontFamily: 'Fraunces_700Bold', fontSize: 26, lineHeight: 32, color: colors.ink, marginBottom: space.xs },
  subtitle: { ...type.body, color: colors.inkSecondary, marginBottom: space.lg },
  label: { ...type.kicker, marginTop: space.sm, marginBottom: space.sm },
  caption: { ...type.caption, marginBottom: space.md },
  tabRow: { flexDirection: 'row', gap: space.lg, marginBottom: space.lg },
  row: { flexDirection: 'row', gap: space.md },
  rowItem: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginBottom: space.md },
  result: { borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: space.md, marginTop: space.md },
  // The same large-figure treatment as CalorieSummary's Remaining: numbers are mono (Design.md).
  headline: { ...type.monoEmphasis, fontSize: 28, lineHeight: 34 },
  mono: { ...type.mono, marginTop: space.xs, marginBottom: space.sm },
  primary: { marginTop: space.xl },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
  linkWrap: { paddingVertical: space.sm, marginTop: space.md },
  linkPressed: { opacity: interaction.pressedOpacity },
  link: { ...type.kicker, color: colors.accent },
  error: { ...type.body, color: colors.accent, marginTop: space.md },
});
