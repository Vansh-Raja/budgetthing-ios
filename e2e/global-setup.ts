import { clerkSetup } from '@clerk/testing/playwright';
import { hasClerkSecret, loadLocalEnv } from './env';

/**
 * When a Clerk secret key is available locally, obtain a Testing Token so the
 * sign-up flow can bypass bot protection. Without it, authenticated tests skip.
 */
export default async function globalSetup() {
  loadLocalEnv();
  if (hasClerkSecret()) {
    await clerkSetup();
    console.log('[e2e] Clerk testing token configured (bot protection bypass enabled).');
  } else {
    console.log('[e2e] No CLERK_SECRET_KEY: authenticated tests will skip unless the test users already exist.');
  }
}
