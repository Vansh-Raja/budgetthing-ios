// Metro config: enforces the web (PWA) runtime boundary.
//
// The web build is online-only and must never bundle the native local-first
// stack. If any module below is resolved for platform "web", the bundle fails
// with a clear message instead of silently shipping SQLite/sync code.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const projectRoot = __dirname;
const WEB_FORBIDDEN_PROJECT_DIRS = ['lib/db/', 'lib/sync/'];
// Explicit web adapters (Convex-backed) and pure helpers are the only files allowed from those dirs on web.
const WEB_ALLOWED_PROJECT_FILES = [/\.web\.[jt]sx?$/, /^lib\/sync\/sharedTripDerivedIds\.ts$/];
const WEB_FORBIDDEN_PACKAGES = [
  'expo-sqlite',
  'react-native-pager-view',
  '@react-native-community/datetimepicker',
];
// Only forbidden when imported from project code (Clerk imports it internally on web, harmlessly).
const WEB_FORBIDDEN_FROM_PROJECT = ['expo-secure-store'];

function isProjectFile(filePath) {
  return filePath.startsWith(projectRoot) && !filePath.includes(`${path.sep}node_modules${path.sep}`);
}

const baseResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolved = baseResolveRequest
    ? baseResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);

  if (platform !== 'web' || resolved.type !== 'sourceFile') return resolved;

  const target = resolved.filePath;
  const origin = context.originModulePath || '';
  const rel = path.relative(projectRoot, target).split(path.sep).join('/');

  const allowedProjectFile = WEB_ALLOWED_PROJECT_FILES.some((re) => re.test(rel));
  const hitsProjectDir = isProjectFile(target) && !allowedProjectFile && WEB_FORBIDDEN_PROJECT_DIRS.some((d) => rel.startsWith(d));
  const hitsPackage = WEB_FORBIDDEN_PACKAGES.some((p) => moduleName === p || moduleName.startsWith(`${p}/`));
  const hitsProjectOnlyPackage =
    isProjectFile(origin) && WEB_FORBIDDEN_FROM_PROJECT.some((p) => moduleName === p || moduleName.startsWith(`${p}/`));

  if (hitsProjectDir || hitsPackage || hitsProjectOnlyPackage) {
    throw new Error(
      `[web-boundary] "${moduleName}" (${rel}) must not be imported on web.\n` +
        `  imported from: ${path.relative(projectRoot, origin)}\n` +
        `  Use a .web.ts(x) adapter. The PWA is online-only and never bundles SQLite, sync, or native-only UI.`
    );
  }

  return resolved;
};

module.exports = config;
