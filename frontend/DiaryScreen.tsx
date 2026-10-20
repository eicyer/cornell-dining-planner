import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DaySummary, LoggedMeal, Preferences, getLoggedMealsSummary, getLoggedMealsToday, getPreferences, rateMeal } from './api';
import LoggedMealCard from './components/LoggedMealCard';
import ProgressBar from './components/ProgressBar';
import ProgressRing from './components/ProgressRing';
import TopNav from './components/TopNav';
import { light } from './haptics';
import { colors, space, type } from './theme';

// "YYYY-MM-DD" parsed as local calendar date, not through `new Date(str)`
// (which reads a date-only string as UTC midnight and can land on the wrong
// weekday depending on the viewer's timezone offset).
function weekdayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
}

const WEEK_BAR_MAX_HEIGHT = 56;

// Seven independent bars, each comparing its own day's calories to its own
// goal — a bar-height comparison, not a multi-slice chart, so it doesn't
// reintroduce the angle/area-comparison judgment Design.md's portion-chart
// rejection is about. The bar supplements the number (shown under each
// bar), it doesn't replace it.
function WeekTrend({ summary }: { summary: DaySummary[] }) {
  return (
    <View style={styles.weekBars}>
      {summary.map((day) => {
        const pct = day.goal.calories > 0 ? day.totals.calories / day.goal.calories : 0;
        const clamped = Math.max(0, Math.min(1, pct));
        const over = day.goal.calories > 0 && day.totals.calories > day.goal.calories;
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
  const [meals, setMeals] = useState<LoggedMeal[] | null>(null);
  const [summary, setSummary] = useState<DaySummary[] | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const [m, s, p] = await Promise.all([getLoggedMealsToday(), getLoggedMealsSummary(7), getPreferences()]);
      setMeals(m);
      setSummary(s);
      setPrefs(p);
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleRate(meal: LoggedMeal, liked: boolean) {
    light();
    const newValue = meal.liked === liked ? null : liked;
    const updated = await rateMeal(meal.id, newValue);
    setMeals((prev) => (prev ? prev.map((m) => (m.id === meal.id ? updated : m)) : prev));
  }

  // Edits and deletes shift today's totals and the week trend, which the
  // server computes — refetch the summary rather than re-deriving it here.
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
    >
      <TopNav
        current="diary"
        onGoToToday={onGoToToday}
        onGoToDiary={() => {}}
        onUpdatePreferences={onUpdatePreferences}
        onRetakeFoodSurvey={onRetakeFoodSurvey}
        onRefineMealPreferences={onRefineMealPreferences}
        onLogout={onLogout}
      />

      <Text style={styles.title}>Diary</Text>

      <View style={styles.progressSection}>
        <Text style={styles.progressTitle}>Today so far</Text>
        <View style={styles.ringWrap}>
          <ProgressRing value={today.totals.calories} goal={today.goal.calories} label="cal" size={148} strokeWidth={10} />
        </View>
        <ProgressBar label="Protein" value={today.totals.protein_g} goal={today.goal.protein_g} unit="g" />
        <ProgressBar label="Carbs" value={today.totals.carbs_g} goal={today.goal.carbs_g} unit="g" />
        <ProgressBar label="Fat" value={today.totals.fat_g} goal={today.goal.fat_g} unit="g" />
      </View>

      <Text style={styles.sectionTitle}>Logged today</Text>
      {meals.length === 0 ? (
        <Text style={styles.empty}>Nothing logged yet today.</Text>
      ) : (
        meals.map((meal) => (
          <LoggedMealCard
            key={meal.id}
            meal={meal}
            onRate={(liked) => handleRate(meal, liked)}
            onChanged={handleChanged}
            onDeleted={handleDeleted}
          />
        ))
      )}

      <Text style={styles.sectionTitle}>Last 7 days</Text>
      <WeekTrend summary={summary} />

      {prefs && (prefs.liked_tags.length > 0 || prefs.disliked_tags.length > 0) && (
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
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  // No paddingTop: TopNav owns the status-bar/notch clearance for this screen.
  content: { paddingHorizontal: space.lg, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.paper },
  error: { ...type.body, color: colors.accent, textAlign: 'center' },
  title: { ...type.display, fontSize: 28, marginBottom: space.xl },
  progressSection: {
    marginBottom: space.xxl,
    paddingBottom: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  progressTitle: { ...type.kicker, marginBottom: space.md },
  ringWrap: { alignItems: 'center', marginBottom: space.lg },
  sectionTitle: {
    ...type.kicker,
    marginBottom: space.md,
    marginTop: space.sm,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  empty: { fontFamily: 'Fraunces_500Medium_Italic', fontSize: 15, color: colors.inkSecondary, marginBottom: space.lg },
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
