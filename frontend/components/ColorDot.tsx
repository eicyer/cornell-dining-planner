import { StyleSheet, View } from 'react-native';
import { space } from '../theme';

// The one borderRadius > 0 exception in the system (see Design.md) — a
// small legend swatch next to plate items, colored per foodColors.ts.
export default function ColorDot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: space.sm, flexShrink: 0 },
});
