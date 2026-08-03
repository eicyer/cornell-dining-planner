import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { EateryCrafted, EateryMenu, Me, Preferences, getCraftedMealsToday, getMe, getMenusToday, getPreferences, loginUrl } from './api';
import PreferencesForm from './PreferencesForm';
import CraftedMealsList from './CraftedMealsList';
import DiaryScreen from './DiaryScreen';
import EateryDetailScreen from './EateryDetailScreen';

type Screen =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'logged_out' }
  | { kind: 'survey' }
  | { kind: 'crafted'; eateries: EateryCrafted[] }
  | { kind: 'diary' }
  | { kind: 'eateryDetail'; eatery: EateryMenu };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });

  async function loadCraftedMeals() {
    try {
      const eateries = await getCraftedMealsToday();
      setScreen({ kind: 'crafted', eateries });
    } catch (err: any) {
      setScreen({ kind: 'error', message: err.message });
    }
  }

  async function bootstrap() {
    try {
      const me: Me | null = await getMe();
      if (!me) {
        setScreen({ kind: 'logged_out' });
        return;
      }

      const prefs: Preferences | null = await getPreferences();
      if (!prefs) {
        setScreen({ kind: 'survey' });
        return;
      }

      await loadCraftedMeals();
    } catch (err: any) {
      setScreen({ kind: 'error', message: err.message });
    }
  }

  async function handleSelectEatery(eateryId: number) {
    try {
      const menus = await getMenusToday();
      const eatery = menus.find((e) => e.id === eateryId);
      if (!eatery) {
        setScreen({ kind: 'error', message: `Eatery ${eateryId} not found in today's menus` });
        return;
      }
      setScreen({ kind: 'eateryDetail', eatery });
    } catch (err: any) {
      setScreen({ kind: 'error', message: err.message });
    }
  }

  useEffect(() => {
    bootstrap();
  }, []);

  if (screen.kind === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (screen.kind === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Something went wrong: {screen.message}</Text>
        <Text style={styles.errorHint}>Is the backend running?</Text>
      </View>
    );
  }

  if (screen.kind === 'logged_out') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Cornell Dining Planner</Text>
        <Pressable style={styles.loginButton} onPress={() => Linking.openURL(loginUrl())}>
          <Text style={styles.loginButtonText}>Sign in with Google</Text>
        </Pressable>
      </View>
    );
  }

  if (screen.kind === 'survey') {
    return (
      <View style={styles.surveyContainer}>
        <PreferencesForm onSaved={loadCraftedMeals} />
      </View>
    );
  }

  if (screen.kind === 'diary') {
    return <DiaryScreen onGoToToday={loadCraftedMeals} />;
  }

  if (screen.kind === 'eateryDetail') {
    return (
      <EateryDetailScreen
        eatery={screen.eatery}
        onBack={loadCraftedMeals}
        onLogged={() => setScreen({ kind: 'diary' })}
      />
    );
  }

  return (
    <CraftedMealsList
      eateries={screen.eateries}
      onGoToDiary={() => setScreen({ kind: 'diary' })}
      onSelectEatery={handleSelectEatery}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  surveyContainer: {
    flex: 1,
    padding: 16,
    paddingTop: 56,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  error: {
    color: '#b91c1c',
    fontSize: 16,
    textAlign: 'center',
  },
  errorHint: {
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
  },
  loginButton: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
