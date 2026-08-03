import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EateryCrafted, logMeal } from './api';

type LogStatus = 'idle' | 'saving' | 'done' | 'error';

export default function CraftedMealsList({
  eateries,
  onGoToDiary,
  onSelectEatery,
}: {
  eateries: EateryCrafted[];
  onGoToDiary: () => void;
  onSelectEatery: (eateryId: number) => void;
}) {
  const [logStatus, setLogStatus] = useState<Record<number, LogStatus>>({});

  async function handleLog(eatery: EateryCrafted) {
    if (!eatery.crafted_meal || !eatery.meal_period) return;
    setLogStatus({ ...logStatus, [eatery.id]: 'saving' });
    try {
      await logMeal(
        eatery.id,
        eatery.meal_period,
        eatery.crafted_meal.items.map((i) => ({ name: i.name, grams: i.grams }))
      );
      setLogStatus({ ...logStatus, [eatery.id]: 'done' });
    } catch {
      setLogStatus({ ...logStatus, [eatery.id]: 'error' });
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.nav}>
        <Text style={styles.title}>Today's Meals For You</Text>
        <Pressable onPress={onGoToDiary}>
          <Text style={styles.navLink}>Diary</Text>
        </Pressable>
      </View>

      {eateries.map((eatery) => {
        const status = logStatus[eatery.id] ?? 'idle';
        return (
          <View key={eatery.id} style={styles.eatery}>
            <Pressable onPress={() => onSelectEatery(eatery.id)}>
              <Text style={styles.eateryName}>{eatery.name} →</Text>
            </Pressable>

            {!eatery.crafted_meal ? (
              <Text style={styles.unavailable}>{eatery.reason_unavailable ?? 'Not available today'}</Text>
            ) : (
              <View style={styles.meal}>
                <Text style={styles.mealPeriod}>{eatery.meal_period}</Text>
                <Text style={styles.mealName}>{eatery.crafted_meal.name}</Text>
                <Text style={styles.rationale}>{eatery.crafted_meal.rationale}</Text>

                {eatery.crafted_meal.items.map((item) => (
                  <View key={item.name} style={styles.item}>
                    <Text style={styles.itemName}>
                      {item.name} <Text style={styles.itemGrams}>({Math.round(item.grams)}g)</Text>
                    </Text>
                    <Text style={styles.itemCalories}>{Math.round(item.calories)} cal</Text>
                  </View>
                ))}

                <View style={styles.totals}>
                  <Text style={styles.totalsText}>
                    {Math.round(eatery.crafted_meal.totals.calories)} cal ·{' '}
                    {Math.round(eatery.crafted_meal.totals.protein_g)}g protein ·{' '}
                    {Math.round(eatery.crafted_meal.totals.carbs_g)}g carbs ·{' '}
                    {Math.round(eatery.crafted_meal.totals.fat_g)}g fat
                  </Text>
                </View>

                <Pressable
                  style={[styles.logButton, status === 'done' && styles.logButtonDone]}
                  onPress={() => handleLog(eatery)}
                  disabled={status === 'saving' || status === 'done'}
                >
                  <Text style={styles.logButtonText}>
                    {status === 'saving' ? 'Logging…' : status === 'done' ? 'Logged ✓' : status === 'error' ? 'Failed — try again' : 'Log this meal'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingTop: 56, maxWidth: 640, width: '100%', alignSelf: 'center' },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700' },
  navLink: { fontSize: 14, fontWeight: '600', color: '#111827' },
  eatery: { marginBottom: 24, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 16 },
  eateryName: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  unavailable: { color: '#9ca3af', fontStyle: 'italic' },
  meal: { marginTop: 4 },
  mealPeriod: { fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' },
  mealName: { fontSize: 16, fontWeight: '600', marginTop: 2, marginBottom: 2 },
  rationale: { fontSize: 13, color: '#6b7280', marginBottom: 8, fontStyle: 'italic' },
  item: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  itemName: { fontSize: 14, flexShrink: 1, paddingRight: 8 },
  itemGrams: { color: '#9ca3af' },
  itemCalories: { fontSize: 14, color: '#6b7280' },
  totals: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  totalsText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  logButton: { marginTop: 12, backgroundColor: '#111827', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  logButtonDone: { backgroundColor: '#059669' },
  logButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
