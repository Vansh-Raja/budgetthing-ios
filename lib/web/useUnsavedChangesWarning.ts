import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Warn before a browser reload/close while a server-backed form has unsaved
 * edits. Drafts are never cached; the warning is the only protection.
 */
export function useUnsavedChangesWarning(isDirty: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}
