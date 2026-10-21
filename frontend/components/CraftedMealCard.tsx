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
  // The Logged Meal individually-logged items landed in, as of the latest
  // response, and each such item's grams in it — what "Update" compares the
  // stepper against and what its PATCH rewrites.
  const [loggedMeal, setLoggedMeal] = useState<LoggedMeal | null>(null);
  const [loggedGrams, setLoggedGrams] = useState<Record<string, number>>({});
  // What "Log this meal" / "Log the rest" sent, so undoing it takes back
  // exactly that — the Logged Meal may also hold items logged elsewhere.
  const [wholeMealLog, setWholeMealLog] = useState<{ meal: LoggedMeal; sent: { name: string; grams: number }[] } | null>(null);
  // Which "Logged ✓" is showing its remove/keep choice: an item name, the
  // whole meal, or none.
  const [confirming, setConfirming] = useState<{ item: string } | 'meal' | null>(null);
  const [undoError, setUndoError] = useState(false);
  useEffect(() => {
    setGrams(Object.fromEntries(meal.items.map((i) => [i.name, i.grams])));
    setItemStatus({});
    setLoggedMeal(null);
    setLoggedGrams({});
    setWholeMealLog(null);
    setConfirming(null);
  }, [meal]);

  const scaledItems = useMemo(
    () => meal.items.map((item) => scaleItem(item, grams[item.name] ?? item.grams)),
    [meal.items, grams]
  );
  const totals = useMemo(() => sumTotals(scaledItems), [scaledItems]);

  const itemColors = assignPlateColors(meal.items);
  const colorFor = (item: CraftedItem) => itemColors[item.name] ?? colors.neutralFallback;

  function handleGramsChange(name: string, newGrams: number) {
    setGrams((g) => ({ ...g, [name]: Math.max(0, newGrams) }));
  }

  // Items already logged one-by-one are left out of the whole-meal log so
  // nothing gets counted twice in the diary.
  const isItemLogged = (name: string) => name in loggedGrams;
  const remainingItems = scaledItems.filter((i) => i.grams > 0 && !isItemLogged(i.name));
  const someItemsLogged = scaledItems.some((i) => isItemLogged(i.name));
  const mealDone = status === 'done' || (someItemsLogged && remainingItems.length === 0);

  async function handleLog() {
    // A stepper dragged to 0g reads as "leave this off the plate" rather
    // than logging a zero-gram line item.
    const sent = remainingItems.map((i) => ({ name: i.name, grams: i.grams }));
    const logged = await onLog(sent);
    if (logged) setWholeMealLog({ meal: logged, sent });
  }

  // Takes items back out of a Logged Meal: a number subtracts that many
  // grams, 'all' drops the line. Built from a fresh read for the same
  // reason as handleUpdateItem; deletes the meal if nothing's left, and is
  // a no-op if the meal was already deleted elsewhere.
  async function takeBack(mealToEdit: LoggedMeal, removals: Record<string, number | 'all'>) {
    const fresh = (await getLoggedMeals(mealToEdit.date)).find((m) => m.id === mealToEdit.id);
    if (!fresh) return;
    const items = fresh.items
      .map((i) => {
        const removal = removals[i.name];
        return { name: i.name, grams: removal === 'all' ? 0 : i.grams - (removal ?? 0) };
      })
      .filter((i) => i.grams > 0.5);
    if (items.length === 0) await deleteMeal(fresh.id);
    else await updateMealItems(fresh.id, items);
  }

  async function handleRemoveItem(name: string) {
    if (!loggedMeal) return;
    setItemStatus((s) => ({ ...s, [name]: 'saving' }));
    try {
      await takeBack(loggedMeal, { [name]: 'all' });
      setLoggedGrams(({ [name]: _, ...rest }) => rest);
      setItemStatus((s) => ({ ...s, [name]: 'idle' }));
      setConfirming(null);
      success();
    } catch {
      setItemStatus((s) => ({ ...s, [name]: 'error' }));
    }
  }

  // Undoes everything this card put in the Diary: the whole-meal log's
  // grams plus any individually logged items.
  async function handleRemoveMeal() {
    const target = wholeMealLog?.meal ?? loggedMeal;
    if (!target) return;
    const removals: Record<string, number | 'all'> = {};
    for (const item of wholeMealLog?.sent ?? []) removals[item.name] = item.grams;
    for (const name of Object.keys(loggedGrams)) removals[name] = 'all';
    setUndoError(false);
    try {
      await takeBack(target, removals);
      setWholeMealLog(null);
      setLoggedMeal(null);
      setLoggedGrams({});
      setItemStatus({});
      setConfirming(null);
      onUndoLog();
      success();
    } catch {
      setUndoError(true);
    }
  }

  // Mirrors the diary after a log/update: the stepper shows what's actually
  // logged for this item, which can exceed what was just sent if the same
  // item was already in that meal (re-adding grows the portion).
  function syncLogged(updated: LoggedMeal, name: string) {
    const logged = updated.items.find((i) => i.name === name);
    setLoggedMeal(updated);
    if (logged) {
      setLoggedGrams((g) => ({ ...g, [name]: logged.grams }));
      setGrams((g) => ({ ...g, [name]: logged.grams }));
    }
  }

  async function handleLogItem(item: CraftedItem) {
    setItemStatus((s) => ({ ...s, [item.name]: 'saving' }));
    try {
      syncLogged(await onLogItem({ name: item.name, grams: item.grams }), item.name);
      setItemStatus((s) => ({ ...s, [item.name]: 'done' }));
      success();
    } catch {
      setItemStatus((s) => ({ ...s, [item.name]: 'error' }));
    }
  }

  // Sets an already-logged item's grams to the stepper's value — a PATCH,
  // not another log, since logging again would add to the portion rather
  // than replace it. 0g removes the item; removing a meal's last item
  // deletes the meal (the API rejects an empty item list).
  //
  // The PATCH replaces the meal's whole item list, so it's built from a
  // fresh read rather than `loggedMeal`: other cards for the same Menu Event
  // (Eatery Detail shows several) or the Diary may have changed that meal
  // since, and a stale list would silently drop their items.
  async function handleUpdateItem(item: CraftedItem) {
    if (!loggedMeal) return;
    setItemStatus((s) => ({ ...s, [item.name]: 'saving' }));
    try {
      const fresh = (await getLoggedMeals(loggedMeal.date)).find((m) => m.id === loggedMeal.id);
      if (!fresh) {
        // Deleted elsewhere (e.g. from the Diary) — nothing to correct, so
        // log what the stepper shows as a new entry instead.
        setLoggedGrams(({ [item.name]: _, ...rest }) => rest);
        setLoggedMeal(null);
        if (item.grams > 0) await handleLogItem(item);
        else setItemStatus((s) => ({ ...s, [item.name]: 'idle' }));
        return;
      }
      const items = fresh.items
        .map((i) => ({ name: i.name, grams: i.name === item.name ? item.grams : i.grams }))
        .filter((i) => i.grams > 0);
      if (items.length === 0) {
        await deleteMeal(loggedMeal.id);
        setLoggedMeal(null);
      } else {
        setLoggedMeal(await updateMealItems(loggedMeal.id, items));
      }
      if (item.grams > 0) {
        setLoggedGrams((g) => ({ ...g, [item.name]: item.grams }));
        setItemStatus((s) => ({ ...s, [item.name]: 'done' }));
      } else {
        setLoggedGrams(({ [item.name]: _, ...rest }) => rest);
        setItemStatus((s) => ({ ...s, [item.name]: 'idle' }));
      }
      success();
    } catch {
      setItemStatus((s) => ({ ...s, [item.name]: 'error' }));
    }
  }

  const logButtonLabel =
    mealDone ? LOG_BUTTON_LABEL.done
    : status === 'idle' && someItemsLogged ? 'Log the rest →'
    : LOG_BUTTON_LABEL[status];

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
            // Once the whole meal is logged, a per-item log would double-count.
            // Also locks individually-logged items: "Log the rest" appended
            // to the same Logged Meal, so per-item edits from here on would
            // need to know about those items too — the Diary handles that.
            const wholeMealLogged = status === 'done';
            const thisItemStatus = wholeMealLogged ? 'done' : itemStatus[item.name] ?? 'idle';
            const logged = isItemLogged(item.name);
            const changed = logged && item.grams !== loggedGrams[item.name];
            const itemAction = logged ? handleUpdateItem : handleLogItem;
            const itemLabel =
              thisItemStatus === 'saving' ? (logged ? 'Saving…' : LOG_ITEM_LABEL.saving)
              : thisItemStatus === 'error' ? LOG_ITEM_LABEL.error
              : changed ? (item.grams > 0 ? 'Update →' : 'Remove')
              : LOG_ITEM_LABEL[thisItemStatus];
            const itemDone = wholeMealLogged || (logged && !changed);
            // A settled "Logged ✓" on an individually logged item stays
            // tappable — it opens the remove/keep choice for an accidental log.
            const canRemove = logged && !changed && !wholeMealLogged && thisItemStatus !== 'saving';
            const itemLogDisabled =
              !canRemove &&
              (wholeMealLogged || thisItemStatus === 'saving' || (logged ? !changed && thisItemStatus !== 'error' : item.grams <= 0));
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
                    disabled={wholeMealLogged || thisItemStatus === 'saving'}
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
                        {itemDone && thisItemStatus !== 'saving' ? LOG_ITEM_LABEL.done : itemLabel}
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
  logButton: { marginTop: space.md },
});
