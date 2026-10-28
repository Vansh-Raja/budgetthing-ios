import { Platform } from 'react-native';

/**
 * Avenir Next Condensed ships with iOS (and macOS/iOS browsers) but not Android.
 * Screens reference it by PostScript name, so on Android we register Barlow
 * Condensed (OFL, assets/fonts/BarlowCondensed-OFL.txt) under the same names.
 * iOS keeps the system font; web is unchanged.
 */
export const androidFontAliases: Record<string, number> =
  Platform.OS === 'android'
    ? {
        'AvenirNextCondensed-Regular': require('../../assets/fonts/BarlowCondensed-Regular.ttf'),
        'AvenirNextCondensed-Medium': require('../../assets/fonts/BarlowCondensed-Medium.ttf'),
        'AvenirNextCondensed-DemiBold': require('../../assets/fonts/BarlowCondensed-SemiBold.ttf'),
        'AvenirNextCondensed-Bold': require('../../assets/fonts/BarlowCondensed-Bold.ttf'),
        'AvenirNextCondensed-Heavy': require('../../assets/fonts/BarlowCondensed-ExtraBold.ttf'),
      }
    : {};
