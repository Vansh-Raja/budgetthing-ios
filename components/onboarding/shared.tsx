/**
 * Shared building blocks for the onboarding story: a looping animation clock,
 * the demo inbox card, and the AI-agent badges.
 */
import { Text } from '@/components/ui/LockedText';
import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Colors, Fonts } from '@/constants/theme';
import { formatCents } from '@/lib/logic/currencyUtils';

/**
 * A 0→1 clock that repeats every `durationMs`. Scenes derive every keyframe from it.
 * With Reduce Motion on, it holds at `restAt` (a representative still frame).
 */
export function useLoop(durationMs: number, restAt = 0.6): SharedValue<number> {
  const reduced = useReducedMotion();
  const t = useSharedValue(reduced ? restAt : 0);
  useEffect(() => {
    if (reduced) {
      t.value = restAt;
      return;
    }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: durationMs, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [durationMs, reduced, restAt, t]);
  return t;
}

/** A 0→1 progress that plays once over `durationMs` (instantly complete with Reduce Motion). */
export function useOnce(durationMs: number): SharedValue<number> {
  const reduced = useReducedMotion();
  const t = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    t.value = withTiming(1, { duration: durationMs, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(t);
  }, [durationMs, reduced, t]);
  return t;
}

/** Personal AI agents shown as examples. Stylised badges, not official logos. */
export const AGENTS = [
  { name: 'Dots', by: 'ChatGPT', glyph: '•••', bg: '#10A37F', fg: '#FFFFFF' },
  { name: 'Grok Bot', by: 'xAI', glyph: '✦', bg: '#F2F2F2', fg: '#000000' },
  { name: 'Muse', by: 'Meta', glyph: '∞', bg: '#0866FF', fg: '#FFFFFF' },
  { name: 'Hermes', by: 'open source', glyph: '☤', bg: '#7C3AED', fg: '#FFFFFF' },
  { name: 'OpenClaw', by: 'open source', glyph: '🦞', bg: '#2A0E0E', fg: '#FFFFFF' },
] as const;

export type Agent = (typeof AGENTS)[number];

export function AgentBadge({ agent, size = 44, showName = true }: { agent: Agent; size?: number; showName?: boolean }) {
  return (
    <View style={styles.badgeWrap}>
      <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: agent.bg }]}>
        <Text style={[styles.badgeGlyph, { color: agent.fg, fontSize: size * 0.42 }]}>{agent.glyph}</Text>
      </View>
      {showName ? <Text style={styles.badgeName} numberOfLines={1}>{agent.name}</Text> : null}
    </View>
  );
}

export interface DemoItem {
  id: string;
  emoji: string;
  merchant: string;
  amountCents: number;
  via: string;
}

/** Looks like a row in the import inbox. */
export function DemoInboxCard({ item, currencyCode, style }: { item: DemoItem; currencyCode: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.cardEmoji}>{item.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.merchant}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>via {item.via}</Text>
      </View>
      <Text style={styles.cardAmount}>{formatCents(item.amountCents, currencyCode)}</Text>
    </View>
  );
}

export const AnimatedView = Animated.View;

export const sceneStyles = StyleSheet.create({
  scene: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  stage: { width: '100%', maxWidth: 360, height: 260, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  kicker: { fontFamily: Fonts.demiBold, fontSize: 14, letterSpacing: 1.6, color: Colors.accent, textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' },
  title: { fontFamily: Fonts.heavy, fontSize: 40, lineHeight: 44, color: Colors.textPrimary, textAlign: 'center' },
  subtitle: { fontFamily: Fonts.medium, fontSize: 18, lineHeight: 25, color: Colors.textSecondary, textAlign: 'center', marginTop: 14, maxWidth: 340 },
  fine: { fontFamily: Fonts.medium, fontSize: 13, lineHeight: 18, color: Colors.textTertiary, textAlign: 'center', marginTop: 12, maxWidth: 320 },
});

const styles = StyleSheet.create({
  badgeWrap: { alignItems: 'center', gap: 6, width: 64 },
  badge: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  badgeGlyph: { fontFamily: Fonts.heavy, textAlign: 'center' },
  badgeName: { fontFamily: Fonts.demiBold, fontSize: 12, color: Colors.textSecondary },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', maxWidth: 330,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16,
    backgroundColor: '#161616', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  cardEmoji: { fontSize: 24 },
  cardTitle: { fontFamily: Fonts.demiBold, fontSize: 17, color: Colors.textPrimary },
  cardMeta: { fontFamily: Fonts.medium, fontSize: 13, color: Colors.textTertiary },
  cardAmount: { fontFamily: Fonts.heavy, fontSize: 20, color: Colors.textPrimary },
});
