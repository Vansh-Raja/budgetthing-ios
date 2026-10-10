import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useRef, useState } from 'react';
import { Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BorderRadius, Colors, Fonts, Spacing } from '../../constants/theme';
import { formatCents } from '../../lib/logic/currencyUtils';
import { Account, Category, ImportInboxItem } from '../../lib/logic/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PAN_ACTIVATION_OFFSET = 6;
const SWIPE_DISTANCE_THRESHOLD = Math.min(72, SCREEN_WIDTH * 0.18);
const SWIPE_FLING_DISTANCE = 24;
const SWIPE_FLING_VELOCITY = 650;

interface Props {
  item: ImportInboxItem;
  account?: Account | null;
  category?: Category | null;
  accounts: Account[];
  categories: Category[];
  expanded: boolean;
  reviewIssues: string[];
  reviewAccountId: string | null;
  reviewCategoryId: string | null;
  onConfirm: (id: string) => boolean | Promise<boolean>;
  onEdit: (id: string) => void;
  onReviewAccountChange: (id: string, accountId: string) => void;
  onReviewCategoryChange: (id: string, categoryId: string | null) => void;
}

export function ImportInboxCard({
  item,
  account,
  category,
  accounts,
  categories,
  expanded,
  reviewIssues,
  reviewAccountId,
  reviewCategoryId,
  onConfirm,
  onEdit,
  onReviewAccountChange,
  onReviewCategoryChange,
}: Props) {
  const translateX = useSharedValue(0);
  const cardOpacity = useSharedValue(1);
  const crossed = useRef(false);
  const [committed, setCommitted] = useState(false);

  const triggerThresholdHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const resetCard = useCallback(() => {
    translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
    cardOpacity.value = withTiming(1, { duration: 160 });
  }, [cardOpacity, translateX]);

  const handleConfirm = useCallback(async () => {
    try {
      const confirmed = await onConfirm(item.id);
      if (confirmed) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCommitted(true);
      } else {
        resetCard();
      }
    } catch {
      resetCard();
    }
  }, [item.id, onConfirm, resetCard]);

  const handleEdit = useCallback(() => {
    Haptics.selectionAsync();
    onEdit(item.id);
  }, [item.id, onEdit]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-PAN_ACTIVATION_OFFSET, PAN_ACTIVATION_OFFSET])
    .failOffsetY([-18, 18])
    .onUpdate((event) => {
      translateX.value = event.translationX;
      const isPastThreshold = Math.abs(event.translationX) >= SWIPE_DISTANCE_THRESHOLD;
      if (isPastThreshold && !crossed.current) {
        crossed.current = true;
        runOnJS(triggerThresholdHaptic)();
      } else if (!isPastThreshold) {
        crossed.current = false;
      }
    })
    .onEnd((event) => {
      const rightSwipe =
        event.translationX >= SWIPE_DISTANCE_THRESHOLD ||
        (event.translationX >= SWIPE_FLING_DISTANCE && event.velocityX >= SWIPE_FLING_VELOCITY);
      const leftSwipe =
        event.translationX <= -SWIPE_DISTANCE_THRESHOLD ||
        (event.translationX <= -SWIPE_FLING_DISTANCE && event.velocityX <= -SWIPE_FLING_VELOCITY);

      if (rightSwipe) {
        translateX.value = withTiming(SCREEN_WIDTH * 1.5, { duration: 250 });
        cardOpacity.value = withTiming(0, { duration: 220 }, () => {
          runOnJS(handleConfirm)();
        });
      } else if (leftSwipe) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
        runOnJS(handleEdit)();
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: cardOpacity.value,
  }));

  const confirmRevealStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, translateX.value / SWIPE_DISTANCE_THRESHOLD)),
  }));

  const editRevealStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, -translateX.value / SWIPE_DISTANCE_THRESHOLD)),
  }));

  if (committed) return null;

  const title = item.merchantName || item.note || 'Imported transaction';
  const subtitleParts = [
    account ? `${account.emoji} ${account.name}` : item.accountId ? 'Account unavailable' : 'No account from API',
    category ? `${category.emoji} ${category.name}` : item.categoryId ? 'Category unavailable' : 'No category from API',
    new Date(item.dateMs).toLocaleDateString(),
  ].filter(Boolean);

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.revealLeft, confirmRevealStyle]}>
        <Ionicons name="checkmark" size={24} color="#000" />
      </Animated.View>
      <Animated.View style={[styles.revealRight, editRevealStyle]}>
        <Ionicons name="pencil" size={22} color="#000" />
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={cardStyle}>
          <View style={styles.card}>
            <View style={styles.topRow}>
              <View style={styles.titleWrap}>
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
                <Text style={styles.subtitle} numberOfLines={1}>{subtitleParts.join(' · ')}</Text>
              </View>
              <Text style={[styles.amount, item.type === 'income' && styles.income]}>
                {item.type === 'income' ? '+' : ''}
                {formatCents(item.amountCents, item.currencyCode)}
              </Text>
            </View>

            {item.possibleDuplicate ? (
              <View style={styles.badgeRow}>
                <View style={styles.duplicatePill}>
                  <Ionicons name="copy-outline" size={12} color="#FFCC00" />
                  <Text style={styles.duplicateText}>Possible duplicate</Text>
                </View>
              </View>
            ) : null}

            {expanded ? (
              <View style={styles.reviewArea}>
                <View style={styles.reviewHeader}>
                  <Ionicons name="sparkles-outline" size={15} color={Colors.accent} />
                  <Text style={styles.reviewTitle}>Complete before accepting</Text>
                </View>
                {reviewIssues.length ? (
                  <Text style={styles.reviewHint}>{reviewIssues.join(' · ')}</Text>
                ) : null}

                <Text style={styles.reviewLabel}>Account</Text>
                <View style={styles.optionGrid}>
                  {accounts.map((nextAccount) => {
                    const selected = nextAccount.id === reviewAccountId;
                    return (
                      <TouchableOpacity
                        key={nextAccount.id}
                        style={[styles.optionChip, selected && styles.optionChipSelected]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          onReviewAccountChange(item.id, nextAccount.id);
                        }}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.optionText, selected && styles.optionTextSelected]} numberOfLines={1}>
                          {nextAccount.emoji} {nextAccount.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.reviewLabel}>Category</Text>
                <View style={styles.optionGrid}>
                  <TouchableOpacity
                    style={[styles.optionChip, reviewCategoryId === null && styles.optionChipSelected]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      onReviewCategoryChange(item.id, null);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.optionText, reviewCategoryId === null && styles.optionTextSelected]}>
                      Uncategorized
                    </Text>
                  </TouchableOpacity>
                  {categories.map((nextCategory) => {
                    const selected = nextCategory.id === reviewCategoryId;
                    return (
                      <TouchableOpacity
                        key={nextCategory.id}
                        style={[styles.optionChip, selected && styles.optionChipSelected]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          onReviewCategoryChange(item.id, nextCategory.id);
                        }}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.optionText, selected && styles.optionTextSelected]} numberOfLines={1}>
                          {nextCategory.emoji} {nextCategory.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

              </View>
            ) : null}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: Spacing.md,
  },
  revealLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 82,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 82,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    minHeight: 96,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(255,255,255,0.075)',
    padding: Spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: Fonts.demiBold,
    color: Colors.textPrimary,
    fontSize: 20,
  },
  subtitle: {
    marginTop: 3,
    fontFamily: Fonts.medium,
    color: Colors.textTertiary,
    fontSize: 13,
  },
  amount: {
    fontFamily: Fonts.heavy,
    color: Colors.textPrimary,
    fontSize: 22,
  },
  income: {
    color: Colors.accentGreen,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  duplicatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,204,0,0.12)',
  },
  duplicateText: {
    fontFamily: Fonts.medium,
    color: '#FFCC00',
    fontSize: 12,
  },
  reviewArea: {
    marginTop: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.divider,
    paddingTop: Spacing.md,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reviewTitle: {
    fontFamily: Fonts.demiBold,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  reviewHint: {
    marginTop: 5,
    fontFamily: Fonts.medium,
    color: Colors.textTertiary,
    fontSize: 13,
  },
  reviewLabel: {
    marginTop: Spacing.md,
    marginBottom: 8,
    fontFamily: Fonts.demiBold,
    color: Colors.textSecondary,
    fontSize: 13,
    textTransform: 'uppercase',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.pillBackground,
    borderWidth: 1,
    borderColor: Colors.pillBorder,
  },
  optionChipSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  optionText: {
    fontFamily: Fonts.demiBold,
    color: Colors.textSecondary,
    fontSize: 13,
  },
  optionTextSelected: {
    color: '#000',
  },
});
