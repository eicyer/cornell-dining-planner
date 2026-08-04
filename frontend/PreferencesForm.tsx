import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ALLERGENS, DIET_TAGS, Preferences, putPreferences } from './api';
import { colors, radius, space, type } from './theme';

const DEFAULTS: Preferences = {
  calorie_goal: 2200,
  protein_goal_g: 150,
  carb_goal_g: 220,
  fat_goal_g: 70,
  meals_per_day: 3,
  diet_restrictions: [],
  allergens: [],
  liked_foods_text: '',
  disliked_foods_text: '',
  liked_tags: [],
  disliked_tags: [],
};

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label.replace('_', ' ')}</Text>
    </Pressable>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.numberInput}
        keyboardType="numeric"
        value={String(value)}
        onChangeText={(text) => onChange(Number(text.replace(/[^0-9]/g, '')) || 0)}
      />
    </View>
  );
}

export default function PreferencesForm({ onSaved }: { onSaved: (prefs: Preferences) => void }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
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
      <Text style={styles.title}>Set your goals</Text>
      <Text style={styles.subtitle}>Daily targets — we'll split them across your meals.</Text>

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
        <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save & see meals →'}</Text>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
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
