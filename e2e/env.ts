import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Load .env.local into process.env for browser tests (no dotenv dependency). */
export function loadLocalEnv() {
  const file = resolve(process.cwd(), '.env.local');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const [, key, raw] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^['"]|['"]$/g, '');
  }
  // @clerk/testing reads CLERK_PUBLISHABLE_KEY; the app uses the EXPO_PUBLIC_ name.
  if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    process.env.CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  }
}

export function hasClerkSecret() {
  return Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);
}
