import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, type } from '../theme';

// See Design.md's "ProgressRing: a narrow, named exception" — this renders
// exactly one series (one fill-percentage judgment), never a multi-slice
// composition. Used in exactly one place in the app: today's calories on
// DiaryScreen. Flat `strokeLinecap="butt"` end (no rounded cap) to match the
// system's no-border-radius stance.
export default function ProgressRing({
  value,
  goal,
  size = 160,
  strokeWidth = 12,
  label,
}: {
  value: number;
  goal: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = goal > 0 ? value / goal : 0;
  const clamped = Math.max(0, Math.min(1, pct));
  const over = goal > 0 && value > goal;
  const dashOffset = circumference * (1 - clamped);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.disabled} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={over ? colors.accent : colors.ink}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="butt"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.value}>{Math.round(value)}</Text>
        {label && <Text style={styles.label}>{label}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center' },
  value: { ...type.monoEmphasis, fontSize: 28 },
  label: { ...type.kicker, marginTop: 2 },
});
