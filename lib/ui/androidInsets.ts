import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Bottom offset for floating controls. The iOS values were tuned for the home
 * indicator; with Android's 3-button navigation bar (about 48dp, edge-to-edge)
 * those offsets land under the system buttons, so lift the control above the inset.
 */
export function useAndroidBottomOffset(base: number): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'android' ? Math.max(base, insets.bottom + 12) : base;
}

/**
 * Top padding for iOS page-sheet modals. On Android they open full-screen under
 * the (edge-to-edge) status bar, so headers need the status-bar inset there.
 */
export function useAndroidSheetTopInset(): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'android' ? insets.top : 0;
}
