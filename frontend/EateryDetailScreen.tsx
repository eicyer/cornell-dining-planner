import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EateryCraftedOptions, EateryMenu, LoggedMeal, Totals, getCraftedMealsForEatery, logMeal } from './api';
import Button from './components/Button';
import CraftedMealCard, { LogStatus } from './components/CraftedMealCard';
import ListRow from './components/ListRow';
import PortionStepper from './components/PortionStepper';
import ProgressBar from './components/ProgressBar';
import Tab from './components/Tab';
import { getPortionUnit } from './foodDensity';
import { success } from './haptics';
import { colors, space, type } from './theme';

// Mirrors app/services/station_survey.py's STAPLE_STATIONS — keep in sync
// manually (no shared schema, same precedent as DIET_TAGS/ALLERGENS in
// api.ts). Only used to decide whether "Compare today's picks" is worth
// showing; the backend is still the source of truth for what's comparable.
const STAPLE_STATION_CATEGORIES = new Set([
  'grill', 'flat top grill', 'iron grill', 'pizza', 'pizza station', "chef's table",
]);

function hasStapleStation(eatery: EateryMenu): boolean {
  return eatery.menu_events.some((event) =>
    event.categories.some((c) => STAPLE_STATION_CATEGORIES.has(c.category.trim().toLowerCase()))
  );
}

export default function EateryDetailScreen({
  eatery,
  perMealTarget,
  onCompare,
  onLogged,
}: {
  eatery: EateryMenu;
  perMealTarget: Totals | null;
  onCompare: () => void;
  onLogged: (meal: LoggedMeal) => void;
}) {
  const [eventIndex, setEventIndex] = useState(0);
  const [grams, setGrams] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The full raw menu (manual "add an item not in the suggestions" builder)
  // stays collapsed behind an explicit tap — the suggested meal options
  // above already cover the common case, so this shouldn't compete with
  // them for scroll attention by default.
  const [showFullMenu, setShowFullMenu] = useState(false);

  const [options, setOptions] = useState<EateryCraftedOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionLogStatus, setOptionLogStatus] = useState<Record<number, LogStatus>>({});
  // Keyed by meal_period rather than index — next_meals has at most one
  // entry per period, and the period name is the natural stable key.
  const [nextMealLogStatus, setNextMealLogStatus] = useState<Record<string, LogStatus>>({});

  // Loaded separately from `eatery` (which only has the raw menu) — see the
  // "3 meal options" eatery-detail flow. Distinct request from the
  // today-list's single pick, so a lower-ranked option can be offered here
  // even though it wouldn't have been the today-list's choice.
  useEffect(() => {
    let cancelled = false;
    getCraftedMealsForEatery(eatery.id)
      .then((data) => {
        if (!cancelled) setOptions(data);
      })
      .catch((err: any) => {
        if (!cancelled) setOptionsError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [eatery.id]);

  async function handleLogOption(index: number, items: { name: string; grams: number }[]) {
    if (!options || !options.meal_period) return;
    setOptionLogStatus((s) => ({ ...s, [index]: 'saving' }));
    try {
      const logged = await logMeal(eatery.id, options.meal_period, items);
      setOptionLogStatus((s) => ({ ...s, [index]: 'done' }));
      success();
      onLogged(logged);
    } catch {
      setOptionLogStatus((s) => ({ ...s, [index]: 'error' }));
    }
  }

  async function handleLogNextMeal(mealPeriod: string, items: { name: string; grams: number }[]) {
    setNextMealLogStatus((s) => ({ ...s, [mealPeriod]: 'saving' }));
    try {
      const logged = await logMeal(eatery.id, mealPeriod, items);
      setNextMealLogStatus((s) => ({ ...s, [mealPeriod]: 'done' }));
      success();
      onLogged(logged);
    } catch {
      setNextMealLogStatus((s) => ({ ...s, [mealPeriod]: 'error' }));
    }
  }

  const event = eatery.menu_events[eventIndex];

  const totals = useMemo(() => {
    const t = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    if (!event) return t;
    for (const category of event.categories) {
      for (const item of category.items) {
        const g = grams[item.name] ?? 0;
        if (g <= 0 || !item.nutrition) continue;
        const scale = g / 100;
        t.calories += item.nutrition.calories_per_100g * scale;
        t.protein_g += item.nutrition.protein_g_per_100g * scale;
        t.carbs_g += item.nutrition.carbs_g_per_100g * scale;
        t.fat_g += item.nutrition.fat_g_per_100g * scale;
      }
    }
    return t;
  }, [grams, event]);

  const itemCount = Object.values(grams).filter((g) => g > 0).length;

  async function handleLog() {
    if (!event) return;
    setSaving(true);
    setError(null);
    try {
      const items = Object.entries(grams)
        .filter(([, g]) => g > 0)
        .map(([name, g]) => ({ name, grams: g }));
      const meal = await logMeal(eatery.id, event.meal_period, items);
      success();
      onLogged(meal);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!event) {
    return (
      <View style={styles.center}>
        <Text style={type.body}>Closed today</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{eatery.name}</Text>

        {hasStapleStation(eatery) && (
          <Pressable onPress={onCompare} style={styles.compareLink} hitSlop={6}>
            <Text style={styles.compareLinkText}>Compare today's picks →</Text>
          </Pressable>
        )}

        {!options && !optionsError && (
          <View style={styles.optionsLoading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}

        {optionsError && <Text style={styles.optionsError}>Couldn't load meal options: {optionsError}</Text>}

        {options && options.crafted_meals.length === 0 && (
          <Text style={styles.unavailable}>{options.reason_unavailable ?? 'No meal options available today'}</Text>
        )}

        {options && options.crafted_meals.length > 0 && (
          <View style={styles.options}>
            <Text style={styles.sectionTitle}>Meal options</Text>
            {options.crafted_meals.map((meal, i) => (
              <View key={i} style={styles.optionCard}>
                <CraftedMealCard
                  meal={meal}
                  mealPeriod={options.meal_period ?? ''}
                  perMealTarget={perMealTarget}
                  status={optionLogStatus[i] ?? 'idle'}
                  onLog={(items) => handleLogOption(i, items)}
                />
              </View>
            ))}
          </View>
        )}

        {options && options.next_meals.length > 0 && (
          <View style={styles.options}>
            <Text style={styles.sectionTitle}>Coming up today</Text>
            {options.next_meals.map((next) =>
              next.crafted_meal ? (
                <View key={next.meal_period} style={styles.optionCard}>
                  <CraftedMealCard
                    meal={next.crafted_meal}
                    mealPeriod={next.meal_period}
                    perMealTarget={perMealTarget}
                    status={nextMealLogStatus[next.meal_period] ?? 'idle'}
                    onLog={(items) => handleLogNextMeal(next.meal_period, items)}
                  />
                </View>
              ) : (
                <View key={next.meal_period} style={styles.optionCard}>
                  <Text style={styles.mealPeriodLabel}>{next.meal_period}</Text>
                  <Text style={styles.unavailable}>{next.reason_unavailable ?? 'No meal options available'}</Text>
                </View>
              )
            )}
          </View>
        )}

        {!showFullMenu && (
          <Button
            label="+ Add another item"
            variant="outline"
            onPress={() => setShowFullMenu(true)}
            style={styles.addMoreButton}
          />
        )}

        {showFullMenu && (
          <>
            {eatery.menu_events.length > 1 && (
              <View style={styles.tabs}>
                {eatery.menu_events.map((e, i) => (
                  <Tab key={e.meal_period} label={e.meal_period} active={i === eventIndex} onPress={() => setEventIndex(i)} />
                ))}
              </View>
            )}

            {event.categories.map((category) => (
              <View key={category.category} style={styles.category}>
                <Text style={styles.categoryTitle}>{category.category}</Text>
                {category.items.map((item) => {
                  return (
                    <ListRow key={item.name}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemCalories}>
                          {item.nutrition ? `${Math.round(item.nutrition.calories_per_100g)} cal/100g` : 'no nutrition data'}
                          {item.nutrition?.source === 'llm_estimate' ? ' · estimated' : ''}
                        </Text>
                      </View>
                      <PortionStepper
                        name={item.name}
                        originalGrams={getPortionUnit(item).gramsPerUnit}
                        grams={grams[item.name] ?? 0}
                        onChange={(g) => setGrams({ ...grams, [item.name]: g })}
                        disabled={!item.nutrition}
                      />
                    </ListRow>
                  );
                })}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {showFullMenu && (
        <View style={styles.tray}>
          {error && <Text style={styles.error}>{error}</Text>}
          {perMealTarget && itemCount > 0 && (
            <ProgressBar label="This meal" value={totals.calories} goal={perMealTarget.calories} unit=" cal" />
          )}
          <Text style={styles.trayText}>
            {itemCount} item{itemCount === 1 ? '' : 's'} · {Math.round(totals.calories)} cal ·{' '}
            {Math.round(totals.protein_g)}g protein
          </Text>
          <Button label={saving ? 'Logging…' : 'Log Meal →'} onPress={handleLog} disabled={itemCount === 0 || saving} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 24, maxWidth: 640, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  title: { fontFamily: 'Fraunces_700Bold', fontSize: 30, lineHeight: 36, color: colors.ink, marginBottom: space.sm },
  compareLink: { marginBottom: space.lg, alignSelf: 'flex-start', paddingVertical: space.sm },
  compareLinkText: { ...type.kicker, color: colors.accent },
  optionsLoading: { paddingVertical: space.xl, alignItems: 'center' },
  optionsError: { ...type.body, color: colors.accent, marginBottom: space.lg },
  unavailable: {
    fontFamily: 'Fraunces_500Medium_Italic',
    fontSize: 15,
    color: colors.inkSecondary,
    marginBottom: space.lg,
  },
  mealPeriodLabel: { ...type.kicker, marginBottom: space.xs },
  options: { marginBottom: space.md },
  sectionTitle: {
    ...type.kicker,
    marginBottom: space.md,
    paddingBottom: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  optionCard: {
    marginBottom: space.xl,
    paddingBottom: space.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  addMoreButton: { marginBottom: space.xl },
  tabs: { flexDirection: 'row', marginBottom: space.xl, gap: space.lg },
  category: { marginBottom: space.xl },
  categoryTitle: {
    ...type.kicker,
    marginBottom: space.sm,
    paddingBottom: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  itemInfo: { flex: 1, paddingRight: space.md },
  itemName: { ...type.body, fontSize: 14 },
  itemCalories: { ...type.caption },
  tray: { borderTopWidth: 1, borderTopColor: colors.hairline, padding: space.lg, backgroundColor: colors.paper },
  trayText: { ...type.monoEmphasis, marginBottom: space.sm, textAlign: 'center' },
  error: { ...type.body, color: colors.accent, marginBottom: space.sm, textAlign: 'center' },
});
