/**
 * Motion toolkit for onboarding, built on Reanimated (runs the same on web and native):
 * looping clocks, word-by-word titles, springy pressables, a progress bar, an ambient
 * glow background, confetti, and the directional page transition.
 */
import { Text } from '@/components/ui/LockedText';
import { Colors } from '@/constants/theme';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  Keyframe,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export const CYAN = '#3DE0F5';
export const SPRING = { damping: 16, stiffness: 180, mass: 0.9 };

/** A 0→1 clock that repeats every `durationMs`; holds at `restAt` with Reduce Motion. */
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

/** A 0→1 progress that plays once after `delayMs` (instantly complete with Reduce Motion). */
export function useOnce(durationMs: number, delayMs = 0): SharedValue<number> {
  const reduced = useReducedMotion();
  const t = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    t.value = withDelay(delayMs, withTiming(1, { duration: durationMs, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(t);
  }, [delayMs, durationMs, reduced, t]);
  return t;
}

/** Rises into place with a spring. */
export function Rise({ delay = 0, children, style }: { delay?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify().damping(15).stiffness(140)} style={style}>
      {children}
    </Animated.View>
  );
}

/** A title whose words spring up one after another. `\n` breaks lines. */
export function AnimatedWords({ text, style, delay = 0, stagger = 55, accentWords = [] }: { text: string; style: StyleProp<TextStyle>; delay?: number; stagger?: number; accentWords?: string[] }) {
  const lines = useMemo(() => text.split('\n').map((l) => l.split(' ').filter(Boolean)), [text]);
  let i = 0;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={text.replace(/\n/g, ' ')}>
      {lines.map((words, li) => (
        <View key={li} style={styles.line}>
          {words.map((w, wi) => {
            const d = delay + i++ * stagger;
            const accent = accentWords.includes(w.replace(/[.,!?]/g, ''));
            return (
              <Animated.View key={wi} entering={FadeInDown.delay(d).springify().damping(13).stiffness(150)}>
                <Text style={[style, accent && { color: Colors.accent }]}>{w}{wi < words.length - 1 ? ' ' : ''}</Text>
              </Animated.View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Pressable that squishes on press and springs back, with a light haptic. */
export function PressableScale({ children, style, onPress, haptic = true, disabled, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; haptic?: boolean; children: React.ReactNode }) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={() => { s.value = withSpring(0.95, SPRING); }}
      onPressOut={() => { s.value = withSpring(1, SPRING); }}
      onPress={(e) => {
        if (haptic) Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
    >
      <Animated.View style={[style, anim]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Thin progress bar that springs to `value` (0..1). */
export function ProgressBar({ value }: { value: number }) {
  const v = useSharedValue(value);
  useEffect(() => { v.value = withSpring(value, { damping: 20, stiffness: 120 }); }, [v, value]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.max(0.04, Math.min(1, v.value)) * 100}%` }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, fill]} />
    </View>
  );
}

/** One soft radial glow (a real gradient on web and native, no banding). */
function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function Glow({ size, color, strength }: { size: number; color: string; strength: number }) {
  const gradient = `radial-gradient(circle at center, ${hexA(color, strength)} 0%, ${hexA(color, strength * 0.45)} 32%, ${hexA(color, 0)} 70%)`;
  const style: any = Platform.OS === 'web' ? { backgroundImage: gradient } : { experimental_backgroundImage: gradient };
  return <View style={[{ width: size, height: size, borderRadius: size / 2 }, style]} pointerEvents="none" />;
}

const SCENES: Array<Array<{ x: number; y: number }>> = [
  [{ x: -0.35, y: -0.25 }, { x: 0.4, y: 0.1 }, { x: -0.1, y: 0.45 }],
  [{ x: 0.3, y: -0.3 }, { x: -0.4, y: 0.05 }, { x: 0.15, y: 0.4 }],
  [{ x: -0.2, y: -0.35 }, { x: 0.35, y: 0.3 }, { x: -0.4, y: 0.35 }],
  [{ x: 0.0, y: -0.2 }, { x: -0.35, y: 0.4 }, { x: 0.4, y: 0.35 }],
];

/**
 * One ambient glow. Uses Reanimated's CSS animations/transitions: on web these are real
 * CSS (compositor thread, no per-frame JS), so the glow never competes with typing or
 * layout animations. Only transforms are animated.
 */
function Blob({ index, scene, color, size, strength, still }: { index: number; scene: number; color: string; size: number; strength: number; still: boolean }) {
  const reduced = useReducedMotion();
  const target = SCENES[scene % SCENES.length][index];
  const drift: any = still || reduced ? {} : {
    animationName: {
      from: { transform: [{ translateX: -22 }, { translateY: -18 }] },
      to: { transform: [{ translateX: 22 }, { translateY: 18 }] },
    },
    animationDuration: `${11 + index * 3}s`,
    animationDelay: `${-index * 2}s`,
    animationIterationCount: 'infinite',
    animationDirection: 'alternate',
    animationTimingFunction: 'ease-in-out',
  };
  const place: any = {
    transform: [{ translateX: target.x * 420 }, { translateY: target.y * 620 }],
    transitionProperty: 'transform',
    transitionDuration: reduced ? '0s' : '1.6s',
    transitionTimingFunction: 'ease-in-out',
  };
  return (
    <Animated.View style={[styles.blob, { marginLeft: -size / 2, marginTop: -size / 2 }, place]} pointerEvents="none">
      <Animated.View style={drift}>
        <Glow size={size} color={color} strength={strength} />
      </Animated.View>
    </Animated.View>
  );
}

/** Ambient glows; `scene` re-arranges them per page, `still` stops the drift on form pages. */
export function Aurora({ scene, still = false }: { scene: number; still?: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Blob index={0} scene={scene} color={Colors.accent} size={560} strength={0.22} still={still} />
      <Blob index={1} scene={scene} color={CYAN} size={500} strength={0.16} still={still} />
      <Blob index={2} scene={scene} color="#FF3B6B" size={420} strength={0.12} still={still} />
    </View>
  );
}

const CONFETTI_COLORS = [Colors.accent, CYAN, '#34C759', '#FFD60A', '#FF375F', '#BF5AF2'];

function Particle({ t, seed }: { t: SharedValue<number>; seed: number }) {
  const p = useMemo(() => {
    const r = (n: number) => { const x = Math.sin(seed * 9301 + n * 49297) * 233280; return x - Math.floor(x); };
    const angle = -Math.PI / 2 + (r(1) - 0.5) * Math.PI * 1.1;
    const speed = 260 + r(2) * 320;
    return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: (r(3) - 0.5) * 900, color: CONFETTI_COLORS[Math.floor(r(4) * CONFETTI_COLORS.length)], w: 6 + r(5) * 6, h: 10 + r(6) * 8, round: r(7) > 0.7 };
  }, [seed]);
  const style = useAnimatedStyle(() => {
    const s = t.value * 1.6;
    return {
      opacity: interpolate(t.value, [0, 0.05, 0.75, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: p.vx * s },
        { translateY: p.vy * s + 520 * s * s },
        { rotate: `${p.spin * s}deg` },
      ],
    };
  });
  return <Animated.View style={[styles.particle, { width: p.w, height: p.round ? p.w : p.h, borderRadius: p.round ? p.w / 2 : 2, backgroundColor: p.color }, style]} />;
}

/** A one-shot confetti burst from the center; bump `burst` to fire again. */
export function Confetti({ burst, count = 42 }: { burst: number; count?: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!burst || reduced) return;
    t.value = 0;
    t.value = withTiming(1, { duration: 1900, easing: Easing.out(Easing.quad) });
  }, [burst, reduced, t]);
  if (!burst || reduced) return null;
  return (
    <View style={styles.confetti} pointerEvents="none">
      {Array.from({ length: count }, (_, i) => <Particle key={`${burst}-${i}`} t={t} seed={burst * 100 + i} />)}
    </View>
  );
}

/** Directional page transitions (forward slides in from the right; back from the left). */
export function pageEntering(direction: 1 | -1) {
  return new Keyframe({
    0: { opacity: 0, transform: [{ translateX: 46 * direction }, { scale: 0.98 }] },
    100: { opacity: 1, transform: [{ translateX: 0 }, { scale: 1 }], easing: Easing.out(Easing.cubic) },
  }).duration(420);
}

export function pageExiting(direction: 1 | -1) {
  return new Keyframe({
    0: { opacity: 1, transform: [{ translateX: 0 }, { scale: 1 }] },
    100: { opacity: 0, transform: [{ translateX: -36 * direction }, { scale: 0.98 }], easing: Easing.in(Easing.cubic) },
  }).duration(220);
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', flex: 1 },
  fill: { height: 4, borderRadius: 2, backgroundColor: Colors.accent },
  blob: { position: 'absolute', left: '50%', top: '42%' },
  confetti: { position: 'absolute', left: '50%', top: '38%', width: 0, height: 0 },
  particle: { position: 'absolute' },
});
