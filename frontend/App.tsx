import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Fraunces_500Medium,
  Fraunces_500Medium_Italic,
  Fraunces_600SemiBold,
  Fraunces_600SemiBold_Italic,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import { Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold } from '@expo-google-fonts/archivo';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import RootNavigator from './Navigation';
import { getPortionOverrides } from './api';
import { setPortionOverrides } from './foodDensity';
import { colors } from './theme';

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_500Medium,
    Fraunces_500Medium_Italic,
    Fraunces_600SemiBold,
    Fraunces_600SemiBold_Italic,
    Fraunces_700Bold,
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  // Portion overrides are read synchronously by getPortionUnit, so they must
  // land before any screen renders a portion. A failed fetch just leaves the
  // keyword heuristic in charge — never blocks the app.
  const [overridesSettled, setOverridesSettled] = useState(false);
  useEffect(() => {
    getPortionOverrides()
      .then(setPortionOverrides)
      .catch(() => {})
      .finally(() => setOverridesSettled(true));
  }, []);

  if ((!fontsLoaded && !fontError) || !overridesSettled) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <RootNavigator />
    </SafeAreaProvider>
  );
}
