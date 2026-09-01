import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, useFocusEffect, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import {
  EateryCrafted,
  EateryMenu,
  Me,
  Preferences,
  Totals,
  getCraftedMealsToday,
  getMe,
  getMealPreferenceSurveyPairs,
  getMenusToday,
  getPreferences,
  getStationSurveyPairs,
  loginUrl,
  logout,
  submitMealPreferenceSurvey,
  submitStationSurvey,
} from './api';
import PreferencesForm from './PreferencesForm';
import FoodSurveyScreen from './FoodSurveyScreen';
import CraftedMealsList from './CraftedMealsList';
import DiaryScreen from './DiaryScreen';
import EateryDetailScreen from './EateryDetailScreen';
import Button from './components/Button';
import Icon from './components/Icon';
import { colors, space, type } from './theme';

// Custom header back button (Icon-based chevron) rather than the platform
// default text/glyph — keeps the header visually flat/on-brand while still
// getting native-stack's real push/pop + swipe-back behavior for free.
// Renders nothing when there's no back stack (e.g. this route is the
// current initial route at app boot).
function HeaderBackButton() {
  const navigation = useNavigation();
  if (!navigation.canGoBack()) return null;
  return (
    <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBack}>
      <Icon icon={ChevronLeft} size="lg" color="ink" />
    </Pressable>
  );
}

export type RootStackParamList = {
  LoggedOut: undefined;
  Survey: { existing: Preferences | null };
  FoodSurvey: undefined;
  CraftedMeals: undefined;
  Diary: undefined;
  EateryDetail: { eatery: EateryMenu; perMealTarget: Totals | null };
  StationSurvey: { eatery: EateryMenu };
  MealPreferenceSurvey: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Header treatment shared by every "step/detail" route (Survey, FoodSurvey,
// EateryDetail, StationSurvey, MealPreferenceSurvey) — a flat, title-less native header so the
// platform gives us a real back button and swipe-back gesture for free,
// without introducing a shadow/border box (kept flat per Design.md).
const pushedHeaderOptions = {
  headerShown: true,
  headerTitle: '',
  headerShadowVisible: false,
  headerStyle: { backgroundColor: colors.paper },
  headerTintColor: colors.ink,
  headerBackVisible: false,
  headerLeft: () => <HeaderBackButton />,
} as const;

function LoggedOutScreen() {
  return (
    <View style={styles.center}>
      <Text style={styles.kicker}>Cornell Dining</Text>
      <Text style={styles.title}>Plan your plate.</Text>
      <Button label="Sign in with Google →" onPress={() => Linking.openURL(loginUrl())} fullWidth={false} />
    </View>
  );
}

function SurveyRouteScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'Survey'>) {
  function handleSaved(prefs: Preferences) {
    if (!prefs.food_survey_completed) {
      navigation.replace('FoodSurvey');
      return;
    }
    navigation.replace('CraftedMeals');
  }
  return (
    <ScrollView style={styles.pushedScroll} contentContainerStyle={styles.pushedContent}>
      <PreferencesForm initial={route.params.existing} onSaved={handleSaved} />
    </ScrollView>
  );
}

function FoodSurveyRouteScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'FoodSurvey'>) {
  return (
    <ScrollView style={styles.pushedScroll} contentContainerStyle={styles.pushedContent}>
      <FoodSurveyScreen onDone={() => navigation.replace('CraftedMeals')} />
    </ScrollView>
  );
}

function CraftedMealsRouteScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'CraftedMeals'>) {
  const [eateries, setEateries] = useState<EateryCrafted[] | null>(null);
  const [perMealTarget, setPerMealTarget] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [data, prefs] = await Promise.all([getCraftedMealsToday(), getPreferences()]);
      setEateries(data);
      if (prefs) {
        const n = Math.max(prefs.meals_per_day, 1);
        setPerMealTarget({
          calories: prefs.calorie_goal / n,
          protein_g: prefs.protein_goal_g / n,
          carbs_g: prefs.carb_goal_g / n,
          fat_g: prefs.fat_goal_g / n,
        });
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  // Refetch every time this screen regains focus (e.g. swiping back from
  // Eatery Detail after logging a meal) instead of the old app's explicit
  // loadCraftedMeals() call threaded through every onBack/onLogged handler.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleSelectEatery(eateryId: number) {
    try {
      const menus = await getMenusToday();
      const eatery = menus.find((e) => e.id === eateryId);
      if (!eatery) {
        setError(`Eatery ${eateryId} not found in today's menus`);
        return;
      }
      navigation.navigate('EateryDetail', { eatery, perMealTarget });
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleUpdatePreferences() {
    try {
      const prefs = await getPreferences();
      navigation.navigate('Survey', { existing: prefs });
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleLogout() {
    try {
      await logout();
      navigation.reset({ index: 0, routes: [{ name: 'LoggedOut' }] });
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Something went wrong: {error}</Text>
      </View>
    );
  }

  if (!eateries) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <CraftedMealsList
      eateries={eateries}
      perMealTarget={perMealTarget}
      refreshing={refreshing}
      onRefresh={handleRefresh}
      onGoToDiary={() => navigation.navigate('Diary')}
      onSelectEatery={handleSelectEatery}
      onLogout={handleLogout}
      onUpdatePreferences={handleUpdatePreferences}
      onRetakeFoodSurvey={() => navigation.navigate('FoodSurvey')}
      onRefineMealPreferences={() => navigation.navigate('MealPreferenceSurvey')}
    />
  );
}

function DiaryRouteScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Diary'>) {
  async function handleUpdatePreferences() {
    const prefs = await getPreferences();
    navigation.navigate('Survey', { existing: prefs });
  }
  async function handleLogout() {
    await logout();
    navigation.reset({ index: 0, routes: [{ name: 'LoggedOut' }] });
  }
  return (
    <DiaryScreen
      onGoToToday={() => navigation.navigate('CraftedMeals')}
      onLogout={handleLogout}
      onUpdatePreferences={handleUpdatePreferences}
      onRetakeFoodSurvey={() => navigation.navigate('FoodSurvey')}
      onRefineMealPreferences={() => navigation.navigate('MealPreferenceSurvey')}
    />
  );
}

function EateryDetailRouteScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'EateryDetail'>) {
  const { eatery, perMealTarget } = route.params;
  return (
    <EateryDetailScreen
      eatery={eatery}
      perMealTarget={perMealTarget}
      onCompare={() => navigation.navigate('StationSurvey', { eatery })}
      onLogged={() => navigation.navigate('Diary')}
    />
  );
}

function StationSurveyRouteScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'StationSurvey'>) {
  const { eatery } = route.params;
  return (
    <ScrollView style={styles.pushedScroll} contentContainerStyle={styles.pushedContent}>
      <FoodSurveyScreen
        onDone={() => navigation.goBack()}
        fetchPairs={() => getStationSurveyPairs(eatery.id)}
        submitResponses={(responses) => submitStationSurvey(eatery.id, responses)}
        kicker={`Compare · ${eatery.name}`}
      />
    </ScrollView>
  );
}

function MealPreferenceSurveyRouteScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'MealPreferenceSurvey'>) {
  return (
    <ScrollView style={styles.pushedScroll} contentContainerStyle={styles.pushedContent}>
      <FoodSurveyScreen
        onDone={() => navigation.goBack()}
        fetchPairs={getMealPreferenceSurveyPairs}
        submitResponses={submitMealPreferenceSurvey}
        kicker="Meal Preferences"
      />
    </ScrollView>
  );
}

type BootState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; initialRoute: 'LoggedOut' | 'Survey' | 'FoodSurvey' | 'CraftedMeals'; surveyExisting: Preferences | null };

function useBootstrap(): BootState {
  const [state, setState] = useState<BootState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me: Me | null = await getMe();
        if (!me) {
          if (!cancelled) setState({ kind: 'ready', initialRoute: 'LoggedOut', surveyExisting: null });
          return;
        }
        const prefs: Preferences | null = await getPreferences();
        if (!prefs) {
          if (!cancelled) setState({ kind: 'ready', initialRoute: 'Survey', surveyExisting: null });
          return;
        }
        if (!prefs.food_survey_completed) {
          if (!cancelled) setState({ kind: 'ready', initialRoute: 'FoodSurvey', surveyExisting: null });
          return;
        }
        if (!cancelled) setState({ kind: 'ready', initialRoute: 'CraftedMeals', surveyExisting: null });
      } catch (err: any) {
        if (!cancelled) setState({ kind: 'error', message: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export default function RootNavigator() {
  const boot = useBootstrap();

  if (boot.kind === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (boot.kind === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Something went wrong: {boot.message}</Text>
        <Text style={styles.errorHint}>Is the backend running?</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={boot.initialRoute}
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}
      >
        <Stack.Screen name="LoggedOut" component={LoggedOutScreen} />
        <Stack.Screen
          name="Survey"
          component={SurveyRouteScreen}
          initialParams={{ existing: boot.surveyExisting }}
          options={pushedHeaderOptions}
        />
        <Stack.Screen name="FoodSurvey" component={FoodSurveyRouteScreen} options={pushedHeaderOptions} />
        <Stack.Screen name="CraftedMeals" component={CraftedMealsRouteScreen} />
        <Stack.Screen name="Diary" component={DiaryRouteScreen} />
        <Stack.Screen name="EateryDetail" component={EateryDetailRouteScreen} options={pushedHeaderOptions} />
        <Stack.Screen name="StationSurvey" component={StationSurveyRouteScreen} options={pushedHeaderOptions} />
        <Stack.Screen
          name="MealPreferenceSurvey"
          component={MealPreferenceSurveyRouteScreen}
          options={pushedHeaderOptions}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.paper,
  },
  error: {
    ...type.body,
    color: colors.accent,
    textAlign: 'center',
  },
  errorHint: {
    ...type.body,
    color: colors.inkSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  kicker: {
    ...type.kicker,
    marginBottom: 8,
  },
  title: {
    ...type.display,
    marginBottom: 24,
  },
  headerBack: { paddingHorizontal: space.md, paddingVertical: space.sm },
  // Every route rendered under pushedHeaderOptions gets a real native header,
  // so — unlike the old app.tsx's surveyContainer — content no longer needs
  // a hand-tuned paddingTop to clear the status bar, and (fixing a
  // pre-existing bug) is now wrapped in a real ScrollView: PreferencesForm's
  // ~400 lines of fields previously sat in a plain View with no way to
  // scroll to the bottom on a real device.
  pushedScroll: { flex: 1, backgroundColor: colors.paper },
  pushedContent: { padding: space.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
});
