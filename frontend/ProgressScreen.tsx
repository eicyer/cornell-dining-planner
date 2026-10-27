import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import X from 'lucide-react-native/icons/x';
import {
  DaySummary,
  Preferences,
  WeighIn,
  deleteWeighIn,
  getLoggedMealsSummary,
  getPreferences,
  getWeighIns,
  putWeighIn,
  recalculateTargets,
} from './api';
import Button from './components/Button';
import Icon from './components/Icon';
import TopInset from './components/TopInset';
import WeekTrend, { dayBudget } from './components/WeekTrend';
import WeightChart from './components/WeightChart';
import { addDays, longDateLabel, todayString } from './dates';
import { success } from './haptics';
import { colors, interaction, radius, space, touchTarget, type } from './theme';
import { weightIn, weightToKg, weightUnit } from './units';

// Recalculating is offered once the latest weigh-in drifts this far from
// the weight the Recommended Targets used (docs/adr/0026).
const RECALCULATE_THRESHOLD_KG = 1;
const RECENT_WEIGH_INS_SHOWN = 5;

// Progress (docs/adr/0026): weight trend, calories against budget, and
// logging consistency. Wellbeing defaults are deliberate — no goal weight,
// no projection, weight change in neutral ink, and targets only change
// when the user taps Recalculate.
export default function ProgressScreen() {
  const [summary, setSummary] = useState<DaySummary[] | null>(null);
  const [weighIns, setWeighIns] = useState<WeighIn[]>([]);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, w, p] = await Promise.all([getLoggedMealsSummary(28), getWeighIns(90), getPreferences()]);
      setSummary(s);
      setWeighIns(w);
      setPrefs(p);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  // Refetch on focus: logging in the Diary changes everything shown here.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load progress: {error}</Text>
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

  const loggedDays = summary.filter((d) => d.totals.calories > 0);
  const avgFood = average(loggedDays.map((d) => d.totals.calories));
  const avgBudget = average(loggedDays.map(dayBudget));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
    >
      <TopInset />

      <Text style={styles.kicker}>Last four weeks</Text>
      <Text style={styles.title}>Progress</Text>

      <WeightSection
        weighIns={weighIns}
        prefs={prefs}
        onWeighInsChanged={setWeighIns}
        onPrefsChanged={setPrefs}
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Calories</Text>
        <WeekTrend summary={summary.slice(-7)} />
        {loggedDays.length > 0 ? (
          <Text style={styles.figureLine}>
            Avg {Math.round(avgFood).toLocaleString()} of {Math.round(avgBudget).toLocaleString()} cal
            <Text style={styles.figureCaption}> · on the {loggedDays.length} days you logged</Text>
          </Text>
        ) : (
          <Text style={styles.empty}>Nothing logged in the last four weeks.</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Consistency</Text>
        <Text style={styles.figureLine}>
          {loggedDays.length} of {summary.length} days logged
        </Text>
      </View>
    </ScrollView>
  );
}

function WeightSection({
  weighIns,
  prefs,
  onWeighInsChanged,
  onPrefsChanged,
}: {
  weighIns: WeighIn[];
  prefs: Preferences | null;
  onWeighInsChanged: (weighIns: WeighIn[]) => void;
  onPrefsChanged: (prefs: Preferences) => void;
}) {
  const unitSystem = prefs?.unit_system ?? 'imperial';
  const unit = weightUnit(unitSystem);
  const today = todayString();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latest = weighIns[weighIns.length - 1];
  // Change against the closest weigh-in at or before 30 days ago, if any.
  const monthAgo = addDays(today, -30);
  const baseline = [...weighIns].reverse().find((w) => w.date <= monthAgo) ?? weighIns[0];
  const change = latest && baseline && baseline !== latest ? latest.weight_kg - baseline.weight_kg : null;

  const canRecalculate =
    prefs?.target_mode === 'recommended' &&
    prefs.weight_kg != null &&
    latest != null &&
    Math.abs(latest.weight_kg - prefs.weight_kg) >= RECALCULATE_THRESHOLD_KG;

  const draftValue = Number(draft);

  async function logWeight() {
    setSaving(true);
    setError(null);
    try {
      const saved = await putWeighIn(today, weightToKg(draftValue, unitSystem));
      success();
      onWeighInsChanged([...weighIns.filter((w) => w.date !== saved.date), saved].sort(byDate));
      setDraft('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(date: string) {
    setError(null);
    try {
      await deleteWeighIn(date);
      onWeighInsChanged(weighIns.filter((w) => w.date !== date));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function recalculate() {
    setRecalculating(true);
    setError(null);
    try {
      onPrefsChanged(await recalculateTargets());
      success();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Weight</Text>

      {latest ? (
        <>
          <View style={styles.weightHeadline}>
            <Text style={styles.bigFigure}>
              {weightIn(latest.weight_kg, unitSystem)}
              <Text style={styles.unit}> {unit}</Text>
            </Text>
            {change != null && (
              <Text style={styles.figureCaption}>
                {change === 0 ? 'No change' : `${change > 0 ? '+' : '−'}${weightIn(Math.abs(change), unitSystem)} ${unit}`} since{' '}
                {longDateLabel(baseline.date)}
              </Text>
            )}
          </View>
          <WeightChart weighIns={weighIns} unitSystem={unitSystem} />
        </>
      ) : (
        <Text style={styles.empty}>
          Log a weigh-in to see your trend here. It's optional — everything else works without it.
        </Text>
      )}

      {canRecalculate && prefs?.weight_kg != null && (
        <View style={styles.recalculate}>
          <Text style={styles.recalculateText}>
            Your targets were set at {weightIn(prefs.weight_kg, unitSystem)} {unit}. Recalculate them for{' '}
            {weightIn(latest.weight_kg, unitSystem)} {unit}?
          </Text>
          <Pressable
            onPress={recalculate}
            disabled={recalculating}
            hitSlop={8}
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          >
            <Text style={styles.linkText}>{recalculating ? 'Recalculating…' : 'Recalculate my targets →'}</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.logRow}>
        <View style={styles.inputColumn}>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder={latest ? String(weightIn(latest.weight_kg, unitSystem)) : '0'}
            placeholderTextColor={colors.inkTertiary}
            value={draft}
            onChangeText={(t) => setDraft(t.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
            accessibilityLabel={`Today's weight in ${unit}`}
          />
          <Text style={styles.inputLabel}>Today · {unit}</Text>
        </View>
        <Button
          label={saving ? 'Saving…' : 'Log weight'}
          onPress={logWeight}
          disabled={saving || !(draftValue > 0)}
          fullWidth={false}
        />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}

      {weighIns.length > 0 && (
        <View style={styles.recent}>
          {[...weighIns]
            .reverse()
            .slice(0, RECENT_WEIGH_INS_SHOWN)
            .map((w) => (
              <View key={w.date} style={styles.recentRow}>
                <Text style={styles.recentDate}>{longDateLabel(w.date)}</Text>
                <Text style={styles.recentValue}>
                  {weightIn(w.weight_kg, unitSystem)} {unit}
                </Text>
                <Pressable onPress={() => remove(w.date)} hitSlop={14} accessibilityLabel={`Delete weigh-in on ${w.date}`}>
                  <Icon icon={X} size="sm" color="inkSecondary" />
                </Pressable>
              </View>
            ))}
        </View>
      )}
    </View>
  );
}

function average(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function byDate(a: WeighIn, b: WeighIn): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  // No paddingTop: TopInset owns the status-bar/notch clearance for this screen.
  content: { paddingHorizontal: space.lg, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.paper },
  error: { ...type.body, fontSize: 13, color: colors.accent, marginTop: space.sm },
  kicker: { ...type.kicker, marginBottom: space.xs },
  title: { ...type.display, fontSize: 28, marginBottom: space.lg },
  section: { marginTop: space.xl },
  sectionTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 19,
    lineHeight: 24,
    color: colors.ink,
    paddingBottom: space.sm,
    marginBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
  },
  empty: { ...type.editorialItalic, color: colors.inkTertiary, marginBottom: space.md },
  weightHeadline: { flexDirection: 'row', alignItems: 'baseline', gap: space.md, flexWrap: 'wrap', marginBottom: space.md },
  bigFigure: { ...type.monoEmphasis, fontSize: 28, lineHeight: 34 },
  unit: { ...type.mono, fontSize: 15 },
  figureLine: { ...type.monoEmphasis },
  figureCaption: { ...type.mono, fontSize: 12, color: colors.inkTertiary },
  recalculate: { marginBottom: space.md },
  recalculateText: { ...type.body, fontSize: 14 },
  link: { alignSelf: 'flex-start', paddingVertical: space.md },
  linkText: { ...type.kicker, color: colors.accent },
  pressed: { opacity: interaction.pressedOpacity },
  logRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.lg },
  inputColumn: { width: 120 },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    borderRadius: radius.none,
    paddingVertical: space.sm,
    minHeight: touchTarget.min,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 17,
    color: colors.ink,
  },
  inputLabel: { ...type.kicker, fontSize: 11, marginTop: 2 },
  recent: { marginTop: space.lg },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  recentDate: { ...type.body, fontSize: 14, flex: 1 },
  recentValue: { ...type.mono, color: colors.ink },
});
