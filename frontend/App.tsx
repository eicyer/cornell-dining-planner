import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

// Web (browser) can reach the backend via localhost. A physical device or
// simulator can't — swap this for your Mac's LAN IP (`ipconfig getifaddr en0`)
// plus :8001 when testing on iOS.
const API_BASE = Platform.OS === 'web' ? 'http://localhost:8001' : 'http://localhost:8001';

type Nutrition = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: number;
  source: string;
};

type Item = {
  name: string;
  nutrition: Nutrition | null;
  diet_tags: string[];
  likely_allergens: string[];
};

type Category = {
  category: string;
  items: Item[];
};

type MenuEvent = {
  meal_period: string;
  categories: Category[];
};

type Eatery = {
  id: number;
  name: string;
  campus_area: string | null;
  menu_events: MenuEvent[];
};

export default function App() {
  const [eateries, setEateries] = useState<Eatery[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/menus/today`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then(setEateries)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load menus: {error}</Text>
        <Text style={styles.errorHint}>Is the backend running on {API_BASE}?</Text>
      </View>
    );
  }

  if (!eateries) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Today's Dining Halls</Text>
      {eateries.map((eatery) => (
        <View key={eatery.id} style={styles.eatery}>
          <Text style={styles.eateryName}>{eatery.name}</Text>
          {eatery.menu_events.length === 0 ? (
            <Text style={styles.closed}>Closed today</Text>
          ) : (
            eatery.menu_events.map((event) => (
              <View key={event.meal_period} style={styles.mealPeriod}>
                <Text style={styles.mealPeriodTitle}>{event.meal_period}</Text>
                {event.categories.map((category) => (
                  <View key={category.category} style={styles.category}>
                    <Text style={styles.categoryTitle}>{category.category}</Text>
                    {category.items.map((item) => (
                      <View key={item.name} style={styles.item}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemCalories}>
                          {item.nutrition ? `${Math.round(item.nutrition.calories)} cal` : '—'}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
    paddingTop: 56,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
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
    marginBottom: 16,
  },
  eatery: {
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 16,
  },
  eateryName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  closed: {
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  mealPeriod: {
    marginTop: 8,
  },
  mealPeriodTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 4,
  },
  category: {
    marginLeft: 8,
    marginBottom: 6,
  },
  categoryTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  itemName: {
    fontSize: 14,
    flexShrink: 1,
    paddingRight: 8,
  },
  itemCalories: {
    fontSize: 14,
    color: '#6b7280',
  },
});
