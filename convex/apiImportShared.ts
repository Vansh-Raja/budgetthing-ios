const HASH_VERSION = 1;
const TOKEN_PREFIX = "bt_live";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function shortHash(input: string, length = 24): Promise<string> {
  const hex = await sha256Hex(input);
  return hex.slice(0, length);
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i += 1) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function createRawApiKey() {
  const keyId = randomHex(8);
  const secret = randomHex(24);
  return {
    keyId,
    rawKey: `${TOKEN_PREFIX}_${keyId}_${secret}`,
  };
}

export function parseRawApiKey(rawKey: string): { keyId: string } | null {
  const parts = rawKey.split("_");
  if (parts.length !== 4) return null;
  if (`${parts[0]}_${parts[1]}` !== TOKEN_PREFIX) return null;
  if (!/^[a-f0-9]{16}$/i.test(parts[2])) return null;
  if (!/^[a-f0-9]{48}$/i.test(parts[3])) return null;
  return { keyId: parts[2].toLowerCase() };
}

export async function hashApiKey(rawKey: string): Promise<string> {
  const pepper = process.env.IMPORT_API_KEY_PEPPER ?? "development-import-api-pepper-change-me";
  return sha256Hex(`v${HASH_VERSION}:${pepper}:${rawKey}`);
}

export function apiKeyHashVersion() {
  return HASH_VERSION;
}

export function compactExternalIdLabel(externalId: string): string {
  const trimmed = externalId.trim();
  if (trimmed.length <= 64) return trimmed;
  return `${trimmed.slice(0, 28)}...${trimmed.slice(-28)}`;
}

export function normalizeComparableText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
