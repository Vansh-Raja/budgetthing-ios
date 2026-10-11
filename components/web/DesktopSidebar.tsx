/**
 * Desktop browser navigation: a persistent left sidebar that replaces the mobile
 * floating tab pill. Tabs, the import inbox (with its pending count), history,
 * and the keyboard shortcuts that make the calculator fast on a real keyboard.
 */
import { Text } from '@/components/ui/LockedText';
import { Colors, Fonts, Tabs } from '@/constants/theme';
import { ImportInboxRepository } from '@/lib/db/repositories';
import { Events, GlobalEvents } from '@/lib/events';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

const LOGO = require('../../assets/images/onboarding-logo.png');

const ICONS: Record<number, keyof typeof Ionicons.glyphMap> = {
  0: 'calculator-outline',
  1: 'list-outline',
  2: 'wallet-outline',
  4: 'airplane-outline',
  3: 'settings-outline',
};

function NavItem({ icon, label, active, hint, badge, onPress, testID, role = 'tab', controls }: { icon: keyof typeof Ionicons.glyphMap; label: string; active?: boolean; hint?: string; badge?: number; onPress: () => void; testID?: string; role?: 'tab' | 'button'; controls?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === 'tab' ? { selected: !!active } : undefined}
      aria-selected={role === 'tab' ? !!active : undefined}
      {...({ 'aria-controls': controls } as any)}
      testID={testID}
      style={(state: any) => [styles.item, active && styles.itemActive, !active && state.hovered && styles.itemHover]}
    >
      <Ionicons name={icon} size={19} color={active ? Colors.accent : Colors.textSecondary} />
      <Text style={[styles.itemText, active && styles.itemTextActive]} numberOfLines={1}>{label}</Text>
      {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text></View> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </Pressable>
  );
}

export function DesktopSidebar({ selectedIndex, onSelectIndex }: { selectedIndex: number; onSelectIndex: (index: number) => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => { ImportInboxRepository.countPending().then((n) => { if (alive) setPending(n); }).catch(() => {}); };
    load();
    const off = GlobalEvents.on(Events.importInboxChanged, load);
    return () => { alive = false; off(); };
  }, []);

  return (
    <View style={styles.sidebar} testID="desktop-sidebar">
      <View style={styles.brand}>
        <Image source={LOGO} style={styles.logo} accessibilityIgnoresInvertColors />
        <Text style={styles.brandText}>BudgetThing</Text>
      </View>

      <Pressable
        onPress={() => onSelectIndex(0)}
        accessibilityRole="button"
        accessibilityLabel="New expense"
        style={(state: any) => [styles.cta, state.hovered && styles.ctaHover]}
      >
        <Ionicons name="add" size={20} color="#000" />
        <Text style={styles.ctaText}>New expense</Text>
      </Pressable>

      <View style={styles.nav} accessibilityRole="tablist">
        {Tabs.map((tab, index) => (
          <NavItem
            key={tab.key}
            icon={ICONS[tab.key]}
            label={tab.label}
            active={selectedIndex === index}
            hint={`⌥${index + 1}`}
            onPress={() => onSelectIndex(index)}
            testID={`desktop-nav-${index}`}
            controls={`desktop-panel-${index}`}
          />
        ))}
      </View>

      <Text style={styles.section}>Review</Text>
      <View style={styles.nav}>
        <NavItem role="button" icon="file-tray-full-outline" label="Import inbox" badge={pending} onPress={() => router.push('/import-inbox')} />
        <NavItem role="button" icon="time-outline" label="History & undo" onPress={() => router.push('/settings/history')} />
      </View>

      <View style={{ flex: 1 }} />

      <Text style={styles.footer}>Type to log · Enter saves</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { width: 248, paddingHorizontal: 14, paddingTop: 20, paddingBottom: 16, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.08)', backgroundColor: '#050505' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, marginBottom: 20 },
  logo: { width: 30, height: 30, borderRadius: 8 },
  brandText: { fontFamily: Fonts.heavy, fontSize: 22, color: Colors.textPrimary },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: 12, backgroundColor: Colors.accent, marginBottom: 18 },
  ctaHover: { backgroundColor: '#FFA526' },
  ctaText: { fontFamily: Fonts.heavy, fontSize: 17, color: '#000' },
  nav: { gap: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 40, paddingHorizontal: 10, borderRadius: 10 },
  itemHover: { backgroundColor: 'rgba(255,255,255,0.06)' },
  itemActive: { backgroundColor: 'rgba(255,149,0,0.12)' },
  itemText: { flex: 1, fontFamily: Fonts.demiBold, fontSize: 16, color: Colors.textSecondary },
  itemTextActive: { color: Colors.textPrimary },
  hint: { fontFamily: Fonts.medium, fontSize: 12, color: Colors.textMuted },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: Fonts.heavy, fontSize: 12, color: '#000' },
  section: { fontFamily: Fonts.demiBold, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: Colors.textMuted, marginTop: 22, marginBottom: 6, paddingHorizontal: 10 },
  footer: { fontFamily: Fonts.medium, fontSize: 13, color: Colors.textMuted, paddingHorizontal: 10 },
});
