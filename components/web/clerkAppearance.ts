/** Clerk prebuilt-UI appearance matching BudgetThing's dark, orange-accent language. */
export const clerkAppearance = {
  variables: {
    colorPrimary: '#FF9500',
    colorBackground: '#0A0A0A',
    colorInputBackground: '#141414',
    colorInputText: '#FFFFFF',
    colorText: '#FFFFFF',
    colorTextSecondary: 'rgba(255,255,255,0.7)',
    colorNeutral: '#FFFFFF',
    colorDanger: '#FF3B30',
    borderRadius: '12px',
    fontFamily: '"Avenir Next Condensed", "Avenir Next", -apple-system, system-ui, sans-serif',
  },
  elements: {
    card: { boxShadow: 'none', border: '1px solid rgba(255,255,255,0.12)' },
    footer: { background: 'transparent' },
  },
} as const;
