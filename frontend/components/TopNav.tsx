import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { selection } from '../haptics';
import { colors, interaction, space, type } from '../theme';

// The masthead nav shared by the two "home" screens (Today's Meals, Diary).
// Both screens previously hand-rolled the same four kicker links crammed into
// the right half of the title row, which (a) squeezed the title, (b) wrapped
// mid-word once the window got narrower than ~600px, and (c) gave four
// equally-loud red labels with no indication of which screen you were on.
//
// Instead this is a real masthead bar: section nav left, account/utility links
// right, one hairline rule closing it off above the page title — the same
// "whitespace + one rule, never a box" treatment Design.md uses everywhere
// else. The current section is marked with the system's existing underline-tab
// idiom (ink text + 2px accent rule) rather than by omitting its own link, so
// the nav no longer reshuffles as you move between screens.
export type NavSection = 'today' | 'diary';

function NavLink({
  label,
  onPress,
  current = false,
}: {
  label: string;
  onPress: () => void;
  current?: boolean;
}) {
  // Web-only affordance: on touch there is no hover state, and on web a bare
  // uppercase label reads as static text until something reacts to the cursor.
  const [hovered, setHovered] = useState(false);

  function handlePress() {
    if (!current) selection();
    onPress();
  }

  return (
    <Pressable
      onPress={handlePress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="link"
      accessibilityState={{ selected: current }}
      // paddingVertical(6)*2 + kicker lineHeight(16) = 28px content height,
      // + hitSlop 8 top/bottom = 44pt (touchTarget.min). Left/right hitSlop
      // stays under half the 20px column gap so neighbouring links' tap areas
      // never overlap. See Design.md's Phase 6 audit.
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [
        styles.link,
        current && styles.linkCurrent,
        pressed && styles.linkPressed,
      ]}
    >
      <Text style={[styles.label, hovered && styles.labelHovered, current && styles.labelCurrent]}>{label}</Text>
    </Pressable>
  );
}

export default function TopNav({
  current,
  onGoToToday,
  onGoToDiary,
  onUpdatePreferences,
  onRetakeFoodSurvey,
  onRefineMealPreferences,
  onLogout,
}: {
  current: NavSection;
  onGoToToday: () => void;
  onGoToDiary: () => void;
  onUpdatePreferences: () => void;
  onRetakeFoodSurvey: () => void;
  onRefineMealPreferences: () => void;
  onLogout: () => void;
}) {
  // These screens render no native header, so the bar itself owns the status
  // bar / notch clearance that both screens used to hardcode as
  // `paddingTop: 56` — a number that was too tight on a notched phone and too
  // loose on web, where it left the links floating away from everything else.
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: Math.max(insets.top, space.md) + space.md }]}>
      <View style={styles.group}>
        <NavLink label="Today" onPress={onGoToToday} current={current === 'today'} />
        <NavLink label="Diary" onPress={onGoToDiary} current={current === 'diary'} />
      </View>
      <View style={styles.group}>
        <NavLink label="Preferences" onPress={onUpdatePreferences} />
        <NavLink label="Taste quiz" onPress={onRetakeFoodSurvey} />
        <NavLink label="Meal prefs" onPress={onRefineMealPreferences} />
        <NavLink label="Log out" onPress={onLogout} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    columnGap: space.xl,
    rowGap: space.sm,
    paddingBottom: space.md,
    marginBottom: space.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  // Each group wraps as a unit, so a narrow window drops the whole
  // account/utility set onto its own right-aligned line instead of breaking
  // the row at an arbitrary link.
  group: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs },
  link: {
    paddingVertical: 6,
    borderBottomWidth: 2,
    // Reserved even when inactive so marking the current section doesn't
    // shift the row by 2px.
    borderBottomColor: 'transparent',
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  linkCurrent: { borderBottomColor: colors.accent },
  linkPressed: { opacity: interaction.pressedOpacity },
  label: { ...type.kicker, color: colors.inkSecondary },
  labelHovered: { color: colors.accent },
  labelCurrent: { color: colors.ink },
});
