/**
 * Desktop browser layout: web with a wide window. Phones and narrow windows keep the
 * native-parity mobile layout (pager + floating tab pill).
 */
import { Platform, useWindowDimensions } from 'react-native';

export const DESKTOP_MIN_WIDTH = 1024;

export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
}
