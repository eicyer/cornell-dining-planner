import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DaySummary, LoggedMeal, getLoggedMealsSummary, getLoggedMealsToday, rateMeal } from './api';

export default function DiaryScreen({ onGoToToday }: { onGoToToday: () => void }) {
  const [meals, setMeals] = useState<LoggedMeal[] | null>(null);
  const [summary, setSummary] = useState<DaySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [m, s] = await Promise.all([getLoggedMealsToday(), getLoggedMealsSummary(7)]);
      setMeals(m);
      setSummary(s);
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRate(meal: LoggedMeal, liked: boolean) {
    const newValue = meal.liked === liked ? null : liked;
    const updated = await rateMeal(meal.id, newValue);
    setMeals((prev) => (prev ? prev.map((m) => (m.id === meal.id ? updated : m)) : prev));
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load diary: {error}</Text>
      </View>
    );
  }

  if (!meals || !summary) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const today = summary[summary.length - 1];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.nav}>
        <Text style={styles.title}>Diary</Text>
        <Pressable onPress={onGoToToday}>
          <Text style={styles.navLink}>Today's Meals</Text>
        </Pressable>
      </View>

      <View style={styles.progressCard}>
        <Text style={styles.progressTitle}>Today so far</Text>
        <ProgressRow label="Calories" value={today.totals.calories} goal={today.goal.calories} />
        <ProgressRow label="Protein" value={today.totals.protein_g} goal={today.goal.protein_g} unit="g" />
        <ProgressRow label="Carbs" value={today.totals.carbs_g} goal={today.goal.carbs_g} unit="g" />
        <ProgressRow label="Fat" value={today.totals.fat_g} goal={today.goal.fat_g} unit="g" />
      </View>

      <Text style={styles.sectionTitle}>Logged today</Text>
      {meals.length === 0 ? (
        <Text style={styles.empty}>Nothing logged yet today.</Text>
      ) : (
        meals.map((meal) => (
          <View key={meal.id} style={styles.mealCard}>
            <View style={styles.mealHeader}>
              <Text style={styles.mealEatery}>
                {meal.eatery_name} · {meal.meal_period}
              </Text>
              <View style={styles.rateButtons}>
                <Pressable onPress={() => handleRate(meal, true)}>
                  <Text style={[styles.rateButton, meal.liked === true && styles.rateButtonActive]}>👍</Text>
                </Pressable>
                <Pressable onPress={() => handleRate(meal, false)}>
                  <Text style={[styles.rateButton, meal.liked === false && styles.rateButtonActive]}>👎</Text>
                </Pressable>
              </View>
            </View>
            {meal.items.map((item) => (
              <Text key={item.name} style={styles.itemText}>
                {item.name} ({Math.round(item.grams)}g) — {Math.round(item.calories)} cal
              </Text>
            ))}
            <Text style={styles.mealTotals}>
              {Math.round(meal.totals.calories)} cal · {Math.round(meal.totals.protein_g)}g protein
            </Text>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Last 7 days</Text>
      {summary.map((day) => (
        <View key={day.date} style={styles.weekRow}>
          <Text style={styles.weekDate}>{day.date}</Text>
          <Text style={styles.weekCalories}>
            {Math.round(day.totals.calories)} / {Math.round(day.goal.calories)} cal
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function ProgressRow({ label, value, goal, unit = '' }: { label: string; value: number; goal: number; unit?: string }) {
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  return (
    <View style={styles.progressRow}>
      <Text style={styles.progressLabel}>
        {label}: {Math.round(value)}
        {unit} / {Math.round(goal)}
        {unit}
      </Text>
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingTop: 56, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#b91c1c', textAlign: 'center' },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700' },
  navLink: { fontSize: 14, fontWeight: '600', color: '#111827' },
  progressCard: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 16, marginBottom: 24 },
  progressTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  progressRow: { marginBottom: 10 },
  progressLabel: { fontSize: 13, color: '#374151', marginBottom: 4 },
  progressBarTrack: { height: 6, borderRadius: 3, backgroundColor: '#e5e7eb', overflow: 'hidden' },
  progressBarFill: { height: 6, backgroundColor: '#111827' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10, marginTop: 8 },
  empty: { color: '#9ca3af', fontStyle: 'italic', marginBottom: 16 },
  mealCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12 },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  mealEatery: { fontSize: 14, fontWeight: '600' },
  rateButtons: { flexDirection: 'row', gap: 8 },
  rateButton: { fontSize: 16, opacity: 0.35 },
  rateButtonActive: { opacity: 1 },
  itemText: { fontSize: 13, color: '#4b5563' },
  mealTotals: { fontSize: 13, fontWeight: '600', marginTop: 6, color: '#374151' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  weekDate: { fontSize: 13, color: '#374151' },
  weekCalories: { fontSize: 13, color: '#6b7280' },
});
