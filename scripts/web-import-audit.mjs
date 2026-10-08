#!/usr/bin/env node
/**
 * Web import-graph audit.
 *
 * Reads the source maps produced by `npx expo export --platform web` and fails
 * if any forbidden native/local-first module made it into the web bundle.
 * Complements the Metro resolver guard in metro.config.js with a reviewable report.
 *
 * Usage: node scripts/web-import-audit.mjs [distDir]
 */
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const distDir = resolve(process.argv[2] ?? 'dist');
const root = resolve('.');

const FORBIDDEN = [
  { label: 'SQLite layer', test: (s) => /(^|\/)lib\/db\//.test(s) && !/\.web\.[jt]sx?$/.test(s) },
  { label: 'Sync engine', test: (s) => /(^|\/)lib\/sync\//.test(s) && !/\.web\.[jt]sx?$/.test(s) && !/sharedTripDerivedIds\.ts$/.test(s) },
  { label: 'expo-sqlite', test: (s) => /node_modules\/expo-sqlite\//.test(s) },
  { label: 'expo-secure-store (project import)', test: (s) => /(^|\/)lib\/auth\/tokenCache\.ts$|(^|\/)lib\/ui\/transactionFiltersStorage\.ts$/.test(s) },
  { label: 'react-native-pager-view', test: (s) => /node_modules\/react-native-pager-view\//.test(s) },
  { label: 'native date picker', test: (s) => /node_modules\/@react-native-community\/datetimepicker\//.test(s) },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js.map')) out.push(p);
  }
  return out;
}

let maps;
try {
  maps = walk(join(distDir, '_expo'));
} catch (e) {
  console.error(`No export found under ${distDir}. Run: npx expo export --platform web`);
  process.exit(2);
}
if (maps.length === 0) {
  console.error('No .js.map files found. Ensure source maps are emitted (default for expo export).');
  process.exit(2);
}

const sources = new Set();
for (const m of maps) {
  const json = JSON.parse(readFileSync(m, 'utf8'));
  for (const s of json.sources ?? []) sources.add(s.replace(/^.*?\/budgetthing[^/]*\//, ''));
}

const sorted = [...sources].sort();
const violations = [];
for (const rule of FORBIDDEN) {
  const hits = sorted.filter(rule.test);
  if (hits.length) violations.push({ rule: rule.label, hits });
}

const projectSources = sorted.filter((s) => !s.includes('node_modules/'));
mkdirSync(join(distDir, '..', 'reports'), { recursive: true });
const reportPath = join(distDir, '..', 'reports', 'web-import-audit.json');
writeFileSync(
  reportPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), bundles: maps.map((m) => relative(root, m)), projectSources, violations }, null, 2)
);

console.log(`Web bundle modules: ${sorted.length} (project: ${projectSources.length}); report: ${relative(root, reportPath)}`);
console.log('Project modules in web bundle:');
for (const s of projectSources) console.log('  ' + s);

if (violations.length) {
  console.error('\nFORBIDDEN modules found in web bundle:');
  for (const v of violations) {
    console.error(`  [${v.rule}]`);
    for (const h of v.hits) console.error('    ' + h);
  }
  process.exit(1);
}
console.log('\nOK: no SQLite, sync, SecureStore, pager, or native date-picker modules in the web bundle.');
