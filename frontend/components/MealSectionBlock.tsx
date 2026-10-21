import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LoggedMeal, MealSection } from '../api';
import { colors, interaction, space, type } from '../theme';
import LoggedMealCard from './LoggedMealCard';

const SECTION_LABELS: Record<MealSection, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

// One of the Diary's four fixed Meal Sections (docs/adr/0023): a kicker
// header with the section's calorie total, then each Logged Meal in it
// (one per eatery/Menu Event) under its own eatery label. Always rendered,
// even empty, so the day reads the same every time — MyFitnessPal's layout.
export default function MealSectionBlock({
  section,
  meals,
  onLog,
  onRate,
  onChanged,
  onDeleted,
}: {
  section: MealSection;
  meals: LoggedMeal[];
  // Omitted when the selected day can't be logged to (only today can, for now).
  onLog?: () => void;
  onRate: (meal: LoggedMeal, liked: boolean) => void;
  onChanged: (meal: LoggedMeal) => void;
  onDeleted: (mealId: number) => void;
}) {
  const calories = meals.reduce((sum, m) => sum + m.totals.calories, 0);
  const label = SECTION_LABELS[section];

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{label}</Text>
        <Text style={[styles.total, meals.length === 0 && styles.totalEmpty]}>{Math.round(calories)} cal</Text>
      </View>

      {meals.length === 0 && <Text style={styles.empty}>Nothing logged.</Text>}
      {meals.map((meal) => (
        <LoggedMealCard
          key={meal.id}
          meal={meal}
          onRate={(liked) => onRate(meal, liked)}
          onChanged={onChanged}
          onDeleted={onDeleted}
        />
      ))}

      {onLog && (
        <Pressable onPress={onLog} hitSlop={8} style={({ pressed }) => [styles.logLink, pressed && styles.pressed]}>
          <Text style={styles.logLinkText}>+ Log {label.toLowerCase()}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space.xl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
  },
  title: { fontFamily: 'Fraunces_600SemiBold', fontSize: 19, lineHeight: 24, color: colors.ink },
  total: { ...type.monoEmphasis },
  totalEmpty: { color: colors.inkTertiary },
  empty: { ...type.editorialItalic, color: colors.inkTertiary, paddingVertical: space.md },
  // paddingVertical 12 + 16 line height + hitSlop 8 = 44pt (touchTarget.min).
  logLink: { alignSelf: 'flex-start', paddingVertical: space.md },
  logLinkText: { ...type.kicker, color: colors.accent },
  pressed: { opacity: interaction.pressedOpacity },
});
