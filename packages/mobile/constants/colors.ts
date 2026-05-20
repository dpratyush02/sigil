// Luminous Noir Design System
export const Colors = {
  // Backgrounds
  background: '#131313',
  surfaceDim: '#131313',
  surfaceContainerLowest: '#0E0E0E',
  surfaceContainerLow: '#1C1B1B',
  surfaceContainer: '#20201F',
  surfaceContainerHigh: '#2A2A2A',
  surfaceContainerHighest: '#353535',
  surfaceBright: '#393939',
  card: '#1C1B1B',
  cardElevated: '#242424',

  // Primary (Sunflower Yellow)
  primary: '#FACC15',
  primaryContainer: '#FACC15',
  onPrimary: '#3C2F00',
  onPrimaryContainer: '#6C5700',
  primaryFixed: '#FFE083',
  primaryFixedDim: '#EEC200',

  // Text
  onSurface: '#E5E2E1',
  onSurfaceVariant: '#D1C6AB',
  onBackground: '#E5E2E1',
  textMuted: '#9A9078',
  textDisabled: '#4D4632',

  // Secondary
  secondary: '#B7C8DB',
  secondaryContainer: '#384858',
  onSecondary: '#223241',

  // Borders
  outline: '#9A9078',
  outlineVariant: '#4D4632',
  border: '#353535',
  borderSubtle: '#2A2A2A',

  // Status
  error: '#FFB4AB',
  errorContainer: '#93000A',
  onError: '#690005',
  warning: '#FF8800',
  success: '#FACC15',

  // Overlays
  overlay: 'rgba(0,0,0,0.6)',
  overlayLight: 'rgba(250,204,21,0.08)',
  overlayYellow: 'rgba(250,204,21,0.15)',

  // Tertiary
  tertiary: '#EDEDED',
  tertiaryContainer: '#D0D1D1',
  onTertiary: '#2F3131',

  // Aliases (shorthand for Luminous Noir)
  accent: '#FACC15',        // same as primary
  surface: '#1C1B1B',       // same as card
  textPrimary: '#E5E2E1',   // same as onSurface
} as const;

export type ColorKey = keyof typeof Colors;
