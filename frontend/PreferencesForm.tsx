import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  ACTIVITY_LEVELS,
  ActivityLevel,
  ALLERGENS,
  DIET_TAGS,
  EATING_STYLES,
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
import Button from './components/Button';
import Chip from './components/Chip';
import Disclosure from './components/Disclosure';
import Tab from './components/Tab';
import { light } from './haptics';
import { colors, interaction, radius, space, touchTarget, type } from './theme';

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
  eating_styles: [],
  food_survey_completed: false,
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
  keto: 'Keto',
  high_protein: 'High protein',
};

const EATING_STYLE_LABELS: Record<string, string> = {
  low_sugar: 'Less refined sugar',
  high_fiber: 'Emphasize fiber',
  whole_foods_focus: 'Prefer whole & minimally processed foods',
};

// The four disclosure sections, in order. Titles live here so the header
// summaries, the "next section" links, and the step numbers can't drift apart.
const SECTIONS = ['Daily targets', 'Diet & allergens', 'Eating style', 'Foods you like & dislike'] as const;

const round = (n: number) => Math.round(n).toLocaleString('en-US');
const humanize = (s: string) => s.replace(/_/g, ' ');

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

function NumberField({
  label,
  value,
  onChange,
  decimal,
  caption,
  step,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
}: {
  label: string;
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
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.numberRow}>
        {step != null && (
          <StepButton label="–" onPress={() => onChange(clamp((value ?? 0) - step))} disabled={(value ?? 0) <= min} />
        )}
        <TextInput
          style={[styles.numberInput, step != null && styles.numberInputStepped]}
          keyboardType={decimal ? 'decimal-pad' : 'numeric'}
          value={value == null ? '' : String(value)}
          onChangeText={(text) => {
            const cleaned = decimal ? text.replace(/[^0-9.]/g, '') : text.replace(/[^0-9]/g, '');
            onChange(Number(cleaned) || 0);
          }}
        />
        {step != null && (
          <StepButton label="+" onPress={() => onChange(clamp((value ?? 0) + step))} disabled={(value ?? 0) >= max} />
        )}
      </View>
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
  // First-time setup opens section 1 so there's an obvious place to start;
  // returning to edit opens nothing, so the screen is a scannable summary of
  // every existing answer instead of ~400 lines of fields.
  const [openSection, setOpenSection] = useState<number | null>(isUpdate ? null : 0);
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

  // --- Live derived figures, recomputed on every keystroke -----------------

  // 4 cal/g for protein and carbs, 9 for fat. If the three macro targets don't
  // add up to the calorie target the plan is quietly unachievable, which the
  // old form gave you no way to notice.
  const macroCalories = prefs.protein_goal_g * 4 + prefs.carb_goal_g * 4 + prefs.fat_goal_g * 9;
  const macroGap = macroCalories - prefs.calorie_goal;
  const macroOff = prefs.calorie_goal > 0 && Math.abs(macroGap) > prefs.calorie_goal * 0.05;
  const carbsToFit = Math.round((prefs.calorie_goal - prefs.protein_goal_g * 4 - prefs.fat_goal_g * 9) / 4);

  const mealCount = Math.max(prefs.meals_per_day, 1);

  // General adult macro split — midpoints of the AMDR (Institute of Medicine
  // / USDA Dietary Guidelines: protein 10–35%, carb 45–65%, fat 20–35% of
  // calories), rounded to the commonly-cited 20/50/30 default. This is a
  // population-average starting point, not tailored to the user the way the
  // body-stat "Recommend for me" path above is — it only reacts to whatever
  // calorie number is currently entered.
  const suggestedProtein = Math.round((prefs.calorie_goal * 0.2) / 4);
  const suggestedCarbs = Math.round((prefs.calorie_goal * 0.5) / 4);
  const suggestedFat = Math.round((prefs.calorie_goal * 0.3) / 9);
  const suggestionApplied =
    prefs.protein_goal_g === suggestedProtein &&
    prefs.carb_goal_g === suggestedCarbs &&
    prefs.fat_goal_g === suggestedFat;

  function applySuggestedMacros() {
    light();
    setPrefs((p) => ({ ...p, protein_goal_g: suggestedProtein, carb_goal_g: suggestedCarbs, fat_goal_g: suggestedFat }));
  }

  // --- Section summaries ---------------------------------------------------

  const targetsSummary =
    `${round(prefs.calorie_goal)} cal · ${round(prefs.protein_goal_g)}P ` +
    `${round(prefs.carb_goal_g)}C ${round(prefs.fat_goal_g)}F · ${prefs.meals_per_day} meals/day`;

  const dietParts: string[] = [];
  if (prefs.diet_restrictions.length) dietParts.push(prefs.diet_restrictions.map(humanize).join(', '));
  if (prefs.allergens.length) dietParts.push(`avoiding ${prefs.allergens.map(humanize).join(', ')}`);
  const dietAnswered = dietParts.length > 0;

  const stylesAnswered = prefs.eating_styles.length > 0;

  const likedText = (prefs.liked_foods_text ?? '').trim();
  const dislikedText = (prefs.disliked_foods_text ?? '').trim();
  const foodParts: string[] = [];
  if (likedText) foodParts.push(`Likes ${likedText}`);
  if (dislikedText) foodParts.push(`avoids ${dislikedText}`);
  const foodsAnswered = foodParts.length > 0;

  const answeredCount = 1 + [dietAnswered, stylesAnswered, foodsAnswered].filter(Boolean).length;

  function toggleSection(index: number) {
    setOpenSection((current) => (current === index ? null : index));
  }

  // Closes the current section and opens the next — the "keep going" path for
  // first-time setup, so finishing a section doesn't dead-end in an open panel.
  function NextLink({ index }: { index: number }) {
    if (index >= SECTIONS.length - 1) return null;
    return (
      <Pressable
        onPress={() => setOpenSection(index + 1)}
        hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
        accessibilityRole="button"
        style={({ pressed }) => [styles.nextLinkWrap, pressed && styles.nextLinkPressed]}
      >
        <Text style={styles.nextLink}>Next: {SECTIONS[index + 1]} →</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{isUpdate ? 'Update your targets' : 'Set your targets'}</Text>
      <Text style={styles.subtitle}>
        Tell us your eating style and health goal, or enter exact numbers yourself — daily targets get split across
        your meals.
      </Text>
      <Text style={styles.progress}>
        {answeredCount} of {SECTIONS.length} sections filled in
      </Text>
      <Text style={styles.progressHint}>Open any section to edit it — everything saves together at the end.</Text>

      <Disclosure
        step={1}
        title={SECTIONS[0]}
        summary={targetsSummary}
        summaryMono
        answered
        open={openSection === 0}
        onToggle={() => toggleSection(0)}
      >
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

            <Button
              label={calculating ? 'Calculating…' : 'Calculate my targets →'}
              onPress={handleCalculate}
              disabled={calculating}
              style={styles.calcButton}
            />

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
        <NumberField
          label="Calories"
          step={50}
          min={800}
          value={prefs.calorie_goal}
          onChange={(v) => setPrefs({ ...prefs, calorie_goal: v })}
        />

        {prefs.calorie_goal > 0 && (
          <View style={styles.suggestion}>
            <Text style={styles.liveFigure}>
              Average split for {round(prefs.calorie_goal)} cal: {suggestedProtein}g protein · {suggestedCarbs}g carbs ·{' '}
              {suggestedFat}g fat
            </Text>
            <Text style={styles.fieldCaption}>
              General adult guideline (20% protein / 50% carbs / 30% fat) — a starting point, not tailored to you.
            </Text>
            {!suggestionApplied && (
              <Pressable
                onPress={applySuggestedMacros}
                hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.nextLinkWrap, pressed && styles.nextLinkPressed]}
              >
                <Text style={styles.nextLink}>Use these →</Text>
              </Pressable>
            )}
          </View>
        )}

        <NumberField
          label="Protein (g)"
          step={5}
          value={prefs.protein_goal_g}
          onChange={(v) => setPrefs({ ...prefs, protein_goal_g: v })}
        />
        <NumberField
          label="Carbs (g)"
          step={5}
          value={prefs.carb_goal_g}
          onChange={(v) => setPrefs({ ...prefs, carb_goal_g: v })}
        />
        <NumberField
          label="Fat (g)"
          step={5}
          value={prefs.fat_goal_g}
          onChange={(v) => setPrefs({ ...prefs, fat_goal_g: v })}
        />
        <NumberField
          label="Meals per day"
          step={1}
          min={1}
          max={8}
          value={prefs.meals_per_day}
          onChange={(v) => setPrefs({ ...prefs, meals_per_day: v })}
        />

        <Text style={[styles.liveFigure, macroOff && styles.liveFigureOff]}>
          {macroOff
            ? `Your macros come to ${round(macroCalories)} cal — ${round(Math.abs(macroGap))} cal ${
                macroGap > 0 ? 'over' : 'under'
              } your ${round(prefs.calorie_goal)} cal goal.`
            : `Your macros come to ${round(macroCalories)} cal, in line with your ${round(prefs.calorie_goal)} cal goal.`}
        </Text>
        {macroOff && carbsToFit >= 0 && (
          <Pressable
            onPress={() => setPrefs({ ...prefs, carb_goal_g: carbsToFit })}
            hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.nextLinkWrap, pressed && styles.nextLinkPressed]}
          >
            <Text style={styles.nextLink}>Set carbs to {carbsToFit}g to make it add up →</Text>
          </Pressable>
        )}
        <Text style={styles.liveFigure}>
          Split across {mealCount} {mealCount === 1 ? 'meal' : 'meals'}: ≈{round(prefs.calorie_goal / mealCount)} cal ·{' '}
          {round(prefs.protein_goal_g / mealCount)}g protein · {round(prefs.carb_goal_g / mealCount)}g carbs ·{' '}
          {round(prefs.fat_goal_g / mealCount)}g fat per meal.
        </Text>

        <NextLink index={0} />
      </Disclosure>

      <Disclosure
        step={2}
        title={SECTIONS[1]}
        summary={dietAnswered ? dietParts.join(' · ') : 'No restrictions or allergens set.'}
        answered={dietAnswered}
        open={openSection === 1}
        onToggle={() => toggleSection(1)}
      >
        <Text style={styles.label}>Diet restrictions</Text>
        <Text style={styles.fieldCaption}>Meals that don't fit these are left out entirely.</Text>
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

        <NextLink index={1} />
      </Disclosure>

      <Disclosure
        step={3}
        title={SECTIONS[2]}
        summary={
          stylesAnswered
            ? prefs.eating_styles.map((s) => EATING_STYLE_LABELS[s] ?? humanize(s)).join(' · ')
            : 'No eating styles selected yet.'
        }
        answered={stylesAnswered}
        open={openSection === 2}
        onToggle={() => toggleSection(2)}
      >
        <Text style={styles.fieldCaption}>
          Select any that apply — these fine-tune which meals we suggest, never rule anything out.
        </Text>
        <View style={styles.chipRow}>
          {EATING_STYLES.map((style) => (
            <Chip
              key={style}
              label={EATING_STYLE_LABELS[style] ?? style}
              selected={prefs.eating_styles.includes(style)}
              onPress={() => setPrefs({ ...prefs, eating_styles: toggle(prefs.eating_styles, style) })}
            />
          ))}
        </View>

        <NextLink index={2} />
      </Disclosure>

      <Disclosure
        step={4}
        title={SECTIONS[3]}
        summary={foodParts.length ? foodParts.join(' · ') : 'Nothing about your tastes yet.'}
        answered={foodsAnswered}
        open={openSection === 3}
        onToggle={() => toggleSection(3)}
      >
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
      </Disclosure>

      <View style={styles.sectionsEnd} />

      {error && <Text style={styles.error}>{error}</Text>}

      <Button
        label={saving ? 'Saving…' : isUpdate ? 'Save changes →' : 'Save & see meals →'}
        onPress={handleSave}
        disabled={saving}
        style={styles.saveButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 40 },
  title: { fontFamily: 'Fraunces_700Bold', fontSize: 26, lineHeight: 32, color: colors.ink, marginBottom: space.xs },
  subtitle: { ...type.body, color: colors.inkSecondary, marginBottom: space.md },
  progress: { ...type.kicker, color: colors.inkSecondary },
  progressHint: { ...type.caption, marginTop: space.xs, marginBottom: space.lg },
  field: { marginBottom: space.md },
  label: { ...type.kicker, marginTop: space.sm, marginBottom: space.sm },
  dailyTargetsLabel: { marginTop: space.xl },
  suggestion: { marginTop: -space.xs, marginBottom: space.lg },
  fieldCaption: { ...type.caption, marginTop: space.xs },
  helperText: { ...type.body, color: colors.inkSecondary, marginBottom: space.md },
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
  recommendPanel: { marginBottom: space.sm },
  calcButton: { marginTop: space.md },
  calcResult: { ...type.mono, marginTop: space.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginBottom: space.md },
  // Live arithmetic off the current field values. `accent` marks "these
  // numbers don't add up" — the same warning role it already plays on an
  // over-goal ProgressBar, not a new hue.
  liveFigure: { ...type.mono, fontSize: 12, marginTop: space.md },
  liveFigureOff: { color: colors.accent },
  nextLinkWrap: { alignSelf: 'flex-start', paddingVertical: space.sm, marginTop: space.md },
  nextLinkPressed: { opacity: interaction.pressedOpacity },
  nextLink: { ...type.kicker, color: colors.accent },
  sectionsEnd: { borderTopWidth: 1, borderTopColor: colors.hairline },
  error: { ...type.body, color: colors.accent, marginTop: space.md },
  saveButton: { marginTop: space.xl },
});
