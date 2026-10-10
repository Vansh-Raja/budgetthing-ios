/**
 * Native pager: thin wrapper over react-native-pager-view so screens can share
 * one import across platforms (Pager.web.tsx provides the browser version).
 */
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import PagerView from 'react-native-pager-view';

export type PagerHandle = { setPage: (index: number) => void };
export type PagerPageSelectedEvent = { nativeEvent: { position: number } };
export interface PagerProps {
  style?: StyleProp<ViewStyle>;
  initialPage?: number;
  onPageSelected?: (e: PagerPageSelectedEvent) => void;
  scrollEnabled?: boolean;
  overdrag?: boolean;
  children: React.ReactNode;
}

export const Pager = forwardRef<PagerHandle, PagerProps>(function Pager(props, ref) {
  const inner = useRef<PagerView>(null);
  useImperativeHandle(ref, () => ({ setPage: (index: number) => inner.current?.setPage(index) }), []);
  const { children, ...rest } = props;
  return (
    <PagerView ref={inner} {...rest}>
      {children}
    </PagerView>
  );
});
