import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Icon from './components/Icon';
import TopInset from './components/TopInset';
import { colors, interaction, space, type } from './theme';

// The More tab (docs/adr/0029): account and settings links that used to
// crowd the masthead. Plain rows divided by hairlines, no boxes.
export default function MoreScreen({
  onUpdatePreferences,
  onRetakeFoodSurvey,
  onRefineMealPreferences,
  onLogout,
}: {
  onUpdatePreferences: () => void;
  onRetakeFoodSurvey: () => void;
  onRefineMealPreferences: () => void;
  onLogout: () => void;
}) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TopInset />
      <Text style={styles.title}>More</Text>

      <Text style={styles.groupLabel}>Goals</Text>
      <Row label="Preferences & goals" caption="Calorie and macro targets, diet, allergens, units" onPress={onUpdatePreferences} />

      <Text style={styles.groupLabel}>Suggestions</Text>
      <Row label="Taste quiz" caption="Quick would-you-rather rounds that tune suggested meals" onPress={onRetakeFoodSurvey} />
      <Row label="Meal preferences" caption="More rounds, by meal and plate role" onPress={onRefineMealPreferences} />

      <Text style={styles.groupLabel}>Account</Text>
      <Row label="Log out" onPress={onLogout} />
    </ScrollView>
  );
}

function Row({ label, caption, onPress }: { label: string; caption?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {caption && <Text style={styles.rowCaption}>{caption}</Text>}
      </View>
      <Icon icon={ChevronRight} size="sm" color="inkSecondary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: space.lg, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { ...type.display, fontSize: 28, marginBottom: space.lg },
  groupLabel: { ...type.kicker, marginTop: space.xl, marginBottom: space.xs },
  // minHeight 44 = touchTarget.min.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 44,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  rowText: { flex: 1 },
  rowLabel: { ...type.body },
  rowCaption: { ...type.caption, marginTop: 2 },
  pressed: { opacity: interaction.pressedOpacity },
});
