/**
 * Web token cache.
 *
 * On web, @clerk/clerk-expo delegates to @clerk/clerk-react which manages the
 * session in browser storage/cookies itself; `tokenCache` is ignored.
 * This adapter exists so nothing on web ever resolves expo-secure-store.
 */
export const tokenCache = {
  async getToken(_key: string): Promise<string | null> {
    return null;
  },
  async saveToken(_key: string, _value: string): Promise<void> {
    return;
  },
};
