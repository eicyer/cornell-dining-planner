import { Pressable, StyleSheet, Text, View } from 'react-native';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { addDays, parseLocalDate, weekOf, weekdayLabel } from '../dates';
import { light } from '../haptics';
import { colors, interaction, space, type } from '../theme';
import Icon from './Icon';

// The Diary's date switcher — MyFitnessPal's week strip in Editorial terms:
// the selected day carries the same 2px accent underline as an active Tab,
// today is marked in ink weight, and days after today are inert (there's
// nothing to log or review there yet).
export default function WeekStrip({
  selected,
  today,
  onSelect,
}: {
  selected: string;
  today: string;
  onSelect: (date: string) => void;
}) {
  const days = weekOf(selected);
  const showsToday = days.includes(today);
  // Jumping forward a week from last week can overshoot into the future;
  // land on today instead.
  const nextWeek = addDays(selected, 7) > today ? today : addDays(selected, 7);

  function select(date: string) {
    light();
    onSelect(date);
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => select(addDays(selected, -7))}
        hitSlop={12}
        accessibilityLabel="Previous week"
        style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
      >
        <Icon icon={ChevronLeft} size="md" color="inkSecondary" />
      </Pressable>

      {days.map((date) => {
        const isSelected = date === selected;
        const isToday = date === today;
        const isFuture = date > today;
        return (
          <Pressable
            key={date}
            onPress={() => select(date)}
            disabled={isFuture}
            accessibilityLabel={weekdayLabel(date, 'long')}
            accessibilityState={{ selected: isSelected, disabled: isFuture }}
            style={({ pressed }) => [styles.day, isSelected && styles.daySelected, pressed && styles.pressed]}
          >
            <Text style={[styles.weekday, isFuture && styles.future]}>{weekdayLabel(date).charAt(0)}</Text>
            <Text style={[styles.dayNumber, isToday && styles.dayNumberToday, isFuture && styles.future]}>
              {parseLocalDate(date).getDate()}
            </Text>
          </Pressable>
        );
      })}

      <Pressable
        onPress={() => select(nextWeek)}
        disabled={showsToday}
        hitSlop={12}
        accessibilityLabel="Next week"
        style={({ pressed }) => [styles.arrow, showsToday && styles.arrowDisabled, pressed && styles.pressed]}
      >
        <Icon icon={ChevronRight} size="md" color="inkSecondary" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg },
  arrow: { paddingVertical: space.sm },
  arrowDisabled: { opacity: 0.3 },
  // 44pt tall (touchTarget.min): 16 + 20 line heights + 2×4 padding.
  day: {
    alignItems: 'center',
    minWidth: 36,
    paddingVertical: space.xs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  daySelected: { borderBottomColor: colors.accent },
  weekday: { ...type.kicker, fontSize: 11 },
  dayNumber: { ...type.mono, fontSize: 15, lineHeight: 20 },
  dayNumberToday: { fontFamily: type.monoEmphasis.fontFamily, color: colors.ink },
  future: { color: colors.disabled },
  pressed: { opacity: interaction.pressedOpacity },
});
