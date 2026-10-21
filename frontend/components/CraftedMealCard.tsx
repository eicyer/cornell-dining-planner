import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CraftedItem, CraftedMeal, LoggedMeal, PLATE_ROLE_ORDER, PlateRole, Totals, deleteMeal, getLoggedMeals, updateMealItems } from '../api';
import { assignPlateColors } from '../foodColors';
import { describePortion } from '../foodDensity';
import { colors, interaction, space, type } from '../theme';
import Button from './Button';
import { success } from '../haptics';
import ColorDot from './ColorDot';
import PortionStepper from './PortionStepper';
import ProgressBar from './ProgressBar';

export type LogStatus = 'idle' | 'saving' | 'done' | 'error';

// Groups a crafted meal's flat item list into the plate roles the backend
// already selects them by (see docs/adr/0012), instead of rendering an
// undifferentiated list — a fixed-serving whole-plate item that
// classify_role() doesn't resolve to protein/carb/vegetable falls into
// "Other" rather than being dropped.
const ROLE_LABELS: Record<PlateRole, string> = { protein: 'Protein', carb: 'Carb', vegetable: 'Vegetable' };

function groupByRole(items: CraftedItem[]): { label: string; items: CraftedItem[] }[] {
  const buckets = new Map<PlateRole | 'other', CraftedItem[]>();
  for (const item of items) {
    const key = item.role ?? 'other';
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }
  return [...PLATE_ROLE_ORDER, 'other' as const]
    .map((key) => ({ label: key === 'other' ? 'Other' : ROLE_LABELS[key], items: buckets.get(key) ?? [] }))
    .filter((group) => group.items.length > 0);
}

// Rescales a suggested item's macros to a user-adjusted gram figure. The
// backend only ever gives us the absolute macros for its suggested serving
// (not a per-100g density), so per-gram density is derived from that
// serving rather than looked up — fine since it's linear and the original
// grams are never 0 for a real item.
function scaleItem(item: CraftedItem, newGrams: number): CraftedItem {
  const scale = item.grams > 0 ? newGrams / item.grams : 0;
  return {
    ...item,
    grams: newGrams,
    calories: item.calories * scale,
    protein_g: item.protein_g * scale,
    carbs_g: item.carbs_g * scale,
    fat_g: item.fat_g * scale,
    sugar_g: item.sugar_g * scale,
    fiber_g: item.fiber_g * scale,
  };
}

function sumTotals(items: CraftedItem[]): CraftedMeal['totals'] {
  const totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, sugar_g: 0, fiber_g: 0 };
  for (const item of items) {
    totals.calories += item.calories;
    totals.protein_g += item.protein_g;
    totals.carbs_g += item.carbs_g;
    totals.fat_g += item.fat_g;
    totals.sugar_g += item.sugar_g;
    totals.fiber_g += item.fiber_g;
  }
  return totals;
}

const LOG_BUTTON_LABEL: Record<LogStatus, string> = {
  idle: 'Log this meal →',
  saving: 'Logging…',
  done: 'Logged ✓',
  error: 'Failed — try again',
};

const LOG_ITEM_LABEL: Record<LogStatus, string> = {
  idle: 'Log just this',
  saving: 'Logging…',
  done: 'Logged ✓',
  error: 'Failed — retry',
};

export default function CraftedMealCard({
  meal,
  mealPeriod,
  perMealTarget,
  status,
  onLog,
  onUndoLog,
  onLogItem,
}: {
  meal: CraftedMeal;
  mealPeriod: string;
  perMealTarget: Totals | null;
  status: LogStatus;
  // Receives the items actually being logged (grams as adjusted via the
  // per-item PortionStepper below), not necessarily the suggested amounts —
  // the caller logs exactly what's passed here. Resolves to the Logged Meal
  // it landed in (null on failure) so an accidental log can be taken back.
  onLog: (items: { name: string; grams: number }[]) => Promise<LoggedMeal | null>;
  // Called after "Remove from diary" undoes the whole-meal log, so the
  // caller resets the `status` it owns back to idle.
  onUndoLog: () => void;
  // Logs one item on its own, for when the user only takes part of the
  // suggested plate. Resolves to the Logged Meal it landed in (the backend
  // appends to the user's meal for that Menu Event — docs/adr/0023) so the
  // item's portion can still be corrected afterwards. Should reject on
  // failure — per-item status is tracked here, not by the caller.
  onLogItem: (item: { name: string; grams: number }) => Promise<LoggedMeal>;
}) {
  // Keyed by item name, seeded from the suggestion. Reset on every `meal`
  // change (not just on mount) — the parent can hand this component a new
  // `meal` object without unmounting it (e.g. pull-to-refresh handing back
  // a fresh candidate for the same eatery slot), and stale gram overrides
  // from the previous meal must not silently carry over.
  const [grams, setGrams] = useState<Record<string, number>>({});
  const [itemStatus, setItemStatus] = useState<Record<string, LogStatus>>({});
  // Grams of each item *this card* has put in the Diary. The Logged Meal
  // it lands in is shared with everything else logged from the same Menu
  // Event (other cards, the menu builder — docs/adr/0023), so every later
  // change from here is a delta on this card's own share, never an
  // overwrite of the Diary's figure for that item.
  const [logged, setLogged] = useState<Record<string, number>>({});
  const [loggedMeal, setLoggedMeal] = useState<LoggedMeal | null>(null);
  // Which "Logged ✓" is showing its remove/keep choice: an item name, the
  // whole meal, or none.
  const [confirming, setConfirming] = useState<{ item: string } | 'meal' | null>(null);
  const [undoError, setUndoError] = useState(false);
  useEffect(() => {
    setGrams(Object.fromEntries(meal.items.map((i) => [i.name, i.grams])));
    setItemStatus({});
    setLogged({});
    setLoggedMeal(null);
    setConfirming(null);
  }, [meal]);

  const scaledItems = useMemo(
    () => meal.items.map((item) => scaleItem(item, grams[item.name] ?? item.grams)),
    [meal.items, grams]
  );
  const totals = useMemo(() => sumTotals(scaledItems), [scaledItems]);
  const loggedTotals = useMemo(
    () => sumTotals(meal.items.filter((i) => i.name in logged).map((i) => scaleItem(i, logged[i.name]))),
    [meal.items, logged]
  );

  const itemColors = assignPlateColors(meal.items);
  const colorFor = (item: CraftedItem) => itemColors[item.name] ?? colors.neutralFallback;

  function handleGramsChange(name: string, newGrams: number) {
    setGrams((g) => ({ ...g, [name]: Math.max(0, newGrams) }));
  }

  // Items already logged are left out of "Log the rest" so nothing gets
  // counted twice in the diary.
  const isItemLogged = (name: string) => name in logged;
  const remainingItems = scaledItems.filter((i) => i.grams > 0 && !isItemLogged(i.name));
  const someItemsLogged = scaledItems.some((i) => isItemLogged(i.name));
  const mealDone = someItemsLogged && remainingItems.length === 0;

  function forget(name: string) {
    setLogged(({ [name]: _, ...rest }) => rest);
  }

  // Applies per-item gram deltas to the shared Logged Meal. The PATCH
  // replaces the meal's whole item list, so it's built from a fresh read —
  // the Diary or another card may have changed the meal since. Deletes the
  // meal when nothing's left (the API rejects an empty item list). Returns
  // false if the meal no longer exists (deleted elsewhere).
  async function applyDeltas(deltas: Record<string, number>): Promise<boolean> {
    if (!loggedMeal) return false;
    const fresh = (await getLoggedMeals(loggedMeal.date)).find((m) => m.id === loggedMeal.id);
    if (!fresh) {
      setLoggedMeal(null);
      return false;
    }
    const gramsByName: Record<string, number> = Object.fromEntries(fresh.items.map((i) => [i.name, i.grams]));
    for (const [name, delta] of Object.entries(deltas)) gramsByName[name] = (gramsByName[name] ?? 0) + delta;
    const items = Object.entries(gramsByName)
      .map(([name, g]) => ({ name, grams: g }))
      .filter((i) => i.grams > 0.5);
    if (items.length === 0) {
      await deleteMeal(fresh.id);
      setLoggedMeal(null);
    } else {
      setLoggedMeal(await updateMealItems(fresh.id, items));
    }
    return true;
  }

  async function handleLog() {
    // A stepper dragged to 0g reads as "leave this off the plate" rather
    // than logging a zero-gram line item.
    const sent = remainingItems.map((i) => ({ name: i.name, grams: i.grams }));
    const result = await onLog(sent);
    if (!result) return;
    setLoggedMeal(result);
    setLogged((l) => ({ ...l, ...Object.fromEntries(sent.map((i) => [i.name, i.grams])) }));
  }

  async function handleLogItem(item: CraftedItem) {
    setItemStatus((s) => ({ ...s, [item.name]: 'saving' }));
    try {
      setLoggedMeal(await onLogItem({ name: item.name, grams: item.grams }));
      setLogged((l) => ({ ...l, [item.name]: item.grams }));
      setItemStatus((s) => ({ ...s, [item.name]: 'done' }));
      success();
    } catch {
      setItemStatus((s) => ({ ...s, [item.name]: 'error' }));
    }
  }

  // Moves this card's share of a logged item to the stepper's value — a
  // PATCH, not another log, since logging again would add to the portion
  // rather than replace it. 0g takes it out.
  async function handleUpdateItem(item: CraftedItem) {
    setItemStatus((s) => ({ ...s, [item.name]: 'saving' }));
    try {
      const stillThere = await applyDeltas({ [item.name]: item.grams - logged[item.name] });
      if (!stillThere) {
        // The meal was deleted elsewhere (e.g. from the Diary), taking
        // everything this card logged with it — start over from the stepper.
        setLogged({});
        if (item.grams > 0) await handleLogItem(item);
        else setItemStatus((s) => ({ ...s, [item.name]: 'idle' }));
        return;
      }
      if (item.grams > 0) setLogged((l) => ({ ...l, [item.name]: item.grams }));
      else forget(item.name);
      setItemStatus((s) => ({ ...s, [item.name]: item.grams > 0 ? 'done' : 'idle' }));
      success();
    } catch {
      setItemStatus((s) => ({ ...s, [item.name]: 'error' }));
    }
  }

  async function handleRemoveItem(name: string) {
    setItemStatus((s) => ({ ...s, [name]: 'saving' }));
    try {
      const stillThere = await applyDeltas({ [name]: -logged[name] });
      if (stillThere) forget(name);
      else setLogged({});
      setItemStatus((s) => ({ ...s, [name]: 'idle' }));
      setConfirming(null);
      success();
    } catch {
      setItemStatus((s) => ({ ...s, [name]: 'error' }));
    }
  }

  // Undoes everything this card put in the Diary, and nothing else.
  async function handleRemoveMeal() {
    setUndoError(false);
    try {
      await applyDeltas(Object.fromEntries(Object.entries(logged).map(([name, g]) => [name, -g])));
      setLogged({});
      setItemStatus({});
      setConfirming(null);
      onUndoLog();
      success();
    } catch {
      setUndoError(true);
    }
  }

  // The caller's `status` only reports the whole-meal request in flight or
  // failed; whether the plate is logged comes from `logged`, which also
  // tracks per-item logs and removals made after it.
  const logButtonLabel =
    status === 'saving' ? LOG_BUTTON_LABEL.saving
    : mealDone ? LOG_BUTTON_LABEL.done
    : status === 'error' ? LOG_BUTTON_LABEL.error
    : someItemsLogged ? 'Log the rest →'
    : LOG_BUTTON_LABEL.idle;

  return (
    <View style={styles.meal}>
      <Text style={styles.mealPeriod}>{mealPeriod}</Text>
      <Text style={styles.mealName}>{meal.name}</Text>
      <Text style={styles.rationale}>{meal.rationale}</Text>

      {groupByRole(scaledItems).map((group) => (
        <View key={group.label} style={styles.roleGroup}>
          <Text style={styles.roleLabel}>{group.label}</Text>
          {group.items.map((item) => {
            const original = meal.items.find((i) => i.name === item.name);
            const portion = describePortion(item);
            const thisItemStatus = itemStatus[item.name] ?? 'idle';
            const saving = thisItemStatus === 'saving' || status === 'saving';
            const isLogged = isItemLogged(item.name);
            const changed = isLogged && item.grams !== logged[item.name];
            const itemAction = isLogged ? handleUpdateItem : handleLogItem;
            const itemDone = isLogged && !changed && thisItemStatus !== 'error';
            const itemLabel =
              thisItemStatus === 'saving' ? (isLogged ? 'Saving…' : LOG_ITEM_LABEL.saving)
              : thisItemStatus === 'error' ? LOG_ITEM_LABEL.error
              : changed ? (item.grams > 0 ? 'Update →' : 'Remove')
              : itemDone ? LOG_ITEM_LABEL.done
              : LOG_ITEM_LABEL.idle;
            // A settled "Logged ✓" stays tappable — it opens the
            // remove/keep choice for an accidental log.
            const canRemove = itemDone && !saving;
            const itemLogDisabled = saving || (!isLogged && item.grams <= 0);
            const confirmingThis = confirming !== null && confirming !== 'meal' && confirming.item === item.name;
            return (
              <View key={item.name} style={styles.item}>
                <View style={styles.itemRow}>
                  <View style={styles.itemNameRow}>
                    <ColorDot color={colorFor(item)} />
                    <Text style={styles.itemName}>{item.name}</Text>
                  </View>
                  <PortionStepper
                    name={item.name}
                    originalGrams={original?.grams ?? item.grams}
                    grams={item.grams}
                    onChange={(g) => handleGramsChange(item.name, g)}
                    disabled={saving}
                  />
                </View>
                <View style={styles.itemFooter}>
                  <Text style={styles.itemCaption}>
                    {Math.round(item.grams)}g{portion ? ` · ${portion}` : ''} · {Math.round(item.calories)} cal
                  </Text>
                  {confirmingThis ? (
                    <View style={styles.confirmLinks}>
                      <Pressable onPress={() => handleRemoveItem(item.name)} hitSlop={14} style={({ pressed }) => pressed && styles.pressed}>
                        <Text style={styles.logItemText}>Remove from diary</Text>
                      </Pressable>
                      <Pressable onPress={() => setConfirming(null)} hitSlop={14} style={({ pressed }) => pressed && styles.pressed}>
                        <Text style={[styles.logItemText, styles.keepText]}>Keep</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => (canRemove ? setConfirming({ item: item.name }) : itemAction(item))}
                      disabled={itemLogDisabled}
                      hitSlop={14}
                      accessibilityHint={canRemove ? 'Shows an option to remove it from your diary' : undefined}
                      style={({ pressed }) => pressed && styles.pressed}
                    >
                      <Text style={[styles.logItemText, itemLogDisabled && !itemDone && styles.logItemTextDisabled]}>
                        {itemLabel}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ))}

      <View style={styles.totals}>
        {perMealTarget && <ProgressBar label="This meal" value={totals.calories} goal={perMealTarget.calories} unit=" cal" />}
        <Text style={styles.totalsText}>
          {Math.round(totals.calories)} cal · {Math.round(totals.protein_g)}g protein ·{' '}
          {Math.round(totals.carbs_g)}g carbs · {Math.round(totals.fat_g)}g fat
        </Text>
        {/* What this card has actually put in the Diary, against the plate
            as set above — moves with every log, update, remove and undo. */}
        {someItemsLogged && (
          <View style={styles.loggedProgress}>
            <ProgressBar label="Logged" value={loggedTotals.calories} goal={totals.calories} unit=" cal" />
          </View>
        )}
      </View>

      {confirming === 'meal' ? (
        <View style={styles.mealConfirm}>
          <Text style={styles.mealConfirmText}>Remove this meal from your diary?</Text>
          {undoError && <Text style={styles.undoError}>Couldn't remove it — try again.</Text>}
          <Button label="Remove from diary" onPress={handleRemoveMeal} />
          <Pressable onPress={() => setConfirming(null)} hitSlop={14} style={({ pressed }) => [styles.keepLink, pressed && styles.pressed]}>
            <Text style={[styles.logItemText, styles.keepText]}>Keep it</Text>
          </Pressable>
        </View>
      ) : (
        <Button
          label={logButtonLabel}
          variant={mealDone ? 'outline' : 'solid'}
          // A done "Logged ✓" stays tappable to undo an accidental log.
          onPress={mealDone ? () => setConfirming('meal') : handleLog}
          disabled={status === 'saving' || (!mealDone && remainingItems.length === 0)}
          style={styles.logButton}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  meal: { marginTop: space.xs },
  mealPeriod: { ...type.kicker },
  mealName: { fontFamily: 'Fraunces_600SemiBold', fontSize: 19, color: colors.ink, marginTop: space.xs, marginBottom: space.xs },
  rationale: { fontFamily: 'Fraunces_500Medium_Italic', fontSize: 14, color: colors.inkSecondary, marginBottom: space.md },
  roleGroup: { marginBottom: space.sm },
  roleLabel: { ...type.kicker, fontSize: 11, color: colors.inkTertiary, marginBottom: space.xs },
  item: { paddingVertical: space.xs },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, paddingRight: space.sm },
  itemName: { ...type.body, fontSize: 14, flexShrink: 1 },
  itemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  itemCaption: { fontFamily: 'IBMPlexMono_400Regular', color: colors.inkSecondary, fontSize: 12, flexShrink: 1 },
  logItemText: { ...type.kicker, fontSize: 11, color: colors.accent },
  logItemTextDisabled: { color: colors.inkTertiary },
  keepText: { color: colors.inkSecondary },
  // gap clears 2× hitSlop (14+14) so Remove and Keep never share a tap area.
  confirmLinks: { flexDirection: 'row', gap: space.xxl },
  mealConfirm: { marginTop: space.md },
  mealConfirmText: { ...type.body, fontSize: 14, marginBottom: space.md },
  undoError: { ...type.body, fontSize: 13, color: colors.accent, marginBottom: space.sm },
  keepLink: { alignSelf: 'center', marginTop: space.md },
  pressed: { opacity: interaction.pressedOpacity },
  totals: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.hairline },
  totalsText: { ...type.monoEmphasis },
  loggedProgress: { marginTop: space.md },
  logButton: { marginTop: space.md },
});
