type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export function stableStringify(value: JsonValue): string {
  if (value === null) return 'null';

  const t = typeof value;
  if (t === 'string') return JSON.stringify(value);
  if (t === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (t === 'boolean') return value ? 'true' : 'false';

  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }

  const obj = value as Record<string, JsonValue>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    // JSON omits undefined; treat it as null for stability.
    const normalized = (v === undefined ? null : v) as JsonValue;
    parts.push(`${JSON.stringify(k)}:${stableStringify(normalized)}`);
  }
  return `{${parts.join(',')}}`;
}
