import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '../theme';

// Status-bar / notch clearance for tab screens, which render no native
// header. Took over this job from the retired TopNav (docs/adr/0029).
export default function TopInset() {
  const insets = useSafeAreaInsets();
  return <View style={{ height: Math.max(insets.top, space.md) + space.lg }} />;
}
