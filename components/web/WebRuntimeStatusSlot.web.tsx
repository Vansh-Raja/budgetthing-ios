import React from 'react';
import { View } from 'react-native';
import { WebRuntimeStatus } from './WebRuntimeStatus';

export function WebRuntimeStatusSlot() {
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
      <WebRuntimeStatus />
    </View>
  );
}
