/**
 * Theme constants matching the SwiftUI app
 */

export const Colors = {
  // Backgrounds
  background: '#000000',

  // Primary colors
  accent: '#FF9500', // iOS system orange
  accentGreen: '#34C759', // iOS system green for income
  accentRed: '#FF3B30', // iOS system red for negative balances

  // Text colors
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.7)',
  textTertiary: 'rgba(255, 255, 255, 0.5)',
  textMuted: 'rgba(255, 255, 255, 0.3)',

  // UI elements
  pillBackground: 'rgba(255, 255, 255, 0.12)',
  pillBorder: 'rgba(255, 255, 255, 0.15)',
  divider: 'rgba(255, 255, 255, 0.06)',
  cardBackground: 'rgba(255, 255, 255, 0.08)',

  // Tab switcher
  tabSwitcherBackground: 'rgba(0, 0, 0, 0.55)',
  tabSwitcherDot: 'rgba(255, 255, 255, 0.25)',

  // Status
  error: '#FF3B30',
  success: '#34C759',
};

import { Platform } from 'react-native';

// On web the family string is passed straight to CSS, so we can append a
// documented fallback stack (Avenir Next Condensed ships with iOS/macOS; Android
// and Windows browsers fall back to a condensed system face). Native keeps the
// exact PostScript names.
const webStack = (postScriptName: string, cssFamily: string, weight: string) =>
  Platform.OS === 'web'
    ? `"${postScriptName}", "${cssFamily}", "Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", system-ui, sans-serif`
    : postScriptName;

export const Fonts = {
  // Font families (these need to be loaded via expo-font)
  heavy: webStack('AvenirNextCondensed-Heavy', 'Avenir Next Condensed Heavy', '900'),
  demiBold: webStack('AvenirNextCondensed-DemiBold', 'Avenir Next Condensed Demi Bold', '600'),
  medium: webStack('AvenirNextCondensed-Medium', 'Avenir Next Condensed Medium', '500'),

  // Fallbacks for development
  heavyFallback: 'System',
  demiBoldFallback: 'System',
  mediumFallback: 'System',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
};

export const Sizes = {
  // Pill dimensions
  pillHeight: 36,
  pillHorizontalPadding: 12,

  // Tab switcher
  tabSwitcherIconSize: 18,
  tabSwitcherDotSize: 3,

  // Calculator keys
  keyHeight: 56,
  keyFontSize: 24,

  // Emoji row
  emojiItemSize: 36,
  emojiFontSize: 24,
  emojiSpacing: 14,
};

// Tab configuration matching Swift app
// Note: display order is 0,1,2,4,3 but tags are the actual indices
export const Tabs = [
  { key: 0, icon: 'dollarsign.circle', label: 'Calculator' },
  { key: 1, icon: 'list.bullet', label: 'Transactions' },
  { key: 2, icon: 'creditcard', label: 'Accounts' },
  { key: 4, icon: 'airplane', label: 'Trips' },
  { key: 3, icon: 'gearshape', label: 'Settings' },
] as const;

// Map SF Symbol names to Expo vector icon names
export const IconMap: Record<string, { family: 'Ionicons' | 'MaterialCommunityIcons' | 'Feather'; name: string }> = {
  'dollarsign.circle': { family: 'Ionicons', name: 'calculator-outline' },
  'list.bullet': { family: 'Ionicons', name: 'list-outline' },
  'creditcard': { family: 'Ionicons', name: 'card-outline' },
  'airplane': { family: 'Ionicons', name: 'airplane-outline' },
  'gearshape': { family: 'Ionicons', name: 'settings-outline' },
  'delete.left': { family: 'Ionicons', name: 'backspace-outline' },
  'note.text': { family: 'Ionicons', name: 'document-text-outline' },
  'chevron.right': { family: 'Ionicons', name: 'chevron-forward' },
  'xmark.circle.fill': { family: 'Ionicons', name: 'close-circle' },
  'checkmark': { family: 'Ionicons', name: 'checkmark' },
  'plus': { family: 'Ionicons', name: 'add' },
};
