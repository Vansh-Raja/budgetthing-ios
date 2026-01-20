import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './LockedText';
import { Colors } from '@/constants/theme';

type ToastKind = 'info' | 'error';

type ToastState = {
  message: string;
  kind: ToastKind;
  visible: boolean;
};

type ToastContextValue = {
  show: (message: string, options?: { kind?: ToastKind; durationMs?: number }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState>({ message: '', kind: 'info', visible: false });
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    Animated.timing(opacity, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    });
  }, [opacity]);

  const show = useCallback(
    (message: string, options?: { kind?: ToastKind; durationMs?: number }) => {
      const kind = options?.kind ?? 'info';
      const durationMs = options?.durationMs ?? 1400;

      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }

      setToast({ message, kind, visible: true });
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();

      hideTimerRef.current = setTimeout(() => {
        hide();
      }, durationMs);
    },
    [hide, opacity]
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast.visible ? (
        <View pointerEvents="none" style={[styles.host, { paddingBottom: Math.max(16, insets.bottom + 10) }]}>
          <Animated.View
            style={[
              styles.toast,
              toast.kind === 'error' ? styles.toastError : styles.toastInfo,
              { opacity },
            ]}
          >
            <Text style={styles.toastText}>{toast.message}</Text>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      show: () => {
        // No-op when provider isn't mounted.
      },
    };
  }
  return ctx;
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  toast: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9999,
    borderWidth: 1,
    maxWidth: 280,
  },
  toastInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  toastError: {
    backgroundColor: 'rgba(255, 59, 48, 0.18)',
    borderColor: 'rgba(255, 59, 48, 0.25)',
  },
  toastText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: Colors.accent,
    textAlign: 'center',
  },
});
