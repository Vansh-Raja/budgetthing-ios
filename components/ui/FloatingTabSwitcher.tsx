/**
 * FloatingTabSwitcher - The floating pill at the bottom of the screen
 * 
 * Matches the SwiftUI FloatingPageSwitcher component exactly.
 */

import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Colors, Sizes, Tabs } from '../../constants/theme';

interface FloatingTabSwitcherProps {
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
}

// Map tab keys to icon names
const getIconName = (key: number): keyof typeof Ionicons.glyphMap => {
  switch (key) {
    case 0: return 'calculator-outline';
    case 1: return 'list-outline';
    case 2: return 'card-outline';
    case 4: return 'airplane-outline';
    case 3: return 'settings-outline';
    default: return 'help-outline';
  }
};

export function FloatingTabSwitcher({ selectedIndex, onSelectIndex }: FloatingTabSwitcherProps) {
  const handlePress = (index: number) => {
    Haptics.selectionAsync();
    onSelectIndex(index);
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.pill}>
        {/* Background - using BlurView with dark overlay */}
        <BlurView intensity={80} tint="dark" style={styles.blurBackground}>
          <View style={styles.darkOverlay} />
        </BlurView>
        
        {/* Content */}
        <View style={styles.content}>
          {Tabs.map((tab, index) => (
            <React.Fragment key={tab.key}>
              <TouchableOpacity
                onPress={() => handlePress(index)}
                style={styles.button}
                activeOpacity={0.7}
                accessibilityLabel={tab.label}
                accessibilityRole="tab"
                accessibilityState={{ selected: selectedIndex === index }}
              >
                <Ionicons
                  name={getIconName(tab.key)}
                  size={Sizes.tabSwitcherIconSize}
                  color={selectedIndex === index ? Colors.accent : Colors.textPrimary}
                />
              </TouchableOpacity>
              
              {/* Divider dot (except after last item) */}
              {index < Tabs.length - 1 && <View style={styles.dot} />}
            </React.Fragment>
          ))}
        </View>
        
        {/* Border overlay - pointerEvents none so it doesn't block touches */}
        <View style={styles.border} pointerEvents="none" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  pill: {
    borderRadius: 9999,
    overflow: 'hidden',
  },
  blurBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.tabSwitcherBackground,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  button: {
    padding: 8,
    marginHorizontal: 5,
  },
  dot: {
    width: Sizes.tabSwitcherDotSize,
    height: Sizes.tabSwitcherDotSize,
    borderRadius: Sizes.tabSwitcherDotSize / 2,
    backgroundColor: Colors.tabSwitcherDot,
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: Colors.pillBorder,
  },
});
