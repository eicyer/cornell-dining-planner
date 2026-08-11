import { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors, space } from '../theme';

// Hairline-bottom-border row shell — the recurring "name left, figure
// right, rule below" idiom (menu items, logged meals, week rows). Children
// compose the actual content; this only supplies the row layout + divider.
export default function ListRow({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
});
