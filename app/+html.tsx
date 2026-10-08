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
`;
