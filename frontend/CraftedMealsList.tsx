import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { EateryCrafted, Totals, logMeal } from './api';
import CraftedMealCard, { LogStatus } from './components/CraftedMealCard';
import Icon from './components/Icon';
import TopNav from './components/TopNav';
import { success } from './haptics';
import { colors, interaction, space, type } from './theme';

function todayKicker(): string {
  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  return `Cornell Dining · ${weekday}`;
}

export default function CraftedMealsList({
  eateries,
  perMealTarget,
  likedTags,
  dislikedTags,
  refreshing,
  onRefresh,
  onGoToDiary,
  onGoToProgress,
  onSelectEatery,
  onLogout,
  onUpdatePreferences,
  onRetakeFoodSurvey,
  onRefineMealPreferences,
}: {
  eateries: EateryCrafted[];
  perMealTarget: Totals | null;
  likedTags: string[];
  dislikedTags: string[];
  refreshing: boolean;
  onRefresh: () => void;
  onGoToDiary: () => void;
  onGoToProgress: () => void;
  onSelectEatery: (eateryId: number) => void;
  onLogout: () => void;
  onUpdatePreferences: () => void;
  onRetakeFoodSurvey: () => void;
  onRefineMealPreferences: () => void;
}) {
  const [logStatus, setLogStatus] = useState<Record<number, LogStatus>>({});

  async function handleLog(eatery: EateryCrafted, items: { name: string; grams: number }[]) {
    if (!eatery.meal_period) return null;
    setLogStatus((s) => ({ ...s, [eatery.id]: 'saving' }));
    try {
      const logged = await logMeal(eatery.id, eatery.meal_period, items, 'crafted');
      setLogStatus((s) => ({ ...s, [eatery.id]: 'done' }));
      success();
      return logged;
    } catch {
      setLogStatus((s) => ({ ...s, [eatery.id]: 'error' }));
      return null;
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <TopNav
        current="today"
        onGoToToday={() => {}}
        onGoToDiary={onGoToDiary}
        onGoToProgress={onGoToProgress}
        onUpdatePreferences={onUpdatePreferences}
        onRetakeFoodSurvey={onRetakeFoodSurvey}
        onRefineMealPreferences={onRefineMealPreferences}
        onLogout={onLogout}
      />

      <View style={styles.masthead}>
        <Text style={styles.kicker}>{todayKicker()}</Text>
        <Text style={styles.title}>Today's Meals For You</Text>
        {eateries.some((e) => e.sized_to_remaining) && (
          <Text style={styles.sizedNote}>Sized to what's left of today's budget.</Text>
        )}
      </View>

      {eateries.map((eatery) => {
        const status = logStatus[eatery.id] ?? 'idle';
        return (
          <View key={eatery.id} style={styles.eatery}>
            <Pressable
              onPress={() => onSelectEatery(eatery.id)}
              hitSlop={{ top: 8, bottom: 8, left: 0, right: 8 }}
              style={({ pressed }) => [styles.eateryNameRow, pressed && styles.eateryNameRowPressed]}
            >
              <Text style={styles.eateryName}>{eatery.name}</Text>
              <Icon icon={ChevronRight} size="sm" color="accent" />
            </Pressable>

            {!eatery.crafted_meal ? (
              <Text style={styles.unavailable}>{eatery.reason_unavailable ?? 'Not available today'}</Text>
            ) : (
              <CraftedMealCard
                meal={eatery.crafted_meal}
                mealPeriod={eatery.meal_period ?? ''}
                perMealTarget={eatery.target ?? perMealTarget}
                status={status}
                onLog={(items) => handleLog(eatery, items)}
                onUndoLog={() => setLogStatus((s) => ({ ...s, [eatery.id]: 'idle' }))}
                onLogItem={(item) => logMeal(eatery.id, eatery.meal_period ?? '', [item], 'crafted')}
              />
            )}
          </View>
        );
      })}

      {/* Moved here from the Diary (docs/adr/0027): the taste profile only
          matters to suggestions. Soft Preferences rank, never filter. */}
      {(likedTags.length > 0 || dislikedTags.length > 0) && (
        <View style={styles.tastes}>
          {likedTags.length > 0 && (
            <Text style={styles.tasteLine}>
              <Text style={styles.tasteKicker}>Suggestions lean toward </Text>
              {humanizeTags(likedTags)}
            </Text>
          )}
          {dislikedTags.length > 0 && (
            <Text style={styles.tasteLine}>
              <Text style={styles.tasteKicker}>…and away from </Text>
              {humanizeTags(dislikedTags)}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function humanizeTags(tags: string[]): string {
  return tags.map((t) => t.replace(/_/g, ' ')).join(' · ');
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  // No paddingTop: TopNav owns the status-bar/notch clearance for this screen.
  content: { paddingHorizontal: space.lg, paddingBottom: space.xl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  masthead: { marginBottom: space.xxl },
  sizedNote: { ...type.editorialItalic, marginTop: space.xs },
  tastes: { marginTop: space.xl, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.hairline, gap: space.xs },
  tasteLine: { ...type.body, fontSize: 13, color: colors.inkSecondary },
  tasteKicker: { ...type.editorialItalic, fontSize: 13 },
  kicker: { ...type.kicker, marginBottom: space.xs },
  title: { fontFamily: 'Fraunces_700Bold', fontSize: 30, lineHeight: 36, color: colors.ink },
  eatery: {
    marginBottom: space.xxl,
    paddingBottom: space.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  // Chevron + press-state opacity signal that the eatery name is tappable
  // (it previously rendered identically to a static headline, with no
  // affordance at all — reported as "not obvious dining halls are
  // clickable").
  eateryNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    marginBottom: space.xs,
  },
  eateryNameRowPressed: { opacity: interaction.pressedOpacity },
  eateryName: { fontFamily: 'Fraunces_600SemiBold', fontSize: 21, color: colors.ink },
  unavailable: { fontFamily: 'Fraunces_500Medium_Italic', fontSize: 15, color: colors.inkSecondary },
});
