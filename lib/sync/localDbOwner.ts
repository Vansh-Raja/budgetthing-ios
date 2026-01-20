import * as SecureStore from 'expo-secure-store';

const LOCAL_DB_OWNER_KEY = 'local.db_owner';

export type LocalDbOwner = 'guest' | string;

export async function getLocalDbOwner(): Promise<LocalDbOwner | null> {
  const value = await SecureStore.getItemAsync(LOCAL_DB_OWNER_KEY);
  return value ? (value as LocalDbOwner) : null;
}

export async function setLocalDbOwner(owner: LocalDbOwner): Promise<void> {
  await SecureStore.setItemAsync(LOCAL_DB_OWNER_KEY, owner);
}

export async function clearLocalDbOwner(): Promise<void> {
  await SecureStore.deleteItemAsync(LOCAL_DB_OWNER_KEY);
}

export function isOwnerCompatibleWithUser(owner: LocalDbOwner | null, userId: string): boolean {
  if (!owner) return true;
  if (owner === 'guest') return true;
  return owner === userId;
}
