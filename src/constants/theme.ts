/**
 * Luxury Dark Theme — Carbon Fiber + Neon Cyan
 * Design system constants for the RC Car Controller app.
 */

export const COLORS = {
  // Core backgrounds
  backgroundDark: '#0A0A0F',
  backgroundCard: '#12121A',
  backgroundElevated: '#1A1A25',
  carbonFiber: '#0E0E14',

  // Neon cyan accent palette
  accentPrimary: '#00E5FF',
  accentSecondary: '#00B8D4',
  accentDim: '#006B7D',
  accentGlow: 'rgba(0, 229, 255, 0.25)',
  accentGlowStrong: 'rgba(0, 229, 255, 0.5)',
  accentGlowSubtle: 'rgba(0, 229, 255, 0.08)',

  // Neon blue secondary
  bluePrimary: '#2979FF',
  blueGlow: 'rgba(41, 121, 255, 0.25)',

  // Status colors
  success: '#00E676',
  successGlow: 'rgba(0, 230, 118, 0.3)',
  danger: '#FF1744',
  dangerGlow: 'rgba(255, 23, 68, 0.3)',
  warning: '#FFD600',
  warningGlow: 'rgba(255, 214, 0, 0.3)',

  // Text
  textPrimary: '#EAEAEF',
  textSecondary: '#8A8A9A',
  textMuted: '#55556A',
  textAccent: '#00E5FF',

  // Borders & surfaces
  borderSubtle: 'rgba(255, 255, 255, 0.06)',
  borderAccent: 'rgba(0, 229, 255, 0.3)',
  surfaceOverlay: 'rgba(0, 0, 0, 0.6)',
  surfaceGlass: 'rgba(18, 18, 26, 0.85)',

  // Honk button (amber/gold accent)
  honkPrimary: '#FFB300',
  honkGlow: 'rgba(255, 179, 0, 0.3)',

  // Headlamp button (warm white/yellow)
  lampPrimary: '#FFF9C4',
  lampGlow: 'rgba(255, 249, 196, 0.3)',
  lampActive: '#FFEE58',
  lampActiveGlow: 'rgba(255, 238, 88, 0.5)',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BORDER_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  round: 999,
} as const;

export const TYPOGRAPHY = {
  heading: {
    fontSize: 18,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  label: {
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  caption: {
    fontSize: 10,
    fontWeight: '500' as const,
    letterSpacing: 0.5,
  },
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
  },
} as const;

export const SHADOWS = {
  neonGlow: {
    shadowColor: COLORS.accentPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  neonGlowSubtle: {
    shadowColor: COLORS.accentPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
} as const;
