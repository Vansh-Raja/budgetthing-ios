/**
 * Web date/time picker: a styled native <input> (date | time | datetime-local)
 * exposing the community picker's props subset the app uses.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { unstable_createElement } from 'react-native-web';
import { Colors, Fonts } from '@/constants/theme';

export type DateTimePickerEvent = { type: 'set' | 'dismissed'; nativeEvent: { timestamp?: number } };

interface Props {
  value: Date;
  mode?: 'date' | 'time' | 'datetime';
  display?: string;
  onChange?: (event: DateTimePickerEvent, date?: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  style?: StyleProp<ViewStyle>;
  textColor?: string;
  themeVariant?: string;
  accentColor?: string;
  disabled?: boolean;
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function toInputValue(d: Date, mode: Props['mode']) {
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (mode === 'time') return time;
  if (mode === 'datetime') return `${date}T${time}`;
  return date;
}
function fromInputValue(value: string, mode: Props['mode'], base: Date): Date | null {
  if (!value) return null;
  const next = new Date(base.getTime());
  if (mode === 'time') {
    const [h, m] = value.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    next.setHours(h, m, 0, 0);
    return next;
  }
  const [datePart, timePart] = value.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  if ([y, mo, d].some((n) => Number.isNaN(n))) return null;
  next.setFullYear(y, mo - 1, d);
  if (mode === 'datetime' && timePart) {
    const [h, m] = timePart.split(':').map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m)) next.setHours(h, m, 0, 0);
  }
  return next;
}

export default function DateTimePicker({ value, mode = 'date', onChange, minimumDate, maximumDate, style, disabled }: Props) {
  const type = mode === 'time' ? 'time' : mode === 'datetime' ? 'datetime-local' : 'date';
  const input = unstable_createElement('input', {
    type,
    value: toInputValue(value, mode),
    min: minimumDate ? toInputValue(minimumDate, mode) : undefined,
    max: maximumDate ? toInputValue(maximumDate, mode) : undefined,
    disabled,
    'data-testid': `date-input-${mode}`,
    onChange: (e: any) => {
      const next = fromInputValue(e.target.value, mode, value);
      if (!next) return;
      onChange?.({ type: 'set', nativeEvent: { timestamp: next.getTime() } }, next);
    },
    style: {
      colorScheme: 'dark',
      backgroundColor: '#141414',
      color: Colors.textPrimary,
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 12,
      padding: '10px 12px',
      fontFamily: Fonts.demiBold,
      fontSize: 16,
      minHeight: 44,
      width: '100%',
      // Padding + border must stay inside the 100% width, or the input overflows its sheet.
      boxSizing: 'border-box',
      outline: 'none',
    },
  });
  return <View style={[styles.wrap, style]}>{input}</View>;
}

const styles = StyleSheet.create({ wrap: { alignSelf: 'stretch' } });
