// Design tokens for the Editorial direction. See Design.md for the full spec —
// this file is the single source of truth every screen imports from instead of
// hardcoding hex values, font names, or spacing numbers.

export const colors = {
  paper: '#F7F3EA',
  ink: '#1C1A17',
  inkSecondary: '#6B6355',
  inkTertiary: '#9C9483',
  hairline: '#E4DCC8',
  accent: '#B31B1B', // Cornell Red — the only saturated accent in the system
  accentInk: '#FFFFFF',
  disabled: '#D8CFB8',
  neutralFallback: '#A8A093', // warm stand-in for stray cool-gray fallback literals
};

export const fonts = {
  displayBold: 'Fraunces_700Bold',
  displaySemiBold: 'Fraunces_600SemiBold',
  displaySemiBoldItalic: 'Fraunces_600SemiBold_Italic',
  displayMedium: 'Fraunces_500Medium',
  displayMediumItalic: 'Fraunces_500Medium_Italic',
  bodyRegular: 'Archivo_400Regular',
  bodyMedium: 'Archivo_500Medium',
  bodySemiBold: 'Archivo_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
};

export const type = {
  display: { fontFamily: fonts.displayBold, fontSize: 32, lineHeight: 38, color: colors.ink },
  headline: { fontFamily: fonts.displaySemiBold, fontSize: 22, lineHeight: 28, color: colors.ink },
  headlineSmall: { fontFamily: fonts.displaySemiBold, fontSize: 17, lineHeight: 22, color: colors.ink },
  editorialItalic: { fontFamily: fonts.displayMediumItalic, fontSize: 14, lineHeight: 20, color: colors.inkSecondary },
  body: { fontFamily: fonts.bodyRegular, fontSize: 15, lineHeight: 22, color: colors.ink },
  kicker: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: colors.inkSecondary,
  },
  button: { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 20, color: colors.accentInk },
  caption: { fontFamily: fonts.bodyRegular, fontSize: 12, lineHeight: 16, color: colors.inkTertiary },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, color: colors.inkSecondary },
  monoEmphasis: { fontFamily: fonts.monoMedium, fontSize: 15, lineHeight: 20, color: colors.ink },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };

// Deliberately the only radius token in the system — see Design.md for the
// named exception (colorDot legend swatches).
export const radius = { none: 0 };
