import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutAnimation, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Icon from './Icon';
import { selection } from '../haptics';
import { colors, interaction, motion, space, type } from '../theme';

// A collapsible section header — the "nice looking button" this design system
// allows: no filled pill, no rounded card, just a full-width pressable row
// carrying a mono step number, a Fraunces title, a live one-line summary of
// what's inside, and a chevron that rotates on open. Hairline rules top and
// bottom do the grouping work a box would do elsewhere (Design.md,
// "Boxes → whitespace + rule").
//
// The summary line is the reason this is a disclosure and not just a hidden
// form: collapsed, you can still read every answer you've given.

// Fades/slides the body in each time a section opens. The body is unmounted
// while closed, so this component mounts fresh on every open and can animate
// from its `useRef` initial values without any reset bookkeeping.
function DisclosureBody({ children }: { children: ReactNode }) {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: motion.base,
      easing: Easing.out(Easing.cubic),
      // Opacity/translate can run on the native driver on device; on web the
      // driver flag is ignored, so it's set honestly rather than blindly.
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [enter]);

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

export default function Disclosure({
  step,
  title,
  summary,
  answered,
  summaryMono = false,
  open,
  onToggle,
  children,
}: {
  step: number;
  title: string;
  // One line describing the section's current state, shown whether open or
  // closed — e.g. "2,200 cal · 150P 220C 70F · 3 meals/day".
  summary: string;
  // False when `summary` is a placeholder ("Nothing selected yet") rather
  // than a real answer — renders it in the app's italic empty-state idiom.
  answered: boolean;
  // Opt in only where the summary really is numeric data (the targets
  // section). Design.md reserves the mono face strictly for numbers, so a
  // summary listing allergens or food names stays in Archivo.
  summaryMono?: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const spin = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(spin, {
      toValue: open ? 1 : 0,
      duration: motion.fast,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [open, spin]);

  function handlePress() {
    selection();
    // Native gets a real height animation for free; react-native-web has no
    // LayoutAnimation implementation, which is why DisclosureBody's fade/slide
    // carries the transition there instead of relying on this.
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.create(motion.fast, 'easeInEaseOut', 'opacity'));
    }
    onToggle();
  }

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={styles.section}>
      <Pressable
        onPress={handlePress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}. ${summary}`}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
      >
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Text style={styles.step}>{String(step).padStart(2, '0')}</Text>
            <Text style={[styles.title, (hovered || open) && styles.titleActive]}>{title}</Text>
          </View>
          <Text
            style={!answered ? styles.summaryEmpty : summaryMono ? styles.summaryMono : styles.summary}
            numberOfLines={2}
          >
            {summary}
          </Text>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Icon icon={ChevronDown} size="md" color={open || hovered ? 'accent' : 'inkSecondary'} />
        </Animated.View>
      </Pressable>

      {open && (
        <DisclosureBody>
          <View style={styles.body}>{children}</View>
        </DisclosureBody>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderTopWidth: 1, borderTopColor: colors.hairline },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    // Well past touchTarget.min (44) by construction: two text lines plus
    // 16pt of padding top and bottom.
    paddingVertical: space.lg,
  },
  headerPressed: { opacity: interaction.pressedOpacity },
  headerText: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  step: { ...type.mono, fontSize: 12, color: colors.inkTertiary },
  title: { ...type.headlineSmall },
  titleActive: { color: colors.accent },
  summary: { ...type.body, fontSize: 13, lineHeight: 18, color: colors.inkSecondary, marginTop: space.xs },
  summaryMono: { ...type.mono, fontSize: 12, marginTop: space.xs },
  // Matches the app's existing "Nothing logged yet today." empty-state voice.
  summaryEmpty: {
    fontFamily: 'Fraunces_500Medium_Italic',
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkTertiary,
    marginTop: space.xs,
  },
  body: { paddingBottom: space.xl },
});
