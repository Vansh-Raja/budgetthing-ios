/**
 * The current local day (YYYY-M-D), updated when the date changes. Put it in memo deps
 * for anything windowed by "today", "this month" or a billing cycle, so a window left
 * open across midnight recomputes.
 */
import { useEffect, useState } from 'react';

const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export function useDayKey(): string {
  const [key, setKey] = useState(() => keyOf(new Date()));
  useEffect(() => {
    const id = setInterval(() => {
      const k = keyOf(new Date());
      setKey((prev) => (prev === k ? prev : k));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return key;
}
