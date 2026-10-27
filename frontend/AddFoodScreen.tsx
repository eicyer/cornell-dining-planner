import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Plus from 'lucide-react-native/icons/plus';
import Search from 'lucide-react-native/icons/search';
import {
  EateryMenu,
  LoggedMeal,
  MealSection,
  MenuEventOut,
  MenuItemOut,
  Recents,
  deleteMeal,
  getMenusToday,
  getRecents,
  logMeal,
  updateMealItems,
} from './api';
import Button from './components/Button';
import Chip from './components/Chip';
import Icon from './components/Icon';
import PortionStepper from './components/PortionStepper';
import Tab from './components/Tab';
import { describePortion, getPortionUnit } from './foodDensity';
import { light, success } from './haptics';
import { colors, interaction, radius, space, touchTarget, type } from './theme';

const SECTION_LABELS: Record<MealSection, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

// Serving order, for listing a hall's matching periods (e.g. Lunch before
// Late Lunch). Unknown periods sort last.
const PERIOD_ORDER = ['Breakfast', 'Brunch', 'Lunch', 'Late Lunch', 'Dinner', 'Late Night'];

type LastAdd = { meal: LoggedMeal; name: string; grams: number; eateryName: string };

// Add Food (docs/adr/0030): opened from a Diary Meal Section's "+ Log".
// Offers only the halls serving that section today, defaults to the hall
// the user last logged this section from, and logs each "+" immediately at
// one portion (or a recent item's last-used grams) with an Undo for the
// last add. Every tap is saved, so backing out never loses anything.
export default function AddFoodScreen({ section, onDone }: { section: MealSection; onDone: () => void }) {
  const [menus, setMenus] = useState<EateryMenu[] | null>(null);
  const [recents, setRecents] = useState<Recents | null>(null);
  const [hallId, setHallId] = useState<number | null>(null);
  const [periodIndex, setPeriodIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [busyItem, setBusyItem] = useState<string | null>(null);
  // Item name -> how many times it's been added this visit, for the row label.
  const [addedCounts, setAddedCounts] = useState<Record<string, number>>({});
  const [lastAdd, setLastAdd] = useState<LastAdd | null>(null);
  // The one row whose portion picker is open (docs/adr/0034), keyed by
  // group too since an item can appear under "Had before" and its station.
  const [picker, setPicker] = useState<{ key: string; grams: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMenusToday(), getRecents().catch(() => null)])
      .then(([m, r]) => {
        if (cancelled) return;
        setMenus(m);
        setRecents(r);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const halls = useMemo(
    () => (menus ?? []).filter((e) => e.menu_events.some((ev) => ev.meal_section === section)),
    [menus, section]
  );

  // Default hall: where this section was last logged from, if it's serving
  // it today; otherwise the first hall that is.
  useEffect(() => {
    if (hallId !== null || halls.length === 0) return;
    const last = recents?.last_eatery_by_section[section];
    setHallId(halls.some((h) => h.id === last) ? last! : halls[0].id);
  }, [halls, recents, section, hallId]);

  const hall = halls.find((h) => h.id === hallId) ?? null;
  const events = useMemo(
    () => (hall ? hall.menu_events.filter((ev) => ev.meal_section === section).sort(byServingOrder) : []),
    [hall, section]
  );
  const event: MenuEventOut | null = events[Math.min(periodIndex, events.length - 1)] ?? null;

  const recentGrams = useMemo(() => new Map((recents?.items ?? []).map((i) => [i.name, i.grams])), [recents]);
  const needle = query.trim().toLowerCase();
  const matches = (item: MenuItemOut) => !needle || item.name.toLowerCase().includes(needle);
  const allItems = event ? event.categories.flatMap((c) => c.items) : [];
  const hadBefore = allItems.filter((i) => recentGrams.has(i.name) && matches(i));

  function selectHall(id: number) {
    light();
    setHallId(id);
    setPeriodIndex(0);
    setQuery('');
    setPicker(null);
  }

  async function add(item: MenuItemOut, grams: number) {
    if (!hall || !event) return;
    setBusyItem(item.name);
    setError(null);
    try {
      const meal = await logMeal(hall.id, event.meal_period, [{ name: item.name, grams }]);
      success();
      setAddedCounts((c) => ({ ...c, [item.name]: (c[item.name] ?? 0) + 1 }));
      setLastAdd({ meal, name: item.name, grams, eateryName: hall.name });
      setPicker(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyItem(null);
    }
  }

  // Takes back exactly the last add: shrinks that line by the grams just
  // added (dropping it if nothing's left), or deletes the Logged Meal if
  // that add was all it held.
  async function undo() {
    if (!lastAdd) return;
    const { meal, name, grams } = lastAdd;
    const remaining = meal.items
      .map((i) => ({ name: i.name, grams: i.name === name ? i.grams - grams : i.grams }))
      .filter((i) => i.grams > 0.5);
    setBusyItem(name);
    setError(null);
    try {
      if (remaining.length === 0) await deleteMeal(meal.id);
      else await updateMealItems(meal.id, remaining);
      light();
      setAddedCounts((c) => ({ ...c, [name]: Math.max(0, (c[name] ?? 1) - 1) }));
      setLastAdd(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyItem(null);
    }
  }

  if (error && !menus) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load today's menus: {error}</Text>
      </View>
    );
  }

  if (!menus) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const label = SECTION_LABELS[section];

  function renderRow(item: MenuItemOut, grams: number, group: string) {
    const count = addedCounts[item.name] ?? 0;
    const calories = item.nutrition ? (item.nutrition.calories_per_100g * grams) / 100 : null;
    const portion = describePortion({ name: item.name, grams });
    const key = `${group}:${item.name}`;
    const open = picker?.key === key;
    return (
      <View key={key}>
        <View style={[styles.row, open && styles.rowOpen]}>
          <Pressable
            onPress={() => {
              light();
              setPicker(open ? null : { key, grams });
            }}
            disabled={!item.nutrition}
            accessibilityRole="button"
            accessibilityLabel={`Choose a portion of ${item.name}`}
            style={({ pressed }) => [styles.rowText, pressed && styles.pressed]}
          >
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemFigures}>
              {calories == null
                ? 'No nutrition data'
                : `${portion ? `${portion} · ` : ''}${Math.round(grams)}g · ${Math.round(calories)} cal`}
              {count > 0 ? `  ·  Added${count > 1 ? ` ×${count}` : ''}` : ''}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => add(item, grams)}
            disabled={!item.nutrition || busyItem !== null}
            hitSlop={8}
            accessibilityLabel={`Add ${item.name}`}
            style={({ pressed }) => [
              styles.addButton,
              (!item.nutrition || busyItem !== null) && styles.addButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            {busyItem === item.name && !open ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Icon icon={Plus} size="md" color={item.nutrition ? 'accent' : 'inkSecondary'} />
            )}
          </Pressable>
        </View>
        {open && item.nutrition && renderPicker(item, grams, picker.grams)}
      </View>
    );
  }

  // Inline under the row (docs/adr/0034): step the portion, see the
  // calories, then add exactly that amount. "+" stays the one-tap path.
  function renderPicker(item: MenuItemOut, defaultGrams: number, grams: number) {
    const calories = (item.nutrition!.calories_per_100g * grams) / 100;
    const portion = describePortion({ name: item.name, grams }).replace(/^≈ /, '');
    return (
      <View style={styles.picker}>
        <View style={styles.pickerRow}>
          <Text style={styles.pickerCalories}>{Math.round(calories)} cal</Text>
          <PortionStepper
            name={item.name}
            originalGrams={defaultGrams}
            grams={grams}
            onChange={(g) => setPicker((p) => (p ? { ...p, grams: g } : p))}
            disabled={busyItem !== null}
          />
        </View>
        <View style={styles.pickerActions}>
          <Button variant="secondary" label="Cancel" onPress={() => setPicker(null)} style={styles.pickerCancel} />
          <Button
            label={busyItem === item.name ? 'Adding…' : `Add ${portion || `${Math.round(grams)}g`}`}
            onPress={() => add(item, grams)}
            disabled={grams <= 0 || busyItem !== null}
            style={styles.pickerAdd}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Today · {label}</Text>
        <Text style={styles.title}>Add to {label.toLowerCase()}</Text>

        {halls.length === 0 ? (
          <Text style={styles.empty}>
            No dining hall is serving {label.toLowerCase()} today. Use Quick add on the Diary for food from anywhere
            else.
          </Text>
        ) : (
          <>
            <View style={styles.chipRow}>
              {halls.map((h) => (
                <Chip key={h.id} label={h.name} selected={h.id === hallId} onPress={() => selectHall(h.id)} />
              ))}
            </View>

            {events.length > 1 && (
              <View style={styles.tabs}>
                {events.map((ev, i) => (
                  <Tab
                    key={ev.meal_period}
                    label={ev.meal_period}
                    active={ev === event}
                    onPress={() => setPeriodIndex(i)}
                  />
                ))}
              </View>
            )}

            <View style={styles.searchRow}>
              <Icon icon={Search} size="sm" color="inkSecondary" />
              <TextInput
                style={styles.search}
                placeholder={hall ? `Search ${hall.name}` : 'Search'}
                placeholderTextColor={colors.inkTertiary}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
            </View>

            {hadBefore.length > 0 && (
              <View style={styles.group}>
                <Text style={styles.groupTitle}>Had before</Text>
                {hadBefore.map((item) => renderRow(item, recentGrams.get(item.name)!, 'recent'))}
              </View>
            )}

            {event?.categories.map((category) => {
              const items = category.items.filter(matches);
              if (items.length === 0) return null;
              return (
                <View key={category.category} style={styles.group}>
                  <Text style={styles.groupTitle}>{category.category}</Text>
                  {items.map((item) => renderRow(item, getPortionUnit(item).gramsPerUnit, category.category))}
                </View>
              );
            })}

            {needle && allItems.filter(matches).length === 0 && (
              <Text style={styles.empty}>Nothing matching "{query.trim()}" at {hall?.name}.</Text>
            )}
          </>
        )}
      </ScrollView>

      {(lastAdd || error) && (
        <View style={styles.tray}>
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            lastAdd && (
              <View style={styles.trayRow}>
                <Text style={styles.trayText} numberOfLines={2}>
                  Added {lastAdd.name} to your {lastAdd.eateryName} {label.toLowerCase()}
                </Text>
                <Pressable onPress={undo} disabled={busyItem !== null} hitSlop={12} style={({ pressed }) => pressed && styles.pressed}>
                  <Text style={styles.undo}>Undo</Text>
                </Pressable>
              </View>
            )
          )}
          <Pressable onPress={onDone} hitSlop={8} style={({ pressed }) => [styles.done, pressed && styles.pressed]}>
            <Text style={styles.doneText}>Done →</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function byServingOrder(a: MenuEventOut, b: MenuEventOut): number {
  const rank = (p: string) => (PERIOD_ORDER.includes(p) ? PERIOD_ORDER.indexOf(p) : PERIOD_ORDER.length);
  return rank(a.meal_period) - rank(b.meal_period);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  content: { padding: space.lg, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.paper },
  kicker: { ...type.kicker, marginBottom: space.xs },
  title: { ...type.display, fontSize: 28, marginBottom: space.lg },
  empty: { ...type.editorialItalic, marginTop: space.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, marginBottom: space.sm },
  tabs: { flexDirection: 'row', gap: space.lg, marginBottom: space.sm },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  search: {
    flex: 1,
    minHeight: touchTarget.min,
    borderRadius: radius.none,
    fontFamily: 'Archivo_400Regular',
    fontSize: 15,
    color: colors.ink,
  },
  group: { marginTop: space.lg },
  groupTitle: {
    ...type.kicker,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  rowText: { flex: 1 },
  // The open row drops its rule so it and its picker read as one block.
  rowOpen: { borderBottomWidth: 0 },
  picker: { gap: space.md, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  pickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerCalories: { ...type.monoEmphasis },
  pickerActions: { flexDirection: 'row', gap: space.md },
  pickerCancel: { flex: 1 },
  pickerAdd: { flex: 2 },
  itemName: { ...type.body, fontSize: 14 },
  itemFigures: { ...type.mono, fontSize: 12, color: colors.inkTertiary },
  // 28 + hitSlop 8 on each side = 44pt (touchTarget.min).
  addButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  addButtonDisabled: { opacity: 0.4 },
  pressed: { opacity: interaction.pressedOpacity },
  tray: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.paper,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
  },
  trayRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  trayText: { ...type.body, fontSize: 14, flex: 1 },
  undo: { ...type.kicker, color: colors.accent },
  done: { alignSelf: 'flex-end', paddingVertical: space.xs },
  doneText: { ...type.kicker, color: colors.ink },
  error: { ...type.body, fontSize: 13, color: colors.accent },
});
