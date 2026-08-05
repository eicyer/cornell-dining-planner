import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  ACTIVITY_LEVELS,
  ActivityLevel,
  ALLERGENS,
  DIET_TAGS,
  HEALTH_GOALS,
  HealthGoal,
  MACRO_STYLES,
  MacroStyle,
  Preferences,
  RecommendedTargets,
  Sex,
  putPreferences,
  recommendTargets,
} from './api';
import { colors, radius, space, type } from './theme';

const DEFAULTS: Preferences = {
  calorie_goal: 2200,
  protein_goal_g: 150,
  carb_goal_g: 220,
  fat_goal_g: 70,
  meals_per_day: 3,
  diet_restrictions: [],
  allergens: [],
  age: null,
  sex: null,
  height_cm: null,
  weight_kg: null,
  activity_level: null,
  health_goal: null,
  macro_style: null,
  target_mode: 'manual',
  liked_foods_text: '',
  disliked_foods_text: '',
  liked_tags: [],
  disliked_tags: [],
  prefer_whole_foods: false,
};

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary',
  light: 'Light (1–3x/wk)',
  moderate: 'Moderate (3–5x/wk)',
  active: 'Active (6–7x/wk)',
  very_active: 'Very active',
};

const HEALTH_GOAL_LABELS: Record<HealthGoal, string> = {
  lose_weight: 'Lose weight',
  maintain_weight: 'Maintain weight',
  gain_weight: 'Gain weight',
};

const MACRO_STYLE_LABELS: Record<MacroStyle, string> = {
  balanced: 'Balanced',
  lower_carb: 'Lower carb',
};

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label.replace('_', ' ')}</Text>
    </Pressable>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function NumberField({
  label,
  value,
  onChange,
  decimal,
  caption,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  decimal?: boolean;
  caption?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.numberInput}
        keyboardType={decimal ? 'decimal-pad' : 'numeric'}
        value={value == null ? '' : String(value)}
        onChangeText={(text) => {
          const cleaned = decimal ? text.replace(/[^0-9.]/g, '') : text.replace(/[^0-9]/g, '');
          onChange(Number(cleaned) || 0);
        }}
      />
      {caption && <Text style={styles.fieldCaption}>{caption}</Text>}
    </View>
  );
}

export default function PreferencesForm({
  initial,
  onSaved,
}: {
  initial?: Preferences | null;
  onSaved: (prefs: Preferences) => void;
}) {
  const isUpdate = !!initial;
  const [prefs, setPrefs] = useState<Preferences>(initial ?? DEFAULTS);
  const [targetTab, setTargetTab] = useState<'recommend' | 'manual'>(
    (initial ?? DEFAULTS).target_mode === 'recommended' ? 'recommend' : 'manual'
  );
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [calcResult, setCalcResult] = useState<RecommendedTargets | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function switchTab(tab: 'recommend' | 'manual') {
    setTargetTab(tab);
    if (tab === 'manual') {
      setPrefs((p) => ({ ...p, target_mode: 'manual' }));
    }
  }

  async function handleCalculate() {
    setCalcError(null);
    if (!prefs.age || !prefs.sex || !prefs.height_cm || !prefs.weight_kg || !prefs.activity_level || !prefs.health_goal) {
      setCalcError('Fill in age, sex, height, weight, activity level, and goal first.');
      return;
    }
    setCalculating(true);
    try {
      const result = await recommendTargets({
        age: prefs.age,
        sex: prefs.sex,
        height_cm: prefs.height_cm,
        weight_kg: prefs.weight_kg,
        activity_level: prefs.activity_level,
        health_goal: prefs.health_goal,
        macro_style: prefs.macro_style ?? 'balanced',
      });
      setCalcResult(result);
      setPrefs((p) => ({
        ...p,
        calorie_goal: result.calorie_goal,
        protein_goal_g: result.protein_goal_g,
        carb_goal_g: result.carb_goal_g,
        fat_goal_g: result.fat_goal_g,
        target_mode: 'recommended',
      }));
    } catch (err: any) {
      setCalcError(err.message);
    } finally {
      setCalculating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const saved = await putPreferences(prefs);
      onSaved(saved);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{isUpdate ? 'Update your targets' : 'Set your targets'}</Text>
      <Text style={styles.subtitle}>
        Tell us your eating style and health goal, or enter exact numbers yourself — daily targets get split across
        your meals.
      </Text>

      <Text style={styles.label}>How should we set your targets?</Text>
      <View style={styles.tabRow}>
        <Tab label="Recommend for me" active={targetTab === 'recommend'} onPress={() => switchTab('recommend')} />
        <Tab label="Enter my own numbers" active={targetTab === 'manual'} onPress={() => switchTab('manual')} />
      </View>

      {targetTab === 'recommend' ? (
        <View style={styles.recommendPanel}>
          <Text style={styles.helperText}>
            We estimate your calories and macros from your stats (Mifflin-St Jeor BMR × activity level), adjusted
            for your goal. We never recommend below 1200–1500 cal or above 4500 cal.
          </Text>

          <NumberField label="Age" value={prefs.age} caption="13–100" onChange={(v) => setPrefs({ ...prefs, age: v })} />
          <NumberField
            label="Height (cm)"
            decimal
            value={prefs.height_cm}
            caption="120–230 cm"
            onChange={(v) => setPrefs({ ...prefs, height_cm: v })}
          />
          <NumberField
            label="Weight (kg)"
            decimal
            value={prefs.weight_kg}
            caption="30–300 kg"
            onChange={(v) => setPrefs({ ...prefs, weight_kg: v })}
          />

          <Text style={styles.label}>Sex</Text>
          <Text style={styles.fieldCaption}>Used only for the calorie formula above.</Text>
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

          <Text style={styles.label}>Health goal</Text>
          <View style={styles.chipRow}>
            {HEALTH_GOALS.map((goal) => (
              <Chip
                key={goal}
                label={HEALTH_GOAL_LABELS[goal]}
                selected={prefs.health_goal === goal}
                onPress={() => setPrefs({ ...prefs, health_goal: goal })}
              />
            ))}
          </View>

          <Text style={styles.label}>Macro style</Text>
          <Text style={styles.fieldCaption}>How calories split across protein/carbs/fat. Protein stays the same either way.</Text>
          <View style={styles.chipRow}>
            {MACRO_STYLES.map((style) => (
              <Chip
                key={style}
                label={MACRO_STYLE_LABELS[style]}
                selected={(prefs.macro_style ?? 'balanced') === style}
                onPress={() => setPrefs({ ...prefs, macro_style: style })}
              />
            ))}
          </View>

          {calcError && <Text style={styles.error}>{calcError}</Text>}

          <Pressable style={styles.calcButton} onPress={handleCalculate} disabled={calculating}>
            <Text style={styles.calcButtonText}>{calculating ? 'Calculating…' : 'Calculate my targets →'}</Text>
          </Pressable>

          {calcResult && (
            <Text style={styles.calcResult}>
              BMR {calcResult.bmr} cal · TDEE {calcResult.tdee} cal/day — targets below are filled in, edit them
              freely.
            </Text>
          )}
        </View>
      ) : (
        <Text style={styles.helperText}>Enter your own daily calorie and macro targets below.</Text>
      )}

      <Text style={[styles.label, styles.dailyTargetsLabel]}>Daily targets</Text>
      <NumberField label="Calories" value={prefs.calorie_goal} onChange={(v) => setPrefs({ ...prefs, calorie_goal: v })} />
      <NumberField label="Protein (g)" value={prefs.protein_goal_g} onChange={(v) => setPrefs({ ...prefs, protein_goal_g: v })} />
      <NumberField label="Carbs (g)" value={prefs.carb_goal_g} onChange={(v) => setPrefs({ ...prefs, carb_goal_g: v })} />
      <NumberField label="Fat (g)" value={prefs.fat_goal_g} onChange={(v) => setPrefs({ ...prefs, fat_goal_g: v })} />
      <NumberField label="Meals per day" value={prefs.meals_per_day} onChange={(v) => setPrefs({ ...prefs, meals_per_day: v })} />

      <Text style={styles.label}>Diet restrictions</Text>
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

      <Text style={styles.label}>Food quality</Text>
      <View style={styles.chipRow}>
        <Chip
          label="Prefer whole & minimally processed foods"
          selected={prefs.prefer_whole_foods}
          onPress={() => setPrefs({ ...prefs, prefer_whole_foods: !prefs.prefer_whole_foods })}
        />
      </View>

      <Text style={styles.label}>Foods you like</Text>
      <TextInput
        style={styles.textArea}
        multiline
        placeholder="e.g. chicken, spicy food, Asian flavors"
        placeholderTextColor={colors.inkTertiary}
        value={prefs.liked_foods_text ?? ''}
        onChangeText={(text) => setPrefs({ ...prefs, liked_foods_text: text })}
      />

      <Text style={styles.label}>Foods you dislike</Text>
      <TextInput
        style={styles.textArea}
        multiline
        placeholder="e.g. mushrooms, seafood"
        placeholderTextColor={colors.inkTertiary}
        value={prefs.disliked_foods_text ?? ''}
        onChangeText={(text) => setPrefs({ ...prefs, disliked_foods_text: text })}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveButtonText}>
          {saving ? 'Saving…' : isUpdate ? 'Save changes →' : 'Save & see meals →'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 40 },
  title: { fontFamily: 'Fraunces_700Bold', fontSize: 26, lineHeight: 32, color: colors.ink, marginBottom: space.xs },
  subtitle: { ...type.body, color: colors.inkSecondary, marginBottom: space.xl },
  field: { marginBottom: space.md },
  label: { ...type.kicker, marginTop: space.sm, marginBottom: space.sm },
  dailyTargetsLabel: { marginTop: space.xl },
  fieldCaption: { ...type.caption, marginTop: space.xs },
  helperText: { ...type.body, color: colors.inkSecondary, marginBottom: space.md },
  numberInput: {
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    borderRadius: radius.none,
    paddingVertical: space.sm,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 17,
    color: colors.ink,
    width: 120,
  },
  textArea: {
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    borderRadius: radius.none,
    paddingVertical: space.sm,
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    color: colors.ink,
    minHeight: 52,
    textAlignVertical: 'top',
  },
  tabRow: { flexDirection: 'row', gap: space.lg, marginBottom: space.lg },
  tab: { borderBottomWidth: 2, borderBottomColor: 'transparent', paddingBottom: space.xs },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { ...type.kicker, color: colors.inkTertiary },
  tabTextActive: { color: colors.ink },
  recommendPanel: { marginBottom: space.sm },
  calcButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.none,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: space.md,
  },
  calcButtonText: { ...type.button },
  calcResult: { ...type.mono, marginTop: space.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginBottom: space.md },
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
  error: { ...type.body, color: colors.accent, marginTop: space.md },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.none,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: space.xl,
  },
  saveButtonText: { ...type.button },
});
