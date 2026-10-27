import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Trash2 from 'lucide-react-native/icons/trash-2';
import {
  MEAL_SECTIONS,
  MealSection,
  QuickAddEntry,
  QuickAddInput,
  createQuickAdd,
  deleteQuickAdd,
  updateQuickAdd,
} from '../api';
import { success } from '../haptics';
import { colors, interaction, radius, space, touchTarget, type } from '../theme';
import Button from './Button';
import Icon from './Icon';

const SECTION_LABELS: Record<MealSection, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

// Mirrors the server's sanity bounds (backend/app/routers/quick_add.py) so
// the form can say what's wrong before a round trip.
const MAX_CALORIES = 5000;
const MAX_MACRO_G = 500;

type Mode = 'edit' | 'confirmDelete';

// Inline Quick Add form inside a Meal Section (docs/adr/0024): calories are
// the only required field, so the fastest path is "type a number, tap Add".
// The section defaults to the one whose "Quick add" was tapped and can be
// switched here. Passing `entry` edits that entry instead, with Delete.
export default function QuickAddForm({
  date,
  section,
  entry,
  onSaved,
  onDeleted,
  onCancel,
}: {
  date: string;
  section: MealSection;
  entry?: QuickAddEntry;
  onSaved: (entry: QuickAddEntry) => void;
  onDeleted?: (entryId: number) => void;
  onCancel: () => void;
}) {
  const [mealSection, setMealSection] = useState<MealSection>(entry?.meal_section ?? section);
  const [name, setName] = useState(entry?.name ?? '');
  const [calories, setCalories] = useState(entry ? String(Math.round(entry.calories)) : '');
  const [protein, setProtein] = useState(macroText(entry?.protein_g));
  const [carbs, setCarbs] = useState(macroText(entry?.carbs_g));
  const [fat, setFat] = useState(macroText(entry?.fat_g));
  const [mode, setMode] = useState<Mode>('edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const caloriesValue = Number(calories);
  const macros = [protein, carbs, fat].map((m) => Number(m || 0));
  const validationError =
    !calories || caloriesValue <= 0
      ? null // nothing to complain about yet; the button just stays disabled
      : caloriesValue > MAX_CALORIES
        ? `Calories can be at most ${MAX_CALORIES.toLocaleString()}.`
        : macros.some((m) => m > MAX_MACRO_G)
          ? `Each macro can be at most ${MAX_MACRO_G}g.`
          : null;
  const canSave = caloriesValue > 0 && !validationError && !saving;

  async function save() {
    const input: QuickAddInput = {
      meal_section: mealSection,
      name: name.trim() || null,
      calories: caloriesValue,
      protein_g: macros[0],
      carbs_g: macros[1],
      fat_g: macros[2],
    };
    setSaving(true);
    setError(null);
    try {
      const saved = entry ? await updateQuickAdd(entry.id, input) : await createQuickAdd(date, input);
      success();
      onSaved(saved);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!entry) return;
    setSaving(true);
    setError(null);
    try {
      await deleteQuickAdd(entry.id);
      success();
      onDeleted?.(entry.id);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (mode === 'confirmDelete') {
    return (
      <View style={styles.form}>
        <Text style={styles.confirmText}>Delete this Quick Add from your diary?</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <Button label={saving ? 'Deleting…' : 'Delete'} onPress={confirmDelete} disabled={saving} />
        <View style={styles.footerLinks}>
          <Pressable onPress={() => setMode('edit')} hitSlop={14} disabled={saving} style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.linkText}>Keep it</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <Text style={styles.kicker}>{entry ? 'Edit Quick Add' : 'Quick add'}</Text>

      <View style={styles.sectionRow}>
        {MEAL_SECTIONS.map((s) => (
          <Pressable
          key={s}
          onPress={() => setMealSection(s)}
          hitSlop={8}
          accessibilityState={{ selected: s === mealSection }}
          style={[styles.sectionOption, s === mealSection && styles.sectionOptionSelected]}
          >
          <Text style={[styles.sectionOptionText, s === mealSection && styles.sectionOptionTextSelected]}>
            {SECTION_LABELS[s]}
          </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.fieldRow}>
        <NumberField label="Calories" value={calories} onChange={setCalories} autoFocus={!entry} />
        <TextInput
          style={styles.nameInput}
          placeholder="Name (optional)"
          placeholderTextColor={colors.inkTertiary}
          maxLength={80}
          value={name}
          onChangeText={setName}
        />
      </View>
      <View style={styles.fieldRow}>
        <NumberField label="Protein g" value={protein} onChange={setProtein} />
        <NumberField label="Carbs g" value={carbs} onChange={setCarbs} />
        <NumberField label="Fat g" value={fat} onChange={setFat} />
      </View>

      {(validationError || error) && <Text style={styles.error}>{validationError ?? error}</Text>}
      <View style={styles.actions}>
        <Button variant="secondary" label="Cancel" onPress={onCancel} disabled={saving} style={styles.cancelButton} />
        <Button
          label={saving ? 'Saving…' : entry ? 'Save changes' : 'Add to diary'}
          onPress={save}
          disabled={!canSave}
          style={styles.saveButton}
        />
      </View>
      {entry && (
        <View style={styles.footerLinks}>
          <Pressable
            onPress={() => setMode('confirmDelete')}
            hitSlop={14}
            disabled={saving}
            style={({ pressed }) => [styles.deleteLink, pressed && styles.pressed]}
          >
            <Icon icon={Trash2} size="sm" color="accent" />
            <Text style={[styles.linkText, styles.destructiveText]}>Delete</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function macroText(value: number | undefined): string {
  return value ? String(Math.round(value * 10) / 10) : '';
}

function NumberField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.numberField}>
      <TextInput
        style={styles.numberInput}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.inkTertiary}
        autoFocus={autoFocus}
        value={value}
        // One decimal point at most; everything else non-numeric is dropped.
        onChangeText={(text) => onChange(text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
        accessibilityLabel={label}
      />
      <Text style={styles.fieldLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  kicker: { ...type.kicker, marginBottom: space.sm },
  sectionRow: { flexDirection: 'row', gap: space.lg, marginBottom: space.md },
  // Same 2px accent underline as an active Tab / the selected WeekStrip day.
  sectionOption: { paddingVertical: space.xs, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  sectionOptionSelected: { borderBottomColor: colors.accent },
  sectionOptionText: { ...type.kicker, fontSize: 11 },
  sectionOptionTextSelected: { color: colors.ink },
  fieldRow: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-end', marginBottom: space.md },
  numberField: { width: 88 },
  numberInput: {
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    borderRadius: radius.none,
    paddingVertical: space.sm,
    minHeight: touchTarget.min,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 17,
    color: colors.ink,
  },
  fieldLabel: { ...type.kicker, fontSize: 11, marginTop: 2 },
  nameInput: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    borderRadius: radius.none,
    paddingVertical: space.sm,
    minHeight: touchTarget.min,
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    color: colors.ink,
    // Lines the name's baseline up with the number fields, whose labels sit below.
    marginBottom: 18,
  },
  error: { ...type.body, fontSize: 13, color: colors.accent, marginBottom: space.sm },
  // Cancel sits beside the primary action so backing out is as visible as saving.
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.xs },
  cancelButton: { flex: 1 },
  saveButton: { flex: 2 },
  footerLinks: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.md },
  linkText: { ...type.kicker, color: colors.inkSecondary },
  deleteLink: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  destructiveText: { color: colors.accent },
  pressed: { opacity: interaction.pressedOpacity },
  confirmText: { ...type.body, fontSize: 14, marginBottom: space.md },
});
