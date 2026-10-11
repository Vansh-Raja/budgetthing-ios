/**
 * Shared onboarding pieces: the AI-agent badges, the demo inbox card, and page styles.
 */
import { Text } from '@/components/ui/LockedText';
import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { Colors, Fonts } from '@/constants/theme';
import { formatCents } from '@/lib/logic/currencyUtils';

export { useLoop, useOnce } from './motion';

/** Personal AI agents shown as examples, with their own logos ("works with" use). */
export const AGENTS = [
  { name: 'Dots', by: 'ChatGPT', logo: require('../../assets/images/agents/chatgpt.png') },
  { name: 'Grok Bot', by: 'xAI', logo: require('../../assets/images/agents/grok.png') },
  { name: 'Muse', by: 'Meta', logo: require('../../assets/images/agents/meta.png') },
  { name: 'Hermes', by: 'Nous Research', logo: require('../../assets/images/agents/hermes.png') },
  { name: 'OpenClaw', by: 'open source', logo: require('../../assets/images/agents/openclaw.png') },
] as const;

export type Agent = (typeof AGENTS)[number];

export function AgentBadge({ agent, size = 44, showName = true }: { agent: Agent; size?: number; showName?: boolean }) {
  return (
    <View style={styles.badgeWrap} accessible accessibilityLabel={`${agent.name} by ${agent.by}`}>
      <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}>
        <Image source={agent.logo} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
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
export function DemoInboxCard({ item, currencyCode, style, badge }: { item: DemoItem; currencyCode: string; style?: StyleProp<ViewStyle>; badge?: React.ReactNode }) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardEmojiWrap}><Text style={styles.cardEmoji}>{item.emoji}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.merchant}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>via {item.via}</Text>
      </View>
      <Text style={styles.cardAmount}>{formatCents(item.amountCents, currencyCode)}</Text>
      {badge}
    </View>
  );
}

export const AnimatedView = Animated.View;

export const sceneStyles = StyleSheet.create({
  scene: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26 },
  stage: { width: '100%', maxWidth: 360, height: 270, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  kicker: { fontFamily: Fonts.demiBold, fontSize: 13, letterSpacing: 2, color: Colors.accent, textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' },
  title: { fontFamily: Fonts.heavy, fontSize: 42, lineHeight: 46, color: Colors.textPrimary, textAlign: 'center' },
  subtitle: { fontFamily: Fonts.medium, fontSize: 18, lineHeight: 25, color: Colors.textSecondary, textAlign: 'center', marginTop: 14, maxWidth: 340 },
  fine: { fontFamily: Fonts.medium, fontSize: 13, lineHeight: 18, color: Colors.textTertiary, textAlign: 'center', marginTop: 12, maxWidth: 320 },
});

const styles = StyleSheet.create({
  badgeWrap: { alignItems: 'center', gap: 6, width: 64 },
  badge: { overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: '#111' },
  badgeName: { fontFamily: Fonts.demiBold, fontSize: 12, color: Colors.textSecondary },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', maxWidth: 330,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18,
    backgroundColor: 'rgba(28,28,30,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  cardEmojiWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  cardEmoji: { fontSize: 22 },
  cardTitle: { fontFamily: Fonts.demiBold, fontSize: 17, color: Colors.textPrimary },
  cardMeta: { fontFamily: Fonts.medium, fontSize: 13, color: Colors.textTertiary },
  cardAmount: { fontFamily: Fonts.heavy, fontSize: 20, color: Colors.textPrimary },
});
