import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EateryMenu, LoggedMeal, logMeal } from './api';

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
        <Text>Closed today</Text>
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
          <Text style={styles.back}>{'< Back'}</Text>
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
            {category.items.map((item) => (
              <View key={item.name} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemCalories}>
                    {item.nutrition ? `${Math.round(item.nutrition.calories_per_100g)} cal/100g` : 'no nutrition data'}
                  </Text>
                </View>
                <TextInput
                  style={styles.gramsInput}
                  keyboardType="numeric"
                  placeholder="0g"
                  value={grams[item.name] ? String(grams[item.name]) : ''}
                  editable={!!item.nutrition}
                  onChangeText={(text) =>
                    setGrams({ ...grams, [item.name]: Number(text.replace(/[^0-9]/g, '')) || 0 })
                  }
                />
              </View>
            ))}
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
          <Text style={styles.logButtonText}>{saving ? 'Logging…' : 'Log Meal'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingTop: 56, paddingBottom: 24, maxWidth: 640, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { color: '#6b7280', marginBottom: 8 },
  backButton: { marginTop: 16, padding: 12 },
  backButtonText: { color: '#111827', fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  tabs: { flexDirection: 'row', marginBottom: 16, gap: 8 },
  tab: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: '#d1d5db' },
  tabActive: { backgroundColor: '#111827', borderColor: '#111827' },
  tabText: { color: '#374151', fontSize: 13 },
  tabTextActive: { color: '#fff' },
  category: { marginBottom: 16 },
  categoryTitle: { fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  itemInfo: { flex: 1, paddingRight: 12 },
  itemName: { fontSize: 14 },
  itemCalories: { fontSize: 12, color: '#9ca3af' },
  gramsInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, width: 64, textAlign: 'center', paddingVertical: 6 },
  tray: { borderTopWidth: 1, borderTopColor: '#e5e7eb', padding: 16, backgroundColor: '#fff' },
  trayText: { fontSize: 14, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  error: { color: '#b91c1c', marginBottom: 8, textAlign: 'center' },
  logButton: { backgroundColor: '#111827', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  logButtonDisabled: { backgroundColor: '#d1d5db' },
  logButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
