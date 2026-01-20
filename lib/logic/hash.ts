// Lightweight deterministic hash for idempotency keys.
//
// We avoid depending on crypto APIs so this runs in Expo/Hermes.
// FNV-1a 64-bit with BigInt is fast and sufficiently collision-resistant
// for short-lived idempotency windows.

export function fnv1a64(input: string): bigint {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }

  return hash;
}

export function hashToBase36(hash: bigint): string {
  const normalized = hash < 0n ? -hash : hash;
  return normalized.toString(36);
}

export function hashStringToBase36(input: string): string {
  return hashToBase36(fnv1a64(input));
}
