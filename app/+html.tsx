import { ScrollViewStyleReset } from 'expo-router/html';

// Web-only root HTML. Runs in Node during static rendering; no DOM access here.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no"
        />
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#000000" />
        <title>BudgetThing</title>

        {/* Installable PWA: manifest + iOS home-screen metadata. */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="BudgetThing" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="application-name" content="BudgetThing" />

        {/* Disable body scrolling so ScrollView behaves like native. */}
        <ScrollViewStyleReset />

        {/* BudgetThing is a dark-only product: never flash a white body. */}
        <style dangerouslySetInnerHTML={{ __html: baseStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const baseStyles = `
html, body { background-color: #000; color: #fff; }
body { overscroll-behavior-y: none; -webkit-tap-highlight-color: transparent; }
#root { min-height: 100dvh; }
input, textarea, button, [role="button"] { outline: none; }
input:focus-visible, textarea:focus-visible, [role="button"]:focus-visible, [role="tab"]:focus-visible { outline: 2px solid #FF9500; outline-offset: 2px; }
input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.3); }
::selection { background: rgba(255,149,0,0.35); color: #fff; }
/* Desktop: pointer feedback and quiet, dark scrollbars. */
@media (hover: hover) and (pointer: fine) {
  [role="button"], [role="tab"], [role="link"], [role="switch"] { cursor: pointer; }
  * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.18) transparent; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.16); border-radius: 8px; border: 2px solid #000; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.28); }
  ::-webkit-scrollbar-track { background: transparent; }
  /* Hover/press tint for anything clickable, layered over its own background. */
  div[tabindex="0"]:hover, [role="button"]:hover, [role="tab"]:hover { box-shadow: inset 0 0 0 999px rgba(255,255,255,0.045); }
  div[tabindex="0"]:active, [role="button"]:active, [role="tab"]:active { box-shadow: inset 0 0 0 999px rgba(255,255,255,0.09); }
}
/* Desktop: full-screen modals become a centred dialog (see DesktopModalFrame). */
@media (min-width: 1024px) and (hover: hover) and (pointer: fine) {
  .bt-sheet { background-color: rgba(0,0,0,0.62) !important; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; }
  .bt-sheet > div { flex: 0 0 auto !important; width: min(760px, calc(100vw - 64px)); height: min(900px, calc(100dvh - 64px)); border-radius: 22px; overflow: hidden; background: #000; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 30px 90px rgba(0,0,0,0.7); }
}
`;
