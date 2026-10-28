import React from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

/**
 * With edge-to-edge, Android no longer resizes the window for the keyboard, so a
 * form's ScrollView keeps its full height and the keyboard covers the lower fields.
 * Wrap the ScrollView in this: on Android it shrinks to the space above the keyboard
 * (the ScrollView then keeps the focused input visible). iOS and web render the children unchanged.
 */
export function AndroidKeyboardAvoider({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'android') return <>{children}</>;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      {children}
    </KeyboardAvoidingView>
  );
}
