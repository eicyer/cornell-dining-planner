import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  DaySummary,
  ExerciseActivity,
  ExerciseEntry,
  LoggedMeal,
  MEAL_SECTIONS,
  Preferences,
  QuickAddEntry,
  Totals,
  getExercise,
  getExerciseActivities,
  getLoggedMeals,
  getLoggedMealsSummary,
  getPreferences,
  getQuickAdds,
  rateMeal,
} from './api';
import CalorieSummary from './components/CalorieSummary';
import ExerciseBlock from './components/ExerciseBlock';
import MealSectionBlock from './components/MealSectionBlock';
import TopNav from './components/TopNav';
import WeekStrip from './components/WeekStrip';
import { longDateLabel, todayString, weekdayLabel } from './dates';
import { light } from './haptics';
import { colors, space, type } from './theme';

const WEEK_BAR_MAX_HEIGHT = 56;

// Seven independent bars, each comparing its own day's calories to its own
// goal — a bar-height comparison, not a multi-slice chart, so it doesn't
// reintroduce the angle/area-comparison judgment Design.md's portion-chart
// rejection is about. The bar supplements the number (shown under each
// bar), it doesn't replace it.
// A day's budget includes its exercise when the user counts it (docs/adr/0025).
function WeekTrend({ summary }: { summary: DaySummary[] }) {
  return (
    <View style={styles.weekBars}>
      {summary.map((day) => {
        const budget = day.goal.calories + (day.exercise_adds_to_goal ? day.exercise_calories : 0);
        const pct = budget > 0 ? day.totals.calories / budget : 0;
        const clamped = Math.max(0, Math.min(1, pct));
        const over = budget > 0 && day.totals.calories > budget;
        return (
          <View key={day.date} style={styles.weekBarColumn}>
            <View style={styles.weekBarTrack}>
              <View
                style={[
                  styles.weekBarFill,
                  over && styles.weekBarFillOver,
                  { height: Math.max(2, clamped * WEEK_BAR_MAX_HEIGHT) },
                ]}
              />
            </View>
            <Text style={styles.weekBarValue}>{Math.round(day.totals.calories)}</Text>
            <Text style={styles.weekBarLabel}>{weekdayLabel(day.date)}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function DiaryScreen({
  onGoToToday,
  onLogout,
  onUpdatePreferences,
  onRetakeFoodSurvey,
  onRefineMealPreferences,
}: {
  onGoToToday: () => void;
  onLogout: () => void;
  onUpdatePreferences: () => void;
  onRetakeFoodSurvey: () => void;
  onRefineMealPreferences: () => void;
}) {
  const today = todayString();
  const [selectedDate, setSelectedDate] = useState(today);
  const [meals, setMeals] = useState<LoggedMeal[] | null>(null);
  const [quickAdds, setQuickAdds] = useState<QuickAddEntry[]>([]);
  const [exercise, setExercise] = useState<ExerciseEntry[]>([]);
  const [activities, setActivities] = useState<ExerciseActivity[]>([]);
  const [summary, setSummary] = useState<DaySummary[] | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load(date: string) {
    try {
      const [m, q, e, s, p] = await Promise.all([
        getLoggedMeals(date),
        getQuickAdds(date),
        getExercise(date),
        getLoggedMealsSummary(7),
        getPreferences(),
      ]);
      setMeals(m);
      setQuickAdds(q);
      setExercise(e);
      setSummary(s);
      setPrefs(p);
    } catch (err: any) {
      setError(err.message);
    }
  }

  // The activity list is static per deploy; fetched once, and the Exercise
  // form just shows "Other" until it arrives.
  useEffect(() => {
    getExerciseActivities().then(setActivities, () => {});
  }, []);

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

  // Edits and deletes shift the week trend, which the server computes —
  // refetch it rather than re-deriving it here. The selected day's own
  // totals are summed from `meals` below, so they update immediately.
  async function refreshSummary() {
    try {
      setSummary(await getLoggedMealsSummary(7));
    } catch {
      // Keep the stale summary; pull-to-refresh will retry.
    }
  }

  function handleChanged(updated: LoggedMeal) {
    setMeals((prev) => (prev ? prev.map((m) => (m.id === updated.id ? updated : m)) : prev));
    refreshSummary();
  }

  function handleDeleted(mealId: number) {
    setMeals((prev) => (prev ? prev.filter((m) => m.id !== mealId) : prev));
    refreshSummary();
  }

  // Covers both a new entry and an edit (which may have moved it to
  // another section — sections filter by meal_section, so it just moves).
  function handleQuickAddSaved(entry: QuickAddEntry) {
    setQuickAdds((prev) =>
      prev.some((q) => q.id === entry.id) ? prev.map((q) => (q.id === entry.id ? entry : q)) : [...prev, entry]
    );
    refreshSummary();
  }

  function handleQuickAddDeleted(entryId: number) {
    setQuickAdds((prev) => prev.filter((q) => q.id !== entryId));
    refreshSummary();
  }

  function handleExerciseSaved(entry: ExerciseEntry) {
    setExercise((prev) =>
      prev.some((e) => e.id === entry.id) ? prev.map((e) => (e.id === entry.id ? entry : e)) : [...prev, entry]
    );
    refreshSummary();
  }

  function handleExerciseDeleted(entryId: number) {
    setExercise((prev) => prev.filter((e) => e.id !== entryId));
    refreshSummary();
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load diary: {error}</Text>
      </View>
    );
  }

  if (!summary) {
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
      // Index 2 is CalorieSummary — it stays pinned while the sections
      // scroll under it (MyFitnessPal's unpinned summary was its top
      // redesign complaint).
      stickyHeaderIndices={[2]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
    >
      <TopNav
        current="diary"
        onGoToToday={onGoToToday}
        onGoToDiary={() => setSelectedDate(today)}
        onUpdatePreferences={onUpdatePreferences}
        onRetakeFoodSurvey={onRetakeFoodSurvey}
        onRefineMealPreferences={onRefineMealPreferences}
        onLogout={onLogout}
      />

      <View>
        <Text style={styles.kicker}>{selectedDate === today ? 'Today' : longDateLabel(selectedDate)}</Text>
        <Text style={styles.title}>Diary</Text>
        <WeekStrip selected={selectedDate} today={today} onSelect={setSelectedDate} />
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
              onLog={canLog ? onGoToToday : undefined}
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

      <View style={styles.weekSection}>
        <Text style={styles.sectionTitle}>Last 7 days</Text>
        <WeekTrend summary={summary} />
      </View>

      {prefs && (prefs.liked_tags.length > 0 || prefs.disliked_tags.length > 0) ? (
        <View style={styles.tagsSection}>
          {prefs.liked_tags.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>You tend to like</Text>
              <View style={styles.tagRow}>
                {prefs.liked_tags.map((tag) => (
                  <Text key={tag} style={styles.tag}>
                    {tag.replace(/_/g, ' ')}
                  </Text>
                ))}
              </View>
            </>
          )}
          {prefs.disliked_tags.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>You tend to avoid</Text>
              <View style={styles.tagRow}>
                {prefs.disliked_tags.map((tag) => (
                  <Text key={tag} style={styles.tag}>
                    {tag.replace(/_/g, ' ')}
                  </Text>
                ))}
              </View>
            </>
          )}
        </View>
      ) : (
        <View />
      )}
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
  // No paddingTop: TopNav owns the status-bar/notch clearance for this screen.
  content: { paddingHorizontal: space.lg, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.paper },
  error: { ...type.body, color: colors.accent, textAlign: 'center' },
  kicker: { ...type.kicker, marginBottom: space.xs },
  title: { ...type.display, fontSize: 28, marginBottom: space.lg },
  sectionsLoading: { marginTop: space.xxl },
  weekSection: { marginTop: space.xxxl },
  sectionTitle: {
    ...type.kicker,
    marginBottom: space.md,
    marginTop: space.sm,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  weekBars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: space.lg },
  weekBarColumn: { alignItems: 'center', flex: 1 },
  weekBarTrack: {
    width: 12,
    height: WEEK_BAR_MAX_HEIGHT,
    justifyContent: 'flex-end',
    backgroundColor: colors.disabled,
  },
  weekBarFill: { width: 12, backgroundColor: colors.ink },
  weekBarFillOver: { backgroundColor: colors.accent },
  weekBarValue: { ...type.mono, fontSize: 10, marginTop: space.xs },
  weekBarLabel: { ...type.caption, marginTop: 2 },
  tagsSection: { marginTop: space.sm },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.lg },
  tag: {
    ...type.body,
    fontSize: 13,
    color: colors.ink,
    textTransform: 'capitalize',
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
    paddingVertical: space.xs,
    marginRight: space.md,
    marginBottom: space.xs,
  },
});
