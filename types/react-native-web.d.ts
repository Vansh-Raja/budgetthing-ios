// Minimal typing for the react-native-web escape hatch used by web-only components.
declare module 'react-native-web' {
  export function unstable_createElement(type: string, props?: Record<string, unknown>, ...children: unknown[]): JSX.Element;
}
