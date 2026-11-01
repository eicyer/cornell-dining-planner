import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChartLine from 'lucide-react-native/icons/chart-line';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import NotebookPen from 'lucide-react-native/icons/notebook-pen';
import Utensils from 'lucide-react-native/icons/utensils';
import { selection } from '../haptics';
import { colors, interaction, space, type } from '../theme';
import Icon from './Icon';

export type TabName = 'Diary' | 'Menus' | 'Progress' | 'More';

const TABS: { name: TabName; icon: typeof NotebookPen }[] = [
  { name: 'Diary', icon: NotebookPen },
  { name: 'Menus', icon: Utensils },
  { name: 'Progress', icon: ChartLine },
  { name: 'More', icon: Ellipsis },
];

// The app's four bottom tabs (docs/adr/0029). Editorial treatment: one
// hairline closes the content off, each tab is an icon over a kicker
// label, and the current tab is ink with a 2px accent rule along its top
// edge — the underline-tab idiom turned upside down for a bottom bar. No
// filled pill, no badges.
export default function TabBar({ current, onSelect }: { current: TabName; onSelect: (tab: TabName) => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      {TABS.map(({ name, icon }) => {
        const active = name === current;
        return (
          <Pressable
            key={name}
            onPress={() => {
              if (!active) selection();
              onSelect(name);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={name}
            style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed]}
          >
            <Icon icon={icon} size="md" color={active ? 'ink' : 'inkSecondary'} />
            <Text style={[styles.label, active && styles.labelActive]}>{name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  // Icon 20 + gap 2 + label 16 + paddingTop 8 + paddingBottom 4 = 50pt,
  // over touchTarget.min without hitSlop. The 2px top rule is reserved on
  // every tab so the active one doesn't shift.
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingTop: space.sm,
    paddingBottom: space.xs,
    borderTopWidth: 2,
    borderTopColor: 'transparent',
    marginTop: -1,
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  tabActive: { borderTopColor: colors.accent },
  label: { ...type.kicker, fontSize: 10, color: colors.inkSecondary },
  labelActive: { color: colors.ink },
  pressed: { opacity: interaction.pressedOpacity },
});
