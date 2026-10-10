export type LocalDbOwner = string | 'guest';
// No local database on web; identity is always the signed-in Clerk user.
export async function getLocalDbOwner(): Promise<LocalDbOwner | null> { return null; }
export async function setLocalDbOwner(_owner: LocalDbOwner): Promise<void> {}
export async function clearLocalDbOwner(): Promise<void> {}
export function isOwnerCompatibleWithUser(_owner: LocalDbOwner | null, _userId: string): boolean { return true; }
