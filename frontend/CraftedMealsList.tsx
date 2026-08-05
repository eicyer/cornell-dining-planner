import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CraftedItem, EateryCrafted, logMeal } from './api';
import { assignPlateColors } from './foodColors';
import { describePortion } from './foodDensity';
import { colors, radius, space, type } from './theme';

type LogStatus = 'idle' | 'saving' | 'done' | 'error';

function todayKicker(): string {
  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  return `Cornell Dining · ${weekday}`;
}

export default function CraftedMealsList({
  eateries,
  onGoToDiary,
  onSelectEatery,
  onLogout,
  onUpdatePreferences,
}: {
  eateries: EateryCrafted[];
  onGoToDiary: () => void;
  onSelectEatery: (eateryId: number) => void;
  onLogout: () => void;
  onUpdatePreferences: () => void;
}) {
  const [logStatus, setLogStatus] = useState<Record<number, LogStatus>>({});

  async function handleLog(eatery: EateryCrafted) {
    if (!eatery.crafted_meal || !eatery.meal_period) return;
    setLogStatus({ ...logStatus, [eatery.id]: 'saving' });
    try {
      await logMeal(
        eatery.id,
        eatery.meal_period,
        eatery.crafted_meal.items.map((i) => ({ name: i.name, grams: i.grams }))
      );
      setLogStatus({ ...logStatus, [eatery.id]: 'done' });
    } catch {
      setLogStatus({ ...logStatus, [eatery.id]: 'error' });
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.nav}>
        <View>
          <Text style={styles.kicker}>{todayKicker()}</Text>
          <Text style={styles.title}>Today's Meals For You</Text>
        </View>
        <View style={styles.navLinks}>
          <Pressable onPress={onUpdatePreferences}>
            <Text style={styles.navLink}>Preferences</Text>
          </Pressable>
          <Pressable onPress={onGoToDiary}>
            <Text style={styles.navLink}>Diary</Text>
          </Pressable>
          <Pressable onPress={onLogout}>
            <Text style={styles.navLink}>Log out</Text>
          </Pressable>
        </View>
      </View>

      {eateries.map((eatery) => {
        const status = logStatus[eatery.id] ?? 'idle';
        return (
          <View key={eatery.id} style={styles.eatery}>
            <Pressable onPress={() => onSelectEatery(eatery.id)}>
              <Text style={styles.eateryName}>{eatery.name}</Text>
            </Pressable>

            {!eatery.crafted_meal ? (
              <Text style={styles.unavailable}>{eatery.reason_unavailable ?? 'Not available today'}</Text>
            ) : (() => {
              const mealItems = eatery.crafted_meal.items;
              const itemColors = assignPlateColors(mealItems);
              const colorFor = (item: CraftedItem) => itemColors[item.name] ?? colors.neutralFallback;

              return (
                <View style={styles.meal}>
                  <Text style={styles.mealPeriod}>{eatery.meal_period}</Text>
                  <Text style={styles.mealName}>{eatery.crafted_meal.name}</Text>
                  <Text style={styles.rationale}>{eatery.crafted_meal.rationale}</Text>

                  {mealItems.map((item) => {
                    const portion = describePortion(item);
                    return (
                      <View key={item.name} style={styles.item}>
                        <View style={styles.itemNameRow}>
                          <View style={[styles.colorDot, { backgroundColor: colorFor(item) }]} />
                          <Text style={styles.itemName}>
                            {item.name}{' '}
                            <Text style={styles.itemGrams}>
                              ({Math.round(item.grams)}g{portion ? ` · ${portion}` : ''})
                            </Text>
                          </Text>
                        </View>
                        <Text style={styles.itemCalories}>{Math.round(item.calories)} cal</Text>
                      </View>
                    );
                  })}

                  <View style={styles.totals}>
                    <Text style={styles.totalsText}>
                      {Math.round(eatery.crafted_meal.totals.calories)} cal · {Math.round(eatery.crafted_meal.totals.protein_g)}g
                      protein · {Math.round(eatery.crafted_meal.totals.carbs_g)}g carbs ·{' '}
                      {Math.round(eatery.crafted_meal.totals.fat_g)}g fat
                    </Text>
                  </View>

                  <Pressable
                    style={[styles.logButton, status === 'done' && styles.logButtonDone]}
                    onPress={() => handleLog(eatery)}
                    disabled={status === 'saving' || status === 'done'}
                  >
                    <Text style={[styles.logButtonText, status === 'done' && styles.logButtonTextDone]}>
                      {status === 'saving'
                        ? 'Logging…'
                        : status === 'done'
                        ? 'Logged ✓'
                        : status === 'error'
                        ? 'Failed — try again'
                        : 'Log this meal →'}
                    </Text>
                  </Pressable>
                </View>
              );
            })()}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingTop: 56, maxWidth: 640, width: '100%', alignSelf: 'center' },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: space.xxl },
  kicker: { ...type.kicker, marginBottom: space.xs },
  title: { fontFamily: 'Fraunces_700Bold', fontSize: 30, lineHeight: 36, color: colors.ink },
  navLinks: { flexDirection: 'row', gap: space.lg },
  navLink: { ...type.kicker, color: colors.accent },
  eatery: {
    marginBottom: space.xxl,
    paddingBottom: space.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  eateryName: { fontFamily: 'Fraunces_600SemiBold', fontSize: 21, color: colors.ink, marginBottom: space.xs },
  unavailable: { fontFamily: 'Fraunces_500Medium_Italic', fontSize: 15, color: colors.inkSecondary },
  meal: { marginTop: space.xs },
  mealPeriod: { ...type.kicker },
  mealName: { fontFamily: 'Fraunces_600SemiBold', fontSize: 19, color: colors.ink, marginTop: space.xs, marginBottom: space.xs },
  rationale: { fontFamily: 'Fraunces_500Medium_Italic', fontSize: 14, color: colors.inkSecondary, marginBottom: space.md },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, paddingRight: space.sm },
  colorDot: { width: 9, height: 9, borderRadius: 5, marginRight: space.sm, flexShrink: 0 },
  itemName: { ...type.body, fontSize: 14, flexShrink: 1 },
  itemGrams: { fontFamily: 'IBMPlexMono_400Regular', color: colors.inkSecondary, fontSize: 13 },
  itemCalories: { fontFamily: 'IBMPlexMono_400Regular', fontSize: 13, color: colors.inkSecondary },
  totals: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.hairline },
  totalsText: { ...type.monoEmphasis },
  logButton: {
    marginTop: space.md,
    backgroundColor: colors.accent,
    borderRadius: radius.none,
    paddingVertical: 10,
    alignItems: 'center',
  },
  logButtonDone: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.accent },
  logButtonText: { ...type.button, fontSize: 14 },
  logButtonTextDone: { color: colors.accent },
});
