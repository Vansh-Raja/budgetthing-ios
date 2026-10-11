/**
 * Desktop browsers: full-screen React Native modals (transaction detail, pickers, editors)
 * would cover the whole wide window. This marks opaque full-screen dialogs with
 * `bt-sheet`, and the desktop CSS in +html.tsx frames them as a centred dialog over a
 * dimmed backdrop. Transparent modals (popups, overlays) draw their own card and are left
 * alone. Phones are unaffected (the CSS only applies to wide, pointer-driven windows).
 */
import { useEffect } from 'react';

function isOpaque(el: HTMLElement): boolean {
  const bg = getComputedStyle(el).backgroundColor;
  const m = /rgba?\(([^)]+)\)/.exec(bg);
  if (!m) return false;
  const parts = m[1].split(',').map((p) => p.trim());
  return parts.length < 4 || Number(parts[3]) > 0.5;
}

function mark() {
  document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]').forEach((d) => {
    // Re-checked on every change: a dialog's role/style can land after it is inserted.
    if (!d.classList.contains('bt-sheet') && isOpaque(d)) d.classList.add('bt-sheet');
  });
}

export function DesktopModalFrame() {
  useEffect(() => {
    mark();
    const mo = new MutationObserver(mark);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'role', 'class'] });
    return () => mo.disconnect();
  }, []);
  return null;
}
