import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Handle the Android hardware/gesture back while the current route is focused.
 * Return true from `handler` to consume the event; false lets navigation pop or exit.
 * Registered on focus only, so screens pushed on top keep the default back.
 */
export function useAndroidBack(handler: () => boolean, enabled = true) {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android' || !enabled) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', handler);
      return () => sub.remove();
    }, [handler, enabled])
  );
}
