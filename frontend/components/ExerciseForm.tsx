import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Trash2 from 'lucide-react-native/icons/trash-2';
import {
  ExerciseActivity,
  ExerciseEntry,
  ExerciseInput,
  OTHER_ACTIVITY,
  createExercise,
  deleteExercise,
  replaceExercise,
} from '../api';
import { success } from '../haptics';
import { colors, interaction, radius, space, touchTarget, type } from '../theme';
import Button from './Button';
import Chip from './Chip';
import Icon from './Icon';

// Mirrors backend/app/routers/exercise.py's sanity bounds.
const MAX_MINUTES = 600;
const MAX_CALORIES = 3000;

type Mode = 'edit' | 'confirmDelete';

// Inline add/edit form for an Exercise Entry (docs/adr/0025): pick an
// activity, type minutes, and the server estimates the burn. Calories are
// an optional override — required for "Other", and whenever the user has
// no weight on file (the server says so and the form shows it).
export default function ExerciseForm({
  date,
  activities,
  entry,
  onSaved,
  onDeleted,
  onCancel,
}: {
  date: string;
  activities: ExerciseActivity[];
  entry?: ExerciseEntry;
  onSaved: (entry: ExerciseEntry) => void;
  onDeleted?: (entryId: number) => void;
  onCancel: () => void;
}) {
  const [activity, setActivity] = useState(entry?.activity ?? activities[0]?.key ?? OTHER_ACTIVITY);
  const [label, setLabel] = useState(entry?.activity === OTHER_ACTIVITY ? entry.label : '');
  const [minutes, setMinutes] = useState(entry ? String(entry.minutes) : '');
  // Only prefilled when the user typed it last time — an estimate stays an
  // estimate and is redone from the new minutes.
  const [calories, setCalories] = useState(entry?.calories_typed ? String(Math.round(entry.calories)) : '');
  const [mode, setMode] = useState<Mode>('edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOther = activity === OTHER_ACTIVITY;
  const minutesValue = Number(minutes);
  const caloriesValue = calories ? Number(calories) : null;
  const validationError =
    minutesValue > MAX_MINUTES
      ? `Minutes can be at most ${MAX_MINUTES}.`
      : caloriesValue != null && caloriesValue > MAX_CALORIES
        ? `Calories can be at most ${MAX_CALORIES.toLocaleString()}.`
        : null;
  const canSave =
    Number.isInteger(minutesValue) &&
    minutesValue > 0 &&
    (!isOther || (caloriesValue ?? 0) > 0) &&
    !validationError &&
    !saving;

  async function save() {
    const input: ExerciseInput = {
      activity,
      minutes: minutesValue,
      calories: caloriesValue && caloriesValue > 0 ? caloriesValue : null,
      label: isOther ? label.trim() || null : null,
    };
    setSaving(true);
    setError(null);
    try {
      const saved = entry ? await replaceExercise(entry.id, input) : await createExercise(date, input);
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
      await deleteExercise(entry.id);
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
        <Text style={styles.confirmText}>Delete this exercise from your diary?</Text>
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
      <Text style={styles.kicker}>{entry ? 'Edit exercise' : 'Add exercise'}</Text>

      <View style={styles.chipRow}>
        {[...activities, { key: OTHER_ACTIVITY, label: 'Other' }].map((a) => (
          <Chip key={a.key} label={a.label} selected={a.key === activity} onPress={() => setActivity(a.key)} />
        ))}
      </View>

      {isOther && (
        <TextInput
          style={styles.nameInput}
          placeholder="What was it? (optional)"
          placeholderTextColor={colors.inkTertiary}
          maxLength={80}
          value={label}
          onChangeText={setLabel}
        />
      )}

      <View style={styles.fieldRow}>
        <NumberField
          label="Minutes"
          value={minutes}
          onChange={(t) => setMinutes(t.replace(/[^0-9]/g, ''))}
          autoFocus={!entry}
        />
        <NumberField
          label={isOther ? 'Calories' : 'Calories (optional)'}
          value={calories}
          onChange={(t) => setCalories(t.replace(/[^0-9]/g, ''))}
        />
      </View>
      {!isOther && <Text style={styles.caption}>Leave calories blank and we'll estimate them from your weight.</Text>}

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
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={colors.inkTertiary}
        autoFocus={autoFocus}
        value={value}
        onChangeText={onChange}
        accessibilityLabel={label}
      />
      <Text style={styles.fieldLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  kicker: { ...type.kicker, marginBottom: space.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, marginBottom: space.md },
  fieldRow: { flexDirection: 'row', gap: space.xl, alignItems: 'flex-end', marginBottom: space.sm },
  numberField: { minWidth: 120 },
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
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    borderRadius: radius.none,
    paddingVertical: space.sm,
    minHeight: touchTarget.min,
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    color: colors.ink,
    marginBottom: space.md,
  },
  caption: { ...type.caption, marginBottom: space.md },
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
