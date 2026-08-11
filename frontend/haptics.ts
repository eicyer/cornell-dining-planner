import * as Haptics from 'expo-haptics';

// Thin, single import surface over expo-haptics — the package ships its own
// web shim (no-op/Vibration API), so no Platform.OS branching is needed
// here. Kept to three calls, matching the three places touch feedback
// actually helps: a toggle/choice, a light tap, and a completed action.
export const selection = () => Haptics.selectionAsync();
export const light = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
export const success = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
