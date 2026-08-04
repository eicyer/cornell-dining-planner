import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DaySummary, LoggedMeal, getLoggedMealsSummary, getLoggedMealsToday, rateMeal } from './api';
import { colors, radius, space, type } from './theme';

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
        <ActivityIndicator size="large" color={colors.accent} />
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

      <View style={styles.progressSection}>
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
                {item.name}{' '}
                <Text style={styles.itemFigures}>
                  ({Math.round(item.grams)}g) — {Math.round(item.calories)} cal
                </Text>
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
      <View style={styles.progressLabelRow}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressFigures}>
          {Math.round(value)}
          {unit} / {Math.round(goal)}
          {unit}
        </Text>
      </View>
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingTop: 56, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.paper },
  error: { ...type.body, color: colors.accent, textAlign: 'center' },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.xl },
  title: { ...type.display, fontSize: 28 },
  navLink: { ...type.kicker, color: colors.accent },
  progressSection: {
    marginBottom: space.xxl,
    paddingBottom: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  progressTitle: { ...type.kicker, marginBottom: space.md },
  progressRow: { marginBottom: space.md },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.xs },
  progressLabel: { ...type.body, fontSize: 14 },
  progressFigures: { ...type.mono },
  progressBarTrack: { height: 4, borderRadius: radius.none, backgroundColor: colors.disabled, overflow: 'hidden' },
  progressBarFill: { height: 4, backgroundColor: colors.accent },
  sectionTitle: {
    ...type.kicker,
    marginBottom: space.md,
    marginTop: space.sm,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  empty: { fontFamily: 'Fraunces_500Medium_Italic', fontSize: 15, color: colors.inkSecondary, marginBottom: space.lg },
  mealCard: {
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    paddingVertical: space.lg,
  },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  mealEatery: { fontFamily: 'Fraunces_600SemiBold', fontSize: 16, color: colors.ink },
  rateButtons: { flexDirection: 'row', gap: space.sm },
  rateButton: { fontSize: 16, opacity: 0.35 },
  rateButtonActive: { opacity: 1 },
  itemText: { ...type.body, fontSize: 14 },
  itemFigures: { ...type.mono, fontSize: 13 },
  mealTotals: { ...type.monoEmphasis, marginTop: space.sm },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  weekDate: { ...type.body, fontSize: 13, color: colors.inkSecondary },
  weekCalories: { ...type.mono },
});
