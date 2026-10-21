import { StyleSheet, Text, View } from 'react-native';
import { DaySummary } from '../api';
import { weekdayLabel } from '../dates';
import { colors, space, type } from '../theme';

const WEEK_BAR_MAX_HEIGHT = 56;

// Seven independent bars, each comparing its own day's calories to its own
// budget — a bar-height comparison, not a multi-slice chart, so it doesn't
// reintroduce the angle/area-comparison judgment Design.md's portion-chart
// rejection is about. The bar supplements the number (shown under each
// bar), it doesn't replace it. A day's budget includes its exercise when
// the user counts it (docs/adr/0025). Lives on Progress (docs/adr/0026).
export default function WeekTrend({ summary }: { summary: DaySummary[] }) {
  return (
    <View style={styles.weekBars}>
      {summary.map((day) => {
        const budget = dayBudget(day);
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

export function dayBudget(day: DaySummary): number {
  return day.goal.calories + (day.exercise_adds_to_goal ? day.exercise_calories : 0);
}

const styles = StyleSheet.create({
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
});
