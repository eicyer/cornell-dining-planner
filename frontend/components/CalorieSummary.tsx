import { StyleSheet, Text, View } from 'react-native';
import { Totals } from '../api';
import { colors, space, type } from '../theme';
import { BarTrack } from './ProgressBar';

// The Diary's pinned header: MyFitnessPal's "Goal − Food = Remaining"
// formula set as a mono spec-sheet line, with Remaining as the one large
// number on the screen. Exercise will join the formula once it's decided
// (wayfinder #54). Over goal follows Design.md's weight-coded rule: the bar
// and the Remaining figure switch to accent and the label reads "Over".
export default function CalorieSummary({ totals, goal }: { totals: Totals; goal: Totals }) {
  const remaining = goal.calories - totals.calories;
  const over = remaining < 0;
  const pct = goal.calories > 0 ? (totals.calories / goal.calories) * 100 : 0;

  return (
    <View style={styles.container}>
      <View style={styles.formula}>
        <Figure value={goal.calories} label="Goal" />
        <Text style={styles.operator}>−</Text>
        <Figure value={totals.calories} label="Food" />
        <Text style={styles.operator}>=</Text>
        <View style={styles.remaining}>
          <Text style={[styles.remainingValue, over && styles.overText]}>{Math.round(Math.abs(remaining)).toLocaleString()}</Text>
          <Text style={[styles.label, over && styles.overText]}>{over ? 'Over' : 'Remaining'}</Text>
        </View>
      </View>

      <BarTrack pct={pct} tone={over ? 'over' : 'onTrack'} />

      <View style={styles.macros}>
        <Macro label="Protein" value={totals.protein_g} goal={goal.protein_g} />
        <Macro label="Carbs" value={totals.carbs_g} goal={goal.carbs_g} />
        <Macro label="Fat" value={totals.fat_g} goal={goal.fat_g} />
      </View>
    </View>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <View>
      <Text style={styles.figureValue}>{Math.round(value).toLocaleString()}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

// Macros are told apart by position and label only, never color (Design.md
// "Macro figures: no new colors").
function Macro({ label, value, goal }: { label: string; value: number; goal: number }) {
  const over = goal > 0 && value > goal;
  return (
    <View style={styles.macro}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.macroFigures, over && styles.overText]}>
        {Math.round(value)}
        <Text style={styles.macroGoal}>/{Math.round(goal)}g</Text>
      </Text>
      <BarTrack pct={goal > 0 ? (value / goal) * 100 : 0} tone={over ? 'over' : 'onTrack'} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Opaque paper background so diary rows scrolling underneath the pinned
  // header don't show through; one hairline closes it, no box.
  container: {
    backgroundColor: colors.paper,
    paddingTop: space.sm,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  formula: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: space.sm },
  operator: { ...type.mono, fontSize: 15, paddingBottom: 18 },
  figureValue: { ...type.monoEmphasis },
  remaining: { alignItems: 'flex-end' },
  remainingValue: { ...type.monoEmphasis, fontSize: 28, lineHeight: 34 },
  label: { ...type.kicker, fontSize: 11, marginTop: 2 },
  overText: { color: colors.accent },
  macros: { flexDirection: 'row', gap: space.lg, marginTop: space.md },
  macro: { flex: 1, gap: space.xs },
  macroFigures: { ...type.mono, color: colors.ink },
  macroGoal: { color: colors.inkTertiary },
});
