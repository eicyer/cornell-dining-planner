import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, space, type } from '../theme';

// Bare 4px fill-on-track bar with no label row — used for the food-survey
// quiz's round progress (tone='default', accent fill — quiz completion
// isn't a "target" you can be under/over), and as the building block for
// the labeled ProgressBar below, which drives tone from goal comparison.
export function BarTrack({ pct, tone = 'default' }: { pct: number; tone?: 'default' | 'onTrack' | 'over' }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, tone === 'onTrack' && styles.fillOnTrack, { width: `${clamped}%` }]} />
    </View>
  );
}

// Labeled data bar (name + "value/goal" figures + track) — the pattern
// DiaryScreen's original ProgressRow established for macro-vs-goal display.
// See Design.md's "Macro figures: no new colors" — fill is ink while under
// goal, switches to accent at/over goal (reusing accent's existing
// error/negative-state role rather than a third hue), plus a mono "+X over"
// caption so "over" reads from the number, not just a color swap.
export default function ProgressBar({ label, value, goal, unit = '' }: { label: string; value: number; goal: number; unit?: string }) {
  const pct = goal > 0 ? Math.round((value / goal) * 100) : 0;
  const over = goal > 0 && value > goal;
  return (
    <View style={styles.row}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.figures}>
          {Math.round(value)}
          {unit} / {Math.round(goal)}
          {unit}
        </Text>
      </View>
      <BarTrack pct={pct} tone={over ? 'over' : 'onTrack'} />
      {over && (
        <Text style={styles.overCaption}>
          +{Math.round(value - goal)}
          {unit} over
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: space.md },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.xs },
  label: { ...type.body, fontSize: 14 },
  figures: { ...type.mono },
  track: { height: 4, borderRadius: radius.none, backgroundColor: colors.disabled, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.accent },
  fillOnTrack: { backgroundColor: colors.ink },
  overCaption: { ...type.caption, color: colors.accent, marginTop: space.xs },
});
