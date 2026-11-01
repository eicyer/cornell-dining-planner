import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { UnitSystem, WeighIn } from '../api';
import { parseLocalDate } from '../dates';
import { weightIn } from '../units';
import { colors, space, type } from '../theme';

const HEIGHT = 120;
const PAD = 6;
const TREND_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// The Weight Trend: for each weigh-in, the mean of every weigh-in in the 7
// calendar days ending on its date — by date, not entry count, since
// weigh-ins are sparse and optional. Descriptive only (docs/adr/0026).
export function trailingAverage(weighIns: WeighIn[]): { kg: number; count: number }[] {
  const times = weighIns.map((w) => parseLocalDate(w.date).getTime());
  return weighIns.map((_, i) => {
    let sum = 0;
    let count = 0;
    // Oldest first; Math.round absorbs a DST hour in the day count.
    for (let j = i; j >= 0 && Math.round((times[i] - times[j]) / DAY_MS) < TREND_DAYS; j--) {
      sum += weighIns[j].weight_kg;
      count++;
    }
    return { kg: sum / count, count };
  });
}

// Weigh-ins over time, x spaced by date (gaps between weigh-ins stay
// visible). Once there's enough data, the Weight Trend is the ink line and
// raw weigh-ins drop to tertiary dots; otherwise the raw line is the ink one. Deliberately no goal or
// target line and no projection (docs/adr/0026), and no color coding for
// up vs down — the chart reports, it doesn't judge. Min/max labels sit on
// the left edge as the only scale.
export default function WeightChart({ weighIns, unitSystem }: { weighIns: WeighIn[]; unitSystem: UnitSystem }) {
  const [width, setWidth] = useState(0);
  const values = weighIns.map((w) => weightIn(w.weight_kg, unitSystem));
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat line still needs a vertical range to sit in the middle of.
  const lo = max === min ? min - 0.5 : min;
  const hi = max === min ? max + 0.5 : max;

  const times = weighIns.map((w) => parseLocalDate(w.date).getTime());
  const first = times[0];
  const timeSpan = times[times.length - 1] - first || 1;

  const xAt = (i: number) =>
    weighIns.length === 1 ? width / 2 : PAD + ((times[i] - first) / timeSpan) * (width - PAD * 2);
  const yAt = (value: number) => PAD + (1 - (value - lo) / (hi - lo)) * (HEIGHT - PAD * 2);
  const points = weighIns.map((_, i) => ({ x: xAt(i), y: yAt(values[i]) }));

  // Only worth drawing once at least two points each average 2+ weigh-ins.
  const trend = trailingAverage(weighIns);
  const showTrend = trend.filter((t) => t.count >= 2).length >= 2;
  const trendPoints = trend.map((t, i) => ({ x: xAt(i), y: yAt(weightIn(t.kg, unitSystem)) }));
  const rawColor = showTrend ? colors.inkTertiary : colors.ink;

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <View style={styles.scale}>
          <Text style={styles.scaleLabel}>{max}</Text>
          <Text style={styles.scaleLabel}>{min}</Text>
        </View>
        <View style={styles.plot} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 && (
            <Svg width={width} height={HEIGHT}>
              <Line x1={0} y1={HEIGHT - 0.5} x2={width} y2={HEIGHT - 0.5} stroke={colors.hairline} strokeWidth={1} />
              {points.length > 1 && (
                <Polyline
                  points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={rawColor}
                  strokeWidth={showTrend ? 1 : 1.5}
                />
              )}
              {showTrend && (
                <Polyline
                  points={trendPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={colors.ink}
                  strokeWidth={1.5}
                />
              )}
              {points.map((p, i) => (
                <Circle key={weighIns[i].date} cx={p.x} cy={p.y} r={2.5} fill={rawColor} />
              ))}
            </Svg>
          )}
        </View>
      </View>
      {showTrend && <Text style={styles.caption}>Line: 7-day average · dots: weigh-ins</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: space.md },
  container: { flexDirection: 'row', gap: space.sm },
  caption: { ...type.mono, fontSize: 10, color: colors.inkTertiary, marginTop: space.xs },
  scale: { height: HEIGHT, justifyContent: 'space-between' },
  scaleLabel: { ...type.mono, fontSize: 10, color: colors.inkTertiary },
  plot: { flex: 1, height: HEIGHT },
});
