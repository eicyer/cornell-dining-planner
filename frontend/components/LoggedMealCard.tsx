import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Pencil from 'lucide-react-native/icons/pencil';
import ThumbsDown from 'lucide-react-native/icons/thumbs-down';
import ThumbsUp from 'lucide-react-native/icons/thumbs-up';
import Trash2 from 'lucide-react-native/icons/trash-2';
import X from 'lucide-react-native/icons/x';
import { LoggedMeal, deleteMeal, updateMealItems } from '../api';
import { describePortion } from '../foodDensity';
import { light, success } from '../haptics';
import { colors, interaction, space, type } from '../theme';
import Button from './Button';
import Icon from './Icon';
import PortionStepper from './PortionStepper';

type Mode = 'view' | 'edit' | 'confirmDelete';

// One eatery's Logged Meal inside a Diary Meal Section (MealSectionBlock):
// an eatery label, then one row per food with its calories right-aligned.
// The section header carries the section total, so there's no per-meal
// total in view mode.
//
// Edits only adjust portions or drop items from what was already logged —
// adding a new item would need that Menu Event's full menu, which the diary
// doesn't load. The backend recomputes nutrition on save; the totals shown
// while editing are a linear preview from each item's logged numbers.
export default function LoggedMealCard({
  meal,
  onRate,
  onChanged,
  onDeleted,
}: {
  meal: LoggedMeal;
  onRate: (liked: boolean) => void;
  onChanged: (meal: LoggedMeal) => void;
  onDeleted: (mealId: number) => void;
}) {
  const [mode, setMode] = useState<Mode>('view');
  // Item name → grams; a removed item is simply absent.
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    light();
    setDraft(Object.fromEntries(meal.items.map((i) => [i.name, i.grams])));
    setError(null);
    setMode('edit');
  }

  function cancel() {
    setError(null);
    setMode('view');
  }

  function removeItem(name: string) {
    setDraft(({ [name]: _, ...rest }) => rest);
  }

  const draftItems = meal.items.filter((i) => i.name in draft && draft[i.name] > 0);
  const previewCalories = draftItems.reduce((sum, i) => sum + (i.grams > 0 ? (i.calories * draft[i.name]) / i.grams : 0), 0);
  const previewProtein = draftItems.reduce((sum, i) => sum + (i.grams > 0 ? (i.protein_g * draft[i.name]) / i.grams : 0), 0);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMealItems(
        meal.id,
        draftItems.map((i) => ({ name: i.name, grams: draft[i.name] }))
      );
      success();
      onChanged(updated);
      setMode('view');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    setSaving(true);
    setError(null);
    try {
      await deleteMeal(meal.id);
      success();
      onDeleted(meal.id);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <View style={styles.mealCard}>
      <View style={styles.mealHeader}>
        <Text style={styles.mealEatery}>
          {meal.eatery_name} · {meal.meal_period}
        </Text>
        {mode === 'view' && (
          <View style={styles.headerActions}>
            {/* iconSize.sm (16px) + hitSlop 14 on each edge = 44pt tap
                target (touchTarget.min) — the glyph itself stays small,
                only the invisible tap area grows. See Phase 6 audit. */}
            <Pressable onPress={() => onRate(true)} hitSlop={14} accessibilityLabel="Liked it">
              <Icon icon={ThumbsUp} size="sm" color={meal.liked === true ? 'accent' : 'inkSecondary'} />
            </Pressable>
            <Pressable onPress={() => onRate(false)} hitSlop={14} accessibilityLabel="Didn't like it">
              <Icon icon={ThumbsDown} size="sm" color={meal.liked === false ? 'accent' : 'inkSecondary'} />
            </Pressable>
            <Pressable onPress={startEdit} hitSlop={14} accessibilityLabel="Edit meal">
              <Icon icon={Pencil} size="sm" color="inkSecondary" />
            </Pressable>
          </View>
        )}
      </View>

      {mode === 'edit' ? (
        <>
          {meal.items
            .filter((item) => item.name in draft)
            .map((item) => (
              <View key={item.name} style={styles.editRow}>
                <Pressable
                  onPress={() => removeItem(item.name)}
                  hitSlop={14}
                  accessibilityLabel={`Remove ${item.name}`}
                  style={styles.removeButton}
                >
                  <Icon icon={X} size="sm" color="inkSecondary" />
                </Pressable>
                <Text style={styles.editItemName}>{item.name}</Text>
                <PortionStepper
                  name={item.name}
                  originalGrams={item.grams}
                  grams={draft[item.name]}
                  onChange={(g) => setDraft((d) => ({ ...d, [item.name]: Math.max(0, g) }))}
                  disabled={saving}
                />
              </View>
            ))}
          {draftItems.length === 0 ? (
            <Text style={styles.hint}>Nothing left on this plate — delete the meal instead.</Text>
          ) : (
            <Text style={styles.mealTotals}>
              ≈ {Math.round(previewCalories)} cal · {Math.round(previewProtein)}g protein
            </Text>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
          <Button
            label={saving ? 'Saving…' : 'Save changes'}
            onPress={save}
            disabled={saving || draftItems.length === 0}
            style={styles.saveButton}
          />
          <View style={styles.footerLinks}>
            <Pressable onPress={cancel} hitSlop={14} disabled={saving} style={({ pressed }) => pressed && styles.pressed}>
              <Text style={styles.linkText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('confirmDelete')}
              hitSlop={14}
              disabled={saving}
              style={({ pressed }) => [styles.deleteLink, pressed && styles.pressed]}
            >
              <Icon icon={Trash2} size="sm" color="accent" />
              <Text style={[styles.linkText, styles.destructiveText]}>Delete meal</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {meal.items.map((item) => {
            const portion = describePortion(item);
            return (
              <View key={item.name} style={styles.itemRow}>
                <View style={styles.itemNameColumn}>
                  <Text style={styles.itemText}>{item.name}</Text>
                  <Text style={styles.itemFigures}>
                    {Math.round(item.grams)}g{portion ? ` · ${portion}` : ''}
                  </Text>
                </View>
                <Text style={styles.itemCalories}>{Math.round(item.calories)}</Text>
              </View>
            );
          })}
        </>
      )}

      {/* Inline confirm rather than Alert.alert — Alert is a no-op on
          react-native-web, and this is a destructive, unrecoverable action. */}
      {mode === 'confirmDelete' && (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>Delete this meal from your diary? This can't be undone.</Text>
          {error && <Text style={styles.error}>{error}</Text>}
          <Button label={saving ? 'Deleting…' : 'Delete meal'} onPress={confirmDelete} disabled={saving} />
          <View style={styles.footerLinks}>
            <Pressable onPress={startEdit} hitSlop={14} disabled={saving} style={({ pressed }) => pressed && styles.pressed}>
              <Text style={styles.linkText}>Keep it</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mealCard: {
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    paddingVertical: space.md,
  },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.xs },
  mealEatery: { ...type.kicker, flexShrink: 1, paddingRight: space.sm },
  // gap must clear 2x hitSlop (14+14=28) so neighboring tap areas never
  // overlap — like/dislike are opposite-meaning actions, so a mis-tap here
  // is worse than most. See Phase 6 audit.
  headerActions: { flexDirection: 'row', gap: space.xxl },
  itemRow: { flexDirection: 'row', alignItems: 'baseline', paddingVertical: space.xs, gap: space.md },
  itemNameColumn: { flex: 1 },
  itemText: { ...type.body, fontSize: 14 },
  itemFigures: { ...type.mono, fontSize: 12, color: colors.inkTertiary },
  itemCalories: { ...type.mono, color: colors.ink },
  mealTotals: { ...type.monoEmphasis, marginTop: space.sm },
  editRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, gap: space.md },
  removeButton: { paddingRight: space.xs },
  editItemName: { ...type.body, fontSize: 14, flex: 1 },
  hint: { ...type.editorialItalic, marginTop: space.sm },
  error: { ...type.body, fontSize: 13, color: colors.accent, marginTop: space.sm },
  saveButton: { marginTop: space.md },
  footerLinks: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.md },
  linkText: { ...type.kicker, color: colors.inkSecondary },
  deleteLink: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  destructiveText: { color: colors.accent },
  pressed: { opacity: interaction.pressedOpacity },
  confirm: { marginTop: space.md },
  confirmText: { ...type.body, fontSize: 14, marginBottom: space.md },
});
