import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CraftedItem, CraftedMeal, PLATE_ROLE_ORDER, PlateRole, Totals } from '../api';
import { assignPlateColors } from '../foodColors';
import { describePortion } from '../foodDensity';
import { colors, space, type } from '../theme';
import Button from './Button';
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

export default function CraftedMealCard({
  meal,
  mealPeriod,
  perMealTarget,
  status,
  onLog,
}: {
  meal: CraftedMeal;
  mealPeriod: string;
  perMealTarget: Totals | null;
  status: LogStatus;
  // Receives the items actually being logged (grams as adjusted via the
  // per-item PortionStepper below), not necessarily the suggested amounts —
  // the caller logs exactly what's passed here.
  onLog: (items: { name: string; grams: number }[]) => void;
}) {
  // Keyed by item name, seeded from the suggestion. Reset on every `meal`
  // change (not just on mount) — the parent can hand this component a new
  // `meal` object without unmounting it (e.g. pull-to-refresh handing back
  // a fresh candidate for the same eatery slot), and stale gram overrides
  // from the previous meal must not silently carry over.
  const [grams, setGrams] = useState<Record<string, number>>({});
  useEffect(() => {
    setGrams(Object.fromEntries(meal.items.map((i) => [i.name, i.grams])));
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

  function handleLog() {
    // A stepper dragged to 0g reads as "leave this off the plate" rather
    // than logging a zero-gram line item.
    onLog(scaledItems.filter((i) => i.grams > 0).map((i) => ({ name: i.name, grams: i.grams })));
  }

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
                  />
                </View>
                <Text style={styles.itemCaption}>
                  {Math.round(item.grams)}g{portion ? ` · ${portion}` : ''} · {Math.round(item.calories)} cal
                </Text>
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

      <Button
        label={LOG_BUTTON_LABEL[status]}
        variant={status === 'done' ? 'outline' : 'solid'}
        onPress={handleLog}
        disabled={status === 'saving' || status === 'done'}
        style={styles.logButton}
      />
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
  itemCaption: { fontFamily: 'IBMPlexMono_400Regular', color: colors.inkSecondary, fontSize: 12, marginTop: 2 },
  totals: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.hairline },
  totalsText: { ...type.monoEmphasis },
  logButton: { marginTop: space.md },
});
