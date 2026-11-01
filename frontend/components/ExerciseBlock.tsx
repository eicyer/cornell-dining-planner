import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ExerciseActivity, ExerciseEntry } from '../api';
import { light } from '../haptics';
import { colors, interaction, space, type } from '../theme';
import ExerciseForm from './ExerciseForm';

// The Diary's Exercise block, after Snacks — MyFitnessPal's position
// (docs/adr/0025). Same header/row shape as a MealSectionBlock so the day
// reads as one list; the total is calories burned, not eaten. When the
// user has exercise switched off from their budget, the header says so
// rather than letting the number look like it's being counted.
export default function ExerciseBlock({
  date,
  entries,
  activities,
  addsToGoal,
  onSaved,
  onDeleted,
}: {
  date: string;
  entries: ExerciseEntry[];
  activities: ExerciseActivity[];
  addsToGoal: boolean;
  onSaved: (entry: ExerciseEntry) => void;
  onDeleted: (entryId: number) => void;
}) {
  // 'new' while adding, an entry id while editing that entry.
  const [editing, setEditing] = useState<'new' | number | null>(null);
  const burned = entries.reduce((sum, e) => sum + e.calories, 0);

  function startEditing(target: 'new' | number) {
    light();
    setEditing(target);
  }

  function saved(entry: ExerciseEntry) {
    setEditing(null);
    onSaved(entry);
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Exercise</Text>
        <Text style={[styles.total, entries.length === 0 && styles.totalEmpty]}>{Math.round(burned)} cal</Text>
      </View>
      {!addsToGoal && entries.length > 0 && <Text style={styles.note}>Not added to your budget (see Preferences).</Text>}

      {entries.length === 0 && editing !== 'new' && <Text style={styles.empty}>No exercise logged.</Text>}
      {entries.map((entry) =>
        editing === entry.id ? (
          <ExerciseForm
            key={entry.id}
            date={date}
            activities={activities}
            entry={entry}
            onSaved={saved}
            onDeleted={(id) => {
              setEditing(null);
              onDeleted(id);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Pressable
            key={entry.id}
            onPress={() => startEditing(entry.id)}
            accessibilityLabel={`Edit ${entry.label}`}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.nameColumn}>
              <Text style={styles.name}>{entry.label}</Text>
              <Text style={styles.figures}>
                {entry.minutes} min{entry.calories_typed ? '' : ' · estimated'}
              </Text>
            </View>
            <Text style={styles.calories}>{Math.round(entry.calories)}</Text>
          </Pressable>
        )
      )}

      {editing === 'new' ? (
        <ExerciseForm date={date} activities={activities} onSaved={saved} onCancel={() => setEditing(null)} />
      ) : (
        <Pressable onPress={() => startEditing('new')} hitSlop={8} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
          <Text style={styles.linkText}>+ Add exercise</Text>
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
  note: { ...type.caption, marginTop: space.xs },
  empty: { ...type.editorialItalic, color: colors.inkTertiary, paddingVertical: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  nameColumn: { flex: 1 },
  name: { ...type.body, fontSize: 14 },
  figures: { ...type.mono, fontSize: 12, color: colors.inkTertiary },
  calories: { ...type.mono, color: colors.ink },
  // paddingVertical 12 + 16 line height + hitSlop 8 = 44pt (touchTarget.min).
  link: { alignSelf: 'flex-start', paddingVertical: space.md },
  linkText: { ...type.kicker, color: colors.accent },
  pressed: { opacity: interaction.pressedOpacity },
});
