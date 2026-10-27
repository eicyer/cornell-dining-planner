import { ReactNode, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, useFocusEffect, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import {
  EateryCrafted,
  EateryMenu,
  MealSection,
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
import ProgressScreen from './ProgressScreen';
import EateryDetailScreen from './EateryDetailScreen';
import AddFoodScreen from './AddFoodScreen';
import SetupScreen from './SetupScreen';
import MoreScreen from './MoreScreen';
import TabBar, { TabName } from './components/TabBar';
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
  Setup: undefined;
  Survey: { existing: Preferences | null };
  FoodSurvey: undefined;
  // The four tabs (docs/adr/0029).
  Diary: undefined;
  Menus: undefined;
  Progress: undefined;
  More: undefined;
  EateryDetail: { eatery: EateryMenu; perMealTarget: Totals | null };
  StationSurvey: { eatery: EateryMenu };
  MealPreferenceSurvey: undefined;
  AddFood: { section: MealSection };
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

const tabOptions = { animation: 'none' } as const;

function LoggedOutScreen() {
  return (
    <View style={styles.center}>
      <Text style={styles.kicker}>Cornell Dining</Text>
      <Text style={styles.title}>Plan your plate.</Text>
      <Button label="Sign in with Google →" onPress={() => Linking.openURL(loginUrl())} fullWidth={false} />
    </View>
  );
}

// Tabs are flat (docs/adr/0029): switching resets the stack to that tab's
// root, so a tab never carries a back stack from another one.
function switchTab(navigation: { reset: (state: any) => void }, tab: TabName) {
  navigation.reset({ index: 0, routes: [{ name: tab }] });
}

// A tab's root screen with the tab bar under it. Pushed detail/step screens
// render without this, so the bar hides while they're open.
function TabScreen({ tab, navigation, children }: { tab: TabName; navigation: any; children: ReactNode }) {
  return (
    <View style={styles.tabScreen}>
      <View style={styles.tabContent}>{children}</View>
      <TabBar current={tab} onSelect={(next) => next !== tab && switchTab(navigation, next)} />
    </View>
  );
}

function SurveyRouteScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'Survey'>) {
  // First run (reached from Setup's "own numbers" link) lands on the Diary
  // (home); editing from More just returns there. The Food Preference Survey
  // is no longer part of onboarding (docs/adr/0027).
  function handleSaved() {
    if (route.params.existing && navigation.canGoBack()) navigation.goBack();
    else switchTab(navigation, 'Diary');
  }
  return (
    <ScrollView style={styles.pushedScroll} contentContainerStyle={styles.pushedContent}>
      <PreferencesForm initial={route.params.existing} onSaved={handleSaved} />
    </ScrollView>
  );
}

// First run for a user with no preferences yet (docs/adr/0031).
function SetupRouteScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Setup'>) {
  return (
    <ScrollView style={styles.pushedScroll} contentContainerStyle={styles.pushedContent}>
      <SetupScreen
        onDone={() => switchTab(navigation, 'Diary')}
        onManual={() => navigation.navigate('Survey', { existing: null })}
      />
    </ScrollView>
  );
}

function FoodSurveyRouteScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'FoodSurvey'>) {
  return (
    <ScrollView style={styles.pushedScroll} contentContainerStyle={styles.pushedContent}>
      <FoodSurveyScreen
        onDone={() => (navigation.canGoBack() ? navigation.goBack() : switchTab(navigation, 'Diary'))}
      />
    </ScrollView>
  );
}

function MenusRouteScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Menus'>) {
  const [eateries, setEateries] = useState<EateryCrafted[] | null>(null);
  const [perMealTarget, setPerMealTarget] = useState<Totals | null>(null);
  const [tags, setTags] = useState<{ liked: string[]; disliked: string[] }>({ liked: [], disliked: [] });
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [data, prefs] = await Promise.all([getCraftedMealsToday(), getPreferences()]);
      setEateries(data);
      if (prefs) {
        setTags({ liked: prefs.liked_tags, disliked: prefs.disliked_tags });
        // Fallback only — each eatery's response carries the target its meal
        // was actually sized to (docs/adr/0027).
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

  let body: ReactNode;
  if (error) {
    body = (
      <View style={styles.center}>
        <Text style={styles.error}>Something went wrong: {error}</Text>
      </View>
    );
  } else if (!eateries) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  } else {
    body = (
      <CraftedMealsList
        eateries={eateries}
        perMealTarget={perMealTarget}
        likedTags={tags.liked}
        dislikedTags={tags.disliked}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onSelectEatery={handleSelectEatery}
      />
    );
  }

  return (
    <TabScreen tab="Menus" navigation={navigation}>
      {body}
    </TabScreen>
  );
}

function DiaryRouteScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Diary'>) {
  return (
    <TabScreen tab="Diary" navigation={navigation}>
      <DiaryScreen onLog={(section) => navigation.navigate('AddFood', { section })} />
    </TabScreen>
  );
}

function ProgressRouteScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Progress'>) {
  return (
    <TabScreen tab="Progress" navigation={navigation}>
      <ProgressScreen />
    </TabScreen>
  );
}

function MoreRouteScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'More'>) {
  const [error, setError] = useState<string | null>(null);

  async function handleUpdatePreferences() {
    try {
      navigation.navigate('Survey', { existing: await getPreferences() });
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

  return (
    <TabScreen tab="More" navigation={navigation}>
      {error && <Text style={[styles.error, styles.moreError]}>{error}</Text>}
      <MoreScreen
        onUpdatePreferences={handleUpdatePreferences}
        onRetakeFoodSurvey={() => navigation.navigate('FoodSurvey')}
        onRefineMealPreferences={() => navigation.navigate('MealPreferenceSurvey')}
        onLogout={handleLogout}
      />
    </TabScreen>
  );
}

function AddFoodRouteScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'AddFood'>) {
  return <AddFoodScreen section={route.params.section} onDone={() => navigation.goBack()} />;
}

function EateryDetailRouteScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'EateryDetail'>) {
  const { eatery, perMealTarget } = route.params;
  return (
    <EateryDetailScreen
      eatery={eatery}
      perMealTarget={perMealTarget}
      onCompare={() => navigation.navigate('StationSurvey', { eatery })}
      onLogged={() => switchTab(navigation, 'Diary')}
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
  | { kind: 'ready'; initialRoute: 'LoggedOut' | 'Setup' | 'Diary'; surveyExisting: Preferences | null };

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
          if (!cancelled) setState({ kind: 'ready', initialRoute: 'Setup', surveyExisting: null });
          return;
        }
        if (!cancelled) setState({ kind: 'ready', initialRoute: 'Diary', surveyExisting: null });
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
        <Stack.Screen name="Setup" component={SetupRouteScreen} options={pushedHeaderOptions} />
        <Stack.Screen
          name="Survey"
          component={SurveyRouteScreen}
          initialParams={{ existing: boot.surveyExisting }}
          options={pushedHeaderOptions}
        />
        <Stack.Screen name="FoodSurvey" component={FoodSurveyRouteScreen} options={pushedHeaderOptions} />
        {/* Tabs swap in place rather than sliding — see switchTab. */}
        <Stack.Screen name="Diary" component={DiaryRouteScreen} options={tabOptions} />
        <Stack.Screen name="Menus" component={MenusRouteScreen} options={tabOptions} />
        <Stack.Screen name="Progress" component={ProgressRouteScreen} options={tabOptions} />
        <Stack.Screen name="More" component={MoreRouteScreen} options={tabOptions} />
        <Stack.Screen name="EateryDetail" component={EateryDetailRouteScreen} options={pushedHeaderOptions} />
        <Stack.Screen name="AddFood" component={AddFoodRouteScreen} options={pushedHeaderOptions} />
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
  tabScreen: { flex: 1, backgroundColor: colors.paper },
  tabContent: { flex: 1 },
  moreError: { paddingHorizontal: space.lg, paddingTop: space.lg },
  // Every route rendered under pushedHeaderOptions gets a real native header,
  // so — unlike the old app.tsx's surveyContainer — content no longer needs
  // a hand-tuned paddingTop to clear the status bar, and (fixing a
  // pre-existing bug) is now wrapped in a real ScrollView: PreferencesForm's
  // ~400 lines of fields previously sat in a plain View with no way to
  // scroll to the bottom on a real device.
  pushedScroll: { flex: 1, backgroundColor: colors.paper },
  pushedContent: { padding: space.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
});
