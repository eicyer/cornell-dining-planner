import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ExerciseActivity,
  ExerciseEntry,
  LoggedMeal,
  MEAL_SECTIONS,
  MealSection,
  Preferences,
  QuickAddEntry,
  Streak,
  Totals,
  getExercise,
  getExerciseActivities,
  getLoggedMeals,
  getPreferences,
  getQuickAdds,
  getStreak,
  rateMeal,
} from './api';
import CalorieSummary from './components/CalorieSummary';
import ExerciseBlock from './components/ExerciseBlock';
import MealSectionBlock from './components/MealSectionBlock';
import TopInset from './components/TopInset';
import WeekStrip from './components/WeekStrip';
import { longDateLabel, todayString } from './dates';
import { light } from './haptics';
import { colors, space, type } from './theme';

// `onLog` opens Add Food for a section (docs/adr/0030).
export default function DiaryScreen({ onLog }: { onLog: (section: MealSection) => void }) {
  const today = todayString();
  const [selectedDate, setSelectedDate] = useState(today);
  const [meals, setMeals] = useState<LoggedMeal[] | null>(null);
  const [quickAdds, setQuickAdds] = useState<QuickAddEntry[]>([]);
  const [exercise, setExercise] = useState<ExerciseEntry[]>([]);
  const [activities, setActivities] = useState<ExerciseActivity[]>([]);
  // False only until the first load finishes — later day switches show
  // a spinner inside the sections instead of blanking the screen.
  const [loaded, setLoaded] = useState(false);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fire-and-forget: the streak line is decoration, never worth an error.
  function refreshStreak() {
    getStreak().then(setStreak, () => {});
  }

  async function load(date: string) {
    refreshStreak();
    try {
      const [m, q, e, p] = await Promise.all([
        getLoggedMeals(date),
        getQuickAdds(date),
        getExercise(date),
        getPreferences(),
      ]);
      setMeals(m);
      setQuickAdds(q);
      setExercise(e);
      setPrefs(p);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message);
    }
  }

  // The activity list is static per deploy; fetched once, and the Exercise
  // form just shows "Other" until it arrives.
  useEffect(() => {
    getExerciseActivities().then(setActivities, () => {});
  }, []);

  // Food is added on the pushed Add Food screen, so refetch on return.
  // Skips the first focus — the selectedDate effect below does that load.
  // The date is read through a ref so a day switch doesn't re-run this.
  const focusedOnce = useRef(false);
  const dateRef = useRef(selectedDate);
  dateRef.current = selectedDate;
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) load(dateRef.current);
      focusedOnce.current = true;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  useEffect(() => {
    setMeals(null);
    setExercise([]);
    setQuickAdds([]);
    load(selectedDate);
  }, [selectedDate]);

  async function handleRefresh() {
    setRefreshing(true);
    await load(selectedDate);
    setRefreshing(false);
  }

  async function handleRate(meal: LoggedMeal, liked: boolean) {
    light();
    const newValue = meal.liked === liked ? null : liked;
    const updated = await rateMeal(meal.id, newValue);
    setMeals((prev) => (prev ? prev.map((m) => (m.id === meal.id ? updated : m)) : prev));
  }

  function handleChanged(updated: LoggedMeal) {
    setMeals((prev) => (prev ? prev.map((m) => (m.id === updated.id ? updated : m)) : prev));
  }

  function handleDeleted(mealId: number) {
    setMeals((prev) => (prev ? prev.filter((m) => m.id !== mealId) : prev));
    refreshStreak();
  }

  // Covers both a new entry and an edit (which may have moved it to
  // another section — sections filter by meal_section, so it just moves).
  function handleQuickAddSaved(entry: QuickAddEntry) {
    setQuickAdds((prev) =>
      prev.some((q) => q.id === entry.id) ? prev.map((q) => (q.id === entry.id ? entry : q)) : [...prev, entry]
    );
    refreshStreak();
  }

  function handleQuickAddDeleted(entryId: number) {
    setQuickAdds((prev) => prev.filter((q) => q.id !== entryId));
    refreshStreak();
  }

  function handleExerciseSaved(entry: ExerciseEntry) {
    setExercise((prev) =>
      prev.some((e) => e.id === entry.id) ? prev.map((e) => (e.id === entry.id ? entry : e)) : [...prev, entry]
    );
  }

  function handleExerciseDeleted(entryId: number) {
    setExercise((prev) => prev.filter((e) => e.id !== entryId));
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load diary: {error}</Text>
      </View>
    );
  }

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const dayTotals = sumTotals([...(meals ?? []).map((m) => m.totals), ...quickAdds]);
  const goal: Totals = prefs
    ? { calories: prefs.calorie_goal, protein_g: prefs.protein_goal_g, carbs_g: prefs.carb_goal_g, fat_g: prefs.fat_goal_g }
    : ZERO_TOTALS;
  // Defaults to counting exercise until preferences load (the server default).
  const exerciseAddsToGoal = prefs?.exercise_adds_to_goal ?? true;
  const exerciseCalories = exercise.reduce((sum, e) => sum + e.calories, 0);
  // Menu logging goes through today's live menus only (the add-food flow
  // for other days is wayfinder #58); Quick Add works on any shown day.
  const canLog = selectedDate === today;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      // Index 2 is CalorieSummary (after TopInset and the title block) —
      // it stays pinned while the sections scroll under it (MyFitnessPal's
      // unpinned summary was its top redesign complaint).
      stickyHeaderIndices={[2]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
    >
      <TopInset />

      <View>
        <Text style={styles.kicker}>{selectedDate === today ? 'Today' : longDateLabel(selectedDate)}</Text>
        <Text style={styles.title}>Diary</Text>
        <WeekStrip selected={selectedDate} today={today} onSelect={setSelectedDate} />
        {selectedDate === today && streak && streak.days >= 2 && (
          <Text style={styles.streak}>
            {streak.days} days in a row{streak.logged_today ? '' : ' — log today to keep it going'}
          </Text>
        )}
      </View>

      <CalorieSummary totals={dayTotals} goal={goal} exercise={exerciseAddsToGoal ? exerciseCalories : 0} />

      <View>
        {!meals ? (
          <ActivityIndicator style={styles.sectionsLoading} color={colors.accent} />
        ) : (
          MEAL_SECTIONS.map((section) => (
            <MealSectionBlock
              key={section}
              section={section}
              date={selectedDate}
              meals={meals.filter((m) => m.meal_section === section)}
              quickAdds={quickAdds.filter((q) => q.meal_section === section)}
              onLog={canLog ? () => onLog(section) : undefined}
              onRate={handleRate}
              onChanged={handleChanged}
              onDeleted={handleDeleted}
              onQuickAddSaved={handleQuickAddSaved}
              onQuickAddDeleted={handleQuickAddDeleted}
            />
          ))
        )}
        {meals && (
          <ExerciseBlock
            date={selectedDate}
            entries={exercise}
            activities={activities}
            addsToGoal={exerciseAddsToGoal}
            onSaved={handleExerciseSaved}
            onDeleted={handleExerciseDeleted}
          />
        )}
      </View>
    </ScrollView>
  );
}

const ZERO_TOTALS: Totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

// Logged Meal totals and Quick Add Entries share the Totals shape.
function sumTotals(parts: Totals[]): Totals {
  return parts.reduce(
    (t, p) => ({
      calories: t.calories + p.calories,
      protein_g: t.protein_g + p.protein_g,
      carbs_g: t.carbs_g + p.carbs_g,
      fat_g: t.fat_g + p.fat_g,
    }),
    ZERO_TOTALS
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  // No paddingTop: TopInset owns the status-bar/notch clearance for this screen.
  content: { paddingHorizontal: space.lg, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.paper },
  error: { ...type.body, color: colors.accent, textAlign: 'center' },
  kicker: { ...type.kicker, marginBottom: space.xs },
  title: { ...type.display, fontSize: 28, marginBottom: space.lg },
  // Quiet on purpose (docs/adr/0032): caption ink, no accent, no badge.
  streak: { ...type.caption, marginTop: space.sm },
  sectionsLoading: { marginTop: space.xxl },
});
