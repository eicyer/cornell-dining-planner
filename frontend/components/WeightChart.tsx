import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { UnitSystem, WeighIn } from '../api';
import { parseLocalDate } from '../dates';
import { weightIn } from '../units';
import { colors, space, type } from '../theme';

const HEIGHT = 120;
const PAD = 6;

// Weigh-ins over time as one ink line with a dot per weigh-in, x spaced by
// date (gaps between weigh-ins stay visible). Deliberately no goal or
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

  const points = weighIns.map((_, i) => ({
    x: weighIns.length === 1 ? width / 2 : PAD + ((times[i] - first) / timeSpan) * (width - PAD * 2),
    y: PAD + (1 - (values[i] - lo) / (hi - lo)) * (HEIGHT - PAD * 2),
  }));

  return (
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
                stroke={colors.ink}
                strokeWidth={1.5}
              />
            )}
            {points.map((p, i) => (
              <Circle key={weighIns[i].date} cx={p.x} cy={p.y} r={2.5} fill={colors.ink} />
            ))}
          </Svg>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  scale: { height: HEIGHT, justifyContent: 'space-between' },
  scaleLabel: { ...type.mono, fontSize: 10, color: colors.inkTertiary },
  plot: { flex: 1, height: HEIGHT },
});
