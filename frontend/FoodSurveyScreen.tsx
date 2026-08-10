import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  FoodSurveyChoice,
  FoodSurveyPair,
  FoodSurveyResponse,
  Preferences,
  getFoodSurveyPairs,
  submitFoodSurvey,
} from './api';
import { colors, radius, space, type } from './theme';

function Option({ label, onChoose }: { label: string; onChoose: () => void }) {
  return (
    <Pressable onPress={onChoose} style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}>
      <Text style={styles.optionText}>{label}</Text>
    </Pressable>
  );
}

// Same pairwise "would you rather" UI drives both the onboarding Food
// Preference Survey (default props) and the eatery-scoped Station Survey
// (see docs/adr/0013) — the two only differ in where pairs come from and
// where responses get submitted, so those are the only parameterized bits.
export default function FoodSurveyScreen({
  onDone,
  fetchPairs = getFoodSurveyPairs,
  submitResponses = submitFoodSurvey,
  kicker = 'Taste Quiz',
}: {
  onDone: () => void;
  fetchPairs?: () => Promise<FoodSurveyPair[]>;
  submitResponses?: (responses: FoodSurveyResponse[]) => Promise<Preferences>;
  kicker?: string;
}) {
  const [pairs, setPairs] = useState<FoodSurveyPair[] | null>(null);
  const [round, setRound] = useState(0);
  const [responses, setResponses] = useState<FoodSurveyResponse[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPairs()
      .then((loaded) => {
        if (loaded.length === 0) {
          finish([]);
          return;
        }
        setPairs(loaded);
      })
      .catch((err: any) => setError(err.message));
  }, []);

  async function finish(finalResponses: FoodSurveyResponse[]) {
    setSubmitting(true);
    setError(null);
    try {
      await submitResponses(finalResponses);
      onDone();
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  function choose(choice: FoodSurveyChoice) {
    if (!pairs) return;
    const next = [...responses, { pair_id: pairs[round].id, choice }];
    setResponses(next);
    if (round + 1 < pairs.length) {
      setRound(round + 1);
    } else {
      finish(next);
    }
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load the taste quiz: {error}</Text>
      </View>
    );
  }

  if (submitting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.submittingText}>Tuning your suggestions…</Text>
      </View>
    );
  }

  if (!pairs) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const pair = pairs[round];
  const pct = Math.round((round / pairs.length) * 100);

  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>
        {kicker} · Round {round + 1} of {pairs.length}
      </Text>
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
      </View>

      <Text style={styles.title}>Which would you rather eat right now?</Text>
      <Text style={styles.subtitle}>Tap the one you're actually craving — it sharpens what we suggest for you.</Text>

      <Option key={`${pair.id}-a`} label={pair.item_a.name} onChoose={() => choose('a')} />
      <Text style={styles.orLabel}>or</Text>
      <Option key={`${pair.id}-b`} label={pair.item_b.name} onChoose={() => choose('b')} />

      <Pressable onPress={() => choose('skip')} style={styles.skipRow}>
        <Text style={styles.skipLink}>Skip — no preference</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  container: { paddingBottom: space.xxxl },
  kicker: { ...type.kicker, marginBottom: space.sm },
  progressBarTrack: {
    height: 4,
    borderRadius: radius.none,
    backgroundColor: colors.disabled,
    overflow: 'hidden',
    marginBottom: space.xl,
  },
  progressBarFill: { height: 4, backgroundColor: colors.accent },
  title: {
    fontFamily: 'Fraunces_700Bold',
    fontSize: 26,
    lineHeight: 32,
    color: colors.ink,
    marginBottom: space.xs,
  },
  subtitle: { ...type.body, color: colors.inkSecondary, marginBottom: space.xl },
  option: {
    borderBottomWidth: 2,
    borderBottomColor: colors.hairline,
    paddingVertical: space.xl,
  },
  optionPressed: {
    borderBottomColor: colors.accent,
  },
  optionText: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 21,
    lineHeight: 27,
    color: colors.ink,
  },
  orLabel: {
    ...type.kicker,
    color: colors.inkTertiary,
    marginVertical: space.sm,
  },
  skipRow: { marginTop: space.xl, alignSelf: 'flex-start' },
  skipLink: { ...type.kicker, color: colors.inkTertiary },
  submittingText: {
    fontFamily: 'Fraunces_500Medium_Italic',
    fontSize: 15,
    color: colors.inkSecondary,
    marginTop: space.md,
  },
  error: { ...type.body, color: colors.accent, textAlign: 'center' },
});
