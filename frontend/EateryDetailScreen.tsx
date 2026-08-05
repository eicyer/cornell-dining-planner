import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EateryMenu, LoggedMeal, logMeal } from './api';
import { describePortion } from './foodDensity';
import { colors, radius, space, type } from './theme';

export default function EateryDetailScreen({
  eatery,
  onBack,
  onLogged,
}: {
  eatery: EateryMenu;
  onBack: () => void;
  onLogged: (meal: LoggedMeal) => void;
}) {
  const [eventIndex, setEventIndex] = useState(0);
  const [grams, setGrams] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>{'← Back'}</Text>
        </Pressable>
        <Text style={styles.title}>{eatery.name}</Text>

        {eatery.menu_events.length > 1 && (
          <View style={styles.tabs}>
            {eatery.menu_events.map((e, i) => (
              <Pressable key={e.meal_period} onPress={() => setEventIndex(i)} style={[styles.tab, i === eventIndex && styles.tabActive]}>
                <Text style={[styles.tabText, i === eventIndex && styles.tabTextActive]}>{e.meal_period}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {event.categories.map((category) => (
          <View key={category.category} style={styles.category}>
            <Text style={styles.categoryTitle}>{category.category}</Text>
            {category.items.map((item) => {
              const enteredGrams = grams[item.name] ?? 0;
              const portion = enteredGrams > 0 ? describePortion({ name: item.name, grams: enteredGrams }) : '';
              return (
                <View key={item.name} style={styles.itemRow}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemCalories}>
                      {item.nutrition ? `${Math.round(item.nutrition.calories_per_100g)} cal/100g` : 'no nutrition data'}
                      {portion ? ` · ${portion}` : ''}
                    </Text>
                  </View>
                  <TextInput
                    style={styles.gramsInput}
                    keyboardType="numeric"
                    placeholder="0g"
                    placeholderTextColor={colors.inkTertiary}
                    value={grams[item.name] ? String(grams[item.name]) : ''}
                    editable={!!item.nutrition}
                    onChangeText={(text) =>
                      setGrams({ ...grams, [item.name]: Number(text.replace(/[^0-9]/g, '')) || 0 })
                    }
                  />
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <View style={styles.tray}>
        {error && <Text style={styles.error}>{error}</Text>}
        <Text style={styles.trayText}>
          {itemCount} item{itemCount === 1 ? '' : 's'} · {Math.round(totals.calories)} cal ·{' '}
          {Math.round(totals.protein_g)}g protein
        </Text>
        <Pressable style={[styles.logButton, itemCount === 0 && styles.logButtonDisabled]} onPress={handleLog} disabled={itemCount === 0 || saving}>
          <Text style={styles.logButtonText}>{saving ? 'Logging…' : 'Log Meal →'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingTop: 56, paddingBottom: 24, maxWidth: 640, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  back: { ...type.body, fontSize: 13, color: colors.inkSecondary, marginBottom: space.sm },
  backButton: { marginTop: space.lg, padding: space.md },
  backButtonText: { ...type.body, color: colors.accent, fontFamily: 'Archivo_600SemiBold' },
  title: { fontFamily: 'Fraunces_700Bold', fontSize: 30, lineHeight: 36, color: colors.ink, marginBottom: space.lg },
  tabs: { flexDirection: 'row', marginBottom: space.xl, gap: space.lg },
  tab: { paddingVertical: space.xs, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { ...type.kicker },
  tabTextActive: { color: colors.ink },
  category: { marginBottom: space.xl },
  categoryTitle: {
    ...type.kicker,
    marginBottom: space.sm,
    paddingBottom: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  itemInfo: { flex: 1, paddingRight: space.md },
  itemName: { ...type.body, fontSize: 14 },
  itemCalories: { ...type.caption },
  gramsInput: {
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    borderRadius: radius.none,
    width: 56,
    textAlign: 'center',
    paddingVertical: space.xs,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 14,
    color: colors.ink,
  },
  tray: { borderTopWidth: 1, borderTopColor: colors.hairline, padding: space.lg, backgroundColor: colors.paper },
  trayText: { ...type.monoEmphasis, marginBottom: space.sm, textAlign: 'center' },
  error: { ...type.body, color: colors.accent, marginBottom: space.sm, textAlign: 'center' },
  logButton: { backgroundColor: colors.accent, borderRadius: radius.none, paddingVertical: 14, alignItems: 'center' },
  logButtonDisabled: { backgroundColor: colors.disabled },
  logButtonText: { ...type.button },
});
