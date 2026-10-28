// Native: re-export the community picker so screens share one import with the web version.
export { default } from '@react-native-community/datetimepicker';
export type { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

/**
 * Android shows dates and times in system dialogs, not inline, and has no combined
 * 'datetime' mode: pick the date, then the time. Keeps the time when only the date
 * changes (and vice versa).
 */
export function openAndroidDateTimePicker(
  value: Date,
  mode: 'date' | 'time' | 'datetime',
  onPick: (date: Date) => void
) {
  const pickTime = (base: Date) =>
    DateTimePickerAndroid.open({
      value: base,
      mode: 'time',
      onChange: (event, picked) => {
        if (event.type === 'set' && picked) onPick(picked);
        else if (mode === 'datetime') onPick(base); // keep the new date if the time dialog is cancelled
      },
    });

  if (mode === 'time') {
    pickTime(value);
    return;
  }
  DateTimePickerAndroid.open({
    value,
    mode: 'date',
    onChange: (event, picked) => {
      if (event.type !== 'set' || !picked) return;
      const next = new Date(picked);
      next.setHours(value.getHours(), value.getMinutes(), value.getSeconds(), value.getMilliseconds());
      if (mode === 'datetime') pickTime(next);
      else onPick(next);
    },
  });
}
