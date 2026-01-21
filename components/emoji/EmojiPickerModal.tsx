import React, { useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import EmojiKeyboard, { type EmojiType } from 'rn-emoji-keyboard';

import { Text } from '@/components/ui/LockedText';
import { Colors } from '@/constants/theme';

type EmojiPickerModalProps = {
  visible: boolean;
  title: string;
  value: string;
  recommendedEmojis: string[];
  onSelect: (emoji: string) => void;
  onClose: () => void;
};

export function EmojiPickerModal({
  visible,
  title,
  value,
  recommendedEmojis,
  onSelect,
  onClose,
}: EmojiPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  const selectAndClose = (emoji: string) => {
    if (!emoji) return;
    Haptics.selectionAsync();
    onSelect(emoji);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>{title}</Text>

          {/* Right spacer for centered title */}
          <View style={styles.headerRightSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionLabel}>Recommended</Text>
          <View style={styles.grid}>
            {recommendedEmojis.map((e) => {
              const isSelected = e === value;
              return (
                <TouchableOpacity
                  key={e}
                  style={[styles.cell, isSelected && styles.cellSelected]}
                  onPress={() => selectAndClose(e)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.emoji}>{e}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ height: 24 }} />

          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => {
              Haptics.selectionAsync();
              setIsKeyboardOpen(true);
            }}
          >
            <View style={styles.moreFullWidth}>
              <Text style={styles.moreFullWidthText}>More Emojis</Text>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.55)" />
            </View>
          </TouchableOpacity>
        </ScrollView>

        <EmojiKeyboard
          open={isKeyboardOpen}
          onClose={() => setIsKeyboardOpen(false)}
          defaultHeight="60%"
          expandable={true}
          enableSearchBar={true}
          enableRecentlyUsed={true}
          categoryPosition="bottom"
          onEmojiSelected={(emojiObject: EmojiType) => {
            selectAndClose(emojiObject.emoji);
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerButton: {
    padding: 6,
    width: 44,
    alignItems: 'flex-start',
  },
  headerRightSpacer: {
    width: 44,
  },
  headerTitle: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 20,
    color: '#FFFFFF',
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  sectionLabel: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cell: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: {
    backgroundColor: 'rgba(255, 149, 0, 0.25)',
    borderColor: Colors.accent,
  },
  emoji: {
    fontSize: 26,
  },
  moreFullWidth: {
    height: 54,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  moreFullWidthText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },
});
