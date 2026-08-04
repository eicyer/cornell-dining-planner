import Svg, { Circle, Path } from 'react-native-svg';
import { StyleSheet, View } from 'react-native';
import { colors as theme } from './theme';

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeSlice(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
}

export default function PlateVisual({
  items,
  colors,
  size = 88,
}: {
  items: { name: string; grams: number }[];
  colors: Record<string, string>;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const plateR = size / 2 - 2;
  const foodR = plateR - 8;
  const total = items.reduce((sum, i) => sum + Math.max(i.grams, 0), 0);

  const slices: { path: string; color: string }[] = [];
  let fullCircleColor: string | null = null;
  if (total > 0) {
    let angle = 0;
    const portioned = items.filter((i) => i.grams > 0);
    for (const item of portioned) {
      const sliceAngle = (item.grams / total) * 360;
      const color = colors[item.name] ?? theme.neutralFallback;
      if (portioned.length === 1) {
        fullCircleColor = color;
      } else {
        slices.push({ path: describeSlice(cx, cy, foodR, angle, angle + sliceAngle), color });
      }
      angle += sliceAngle;
    }
  }

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={plateR} fill="#F1EADA" stroke={theme.hairline} strokeWidth={2} />
        {total === 0 ? (
          <Circle cx={cx} cy={cy} r={foodR} fill="#E4DCC8" />
        ) : fullCircleColor ? (
          <Circle cx={cx} cy={cy} r={foodR} fill={fullCircleColor} />
        ) : (
          slices.map((s, i) => <Path key={i} d={s.path} fill={s.color} />)
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
