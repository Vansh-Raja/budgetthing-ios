/**
 * Web pager: horizontally paged ScrollView with CSS scroll snapping. Supports
 * swipe on touch devices and programmatic `setPage`, matching the native
 * PagerView contract used by the tab shell and trip detail screens.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { PagerHandle, PagerProps } from './Pager';

export type { PagerHandle, PagerPageSelectedEvent, PagerProps } from './Pager';

export const Pager = forwardRef<PagerHandle, PagerProps>(function PagerWeb(props, ref) {
  const { style, initialPage = 0, onPageSelected, scrollEnabled = true, children } = props;
  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [activePage, setActivePage] = useState(initialPage);
  const pageRef = useRef(initialPage);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pages = React.Children.toArray(children);

  const goTo = useCallback(
    (index: number, animated = true) => {
      const clamped = Math.max(0, Math.min(pages.length - 1, index));
      if (width > 0) scrollRef.current?.scrollTo({ x: clamped * width, y: 0, animated });
      if (pageRef.current !== clamped) {
        pageRef.current = clamped;
        setActivePage(clamped);
        onPageSelected?.({ nativeEvent: { position: clamped } });
      }
    },
    [pages.length, width, onPageSelected]
  );

  useImperativeHandle(ref, () => ({ setPage: (index: number) => goTo(index) }), [goTo]);

  // Keep the current page in place when the viewport resizes.
  useEffect(() => {
    if (width > 0) scrollRef.current?.scrollTo({ x: pageRef.current * width, y: 0, animated: false });
  }, [width]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const x = e.nativeEvent.contentOffset.x;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const index = Math.round(x / width);
      if (index !== pageRef.current) {
        pageRef.current = index;
        setActivePage(index);
        onPageSelected?.({ nativeEvent: { position: index } });
      }
    }, 80);
  };

  return (
    <View style={[styles.container, style]} onLayout={onLayout}>
      {width > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          scrollEnabled={scrollEnabled}
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentOffset={{ x: initialPage * width, y: 0 }}
          style={styles.scroll}
          // @ts-expect-error web-only CSS for snapping and momentum
          contentContainerStyle={{ scrollSnapType: 'x mandatory' }}
        >
          {pages.map((child, i) => (
            // @ts-expect-error web-only CSS snap alignment
            <View key={i} aria-hidden={i !== activePage} testID={i === activePage ? 'pager-page-active' : undefined} style={[styles.page, { width, scrollSnapAlign: 'start' }]}>
              {child}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  scroll: { flex: 1 },
  page: { height: '100%' },
});
