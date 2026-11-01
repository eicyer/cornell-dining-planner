import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LoggedMeal, MealSection, QuickAddEntry } from '../api';
import { light } from '../haptics';
import { colors, interaction, space, type } from '../theme';
import LoggedMealCard from './LoggedMealCard';
import QuickAddForm from './QuickAddForm';

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
// Quick Add Entries (docs/adr/0024) follow the Logged Meals, and can be
// added on any day the Diary shows — unlike menu logging, they don't need
// that day's live menu.
export default function MealSectionBlock({
  section,
  date,
  meals,
  quickAdds,
  onLog,
  onRate,
  onChanged,
  onDeleted,
  onQuickAddSaved,
  onQuickAddDeleted,
}: {
  section: MealSection;
  date: string;
  meals: LoggedMeal[];
  quickAdds: QuickAddEntry[];
  // Omitted when the selected day can't be logged to (only today can, for now).
  onLog?: () => void;
  onRate: (meal: LoggedMeal, liked: boolean) => void;
  onChanged: (meal: LoggedMeal) => void;
  onDeleted: (mealId: number) => void;
  onQuickAddSaved: (entry: QuickAddEntry) => void;
  onQuickAddDeleted: (entryId: number) => void;
}) {
  // 'new' while adding, an entry id while editing that entry.
  const [editing, setEditing] = useState<'new' | number | null>(null);
  const calories =
    meals.reduce((sum, m) => sum + m.totals.calories, 0) + quickAdds.reduce((sum, q) => sum + q.calories, 0);
  const label = SECTION_LABELS[section];
  const empty = meals.length === 0 && quickAdds.length === 0;

  function startEditing(target: 'new' | number) {
    light();
    setEditing(target);
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{label}</Text>
        <Text style={[styles.total, empty && styles.totalEmpty]}>{Math.round(calories)} cal</Text>
      </View>

      {empty && editing !== 'new' && <Text style={styles.empty}>Nothing logged.</Text>}
      {meals.map((meal) => (
        <LoggedMealCard
          key={meal.id}
          meal={meal}
          onRate={(liked) => onRate(meal, liked)}
          onChanged={onChanged}
          onDeleted={onDeleted}
        />
      ))}

      {quickAdds.map((entry) =>
        editing === entry.id ? (
          <QuickAddForm
            key={entry.id}
            date={date}
            section={section}
            entry={entry}
            onSaved={(saved) => {
              setEditing(null);
              onQuickAddSaved(saved);
            }}
            onDeleted={(id) => {
              setEditing(null);
              onQuickAddDeleted(id);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Pressable
            key={entry.id}
            onPress={() => startEditing(entry.id)}
            accessibilityLabel={`Edit ${entry.name ?? 'Quick Add'}`}
            style={({ pressed }) => [styles.quickAddRow, pressed && styles.pressed]}
          >
            <View style={styles.quickAddNameColumn}>
              <Text style={[styles.quickAddName, !entry.name && styles.quickAddUnnamed]}>{entry.name ?? 'Quick Add'}</Text>
              <Text style={styles.quickAddFigures}>
                Quick add · P {Math.round(entry.protein_g)}g · C {Math.round(entry.carbs_g)}g · F {Math.round(entry.fat_g)}g
              </Text>
            </View>
            <Text style={styles.quickAddCalories}>{Math.round(entry.calories)}</Text>
          </Pressable>
        )
      )}

      {editing === 'new' && (
        <QuickAddForm
          date={date}
          section={section}
          onSaved={(saved) => {
            setEditing(null);
            onQuickAddSaved(saved);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {editing !== 'new' && (
        <View style={styles.links}>
          {onLog && (
            <Pressable onPress={onLog} hitSlop={8} style={({ pressed }) => [styles.logLink, pressed && styles.pressed]}>
              <Text style={styles.logLinkText}>+ Log {label.toLowerCase()}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => startEditing('new')}
            hitSlop={8}
            style={({ pressed }) => [styles.logLink, pressed && styles.pressed]}
          >
            <Text style={styles.quickAddLinkText}>Quick add</Text>
          </Pressable>
        </View>
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
  quickAddLinkText: { ...type.kicker, color: colors.inkSecondary },
  // gap clears 2x hitSlop so the two links' tap areas never overlap.
  links: { flexDirection: 'row', gap: space.xl },
  // Same row shape as a LoggedMealCard item so the section reads as one list.
  quickAddRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  quickAddNameColumn: { flex: 1 },
  quickAddName: { ...type.body, fontSize: 14 },
  quickAddUnnamed: { ...type.editorialItalic },
  quickAddFigures: { ...type.mono, fontSize: 12, color: colors.inkTertiary },
  quickAddCalories: { ...type.mono, color: colors.ink },
  pressed: { opacity: interaction.pressedOpacity },
});
