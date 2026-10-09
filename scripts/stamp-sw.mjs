#!/usr/bin/env node
/**
 * Stamp the exported service worker with a build id derived from the exported static
 * asset names (content-hashed by Metro). A new build therefore yields a byte-different
 * sw.js, which the browser installs as an update and the app surfaces as "Reload".
 *
 * Usage: node scripts/stamp-sw.mjs [distDir]
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const swPath = join(dist, 'sw.js');
if (!existsSync(swPath)) {
  console.error(`stamp-sw: ${swPath} not found (is public/sw.js exported?)`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(relative(dist, p));
  }
  return out;
}

const staticDir = join(dist, '_expo', 'static');
const files = existsSync(staticDir) ? walk(staticDir).sort() : [];
const buildId = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
const source = readFileSync(swPath, 'utf8');
if (!source.includes('__BUILD_ID__')) {
  console.log(`stamp-sw: already stamped (${swPath})`);
  process.exit(0);
}
writeFileSync(swPath, source.replace('__BUILD_ID__', buildId));
console.log(`stamp-sw: BUILD_ID=${buildId} (${files.length} static files)`);
