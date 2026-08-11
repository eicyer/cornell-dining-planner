import { ComponentType } from 'react';
import { colors, iconSize } from '../theme';

type IconColorToken = 'ink' | 'accent' | 'inkSecondary';
type IconSizeToken = keyof typeof iconSize;

type LucideIconComponent = ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

// Thin wrapper around lucide-react-native icons — this is the actual
// enforcement point for Design.md's icon rules (single accent-family color,
// fixed size scale, never placed on a colored/filled chip background) rather
// than a convention every call site has to remember on its own.
//
// Callers must import icons via their subpath, e.g.
// `import ThumbsUp from 'lucide-react-native/icons/thumbs-up'` — not the
// barrel `{ ThumbsUp } from 'lucide-react-native'`, which bundles all ~1,800
// icons. See Design.md's Icons section.
export default function Icon({
  icon: LucideIcon,
  color = 'ink',
  size = 'md',
}: {
  icon: LucideIconComponent;
  color?: IconColorToken;
  size?: IconSizeToken;
}) {
  return <LucideIcon color={colors[color]} size={iconSize[size]} strokeWidth={1.75} />;
}
