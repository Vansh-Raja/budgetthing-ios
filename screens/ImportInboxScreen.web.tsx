import { WebPlaceholderScreen } from '@/components/web/WebPlaceholderScreen';

// Web placeholder: the native screen still depends on SQLite. Ported in Phase 6.
export default function ImportInboxScreen(_props: any) {
  return <WebPlaceholderScreen title="Import inbox" phase="Phase 6" />;
}
