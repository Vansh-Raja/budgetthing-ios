// Config plugin for local (non-EAS) Android builds. See docs/android-build.md.
//
// 1. Release signing with an upload keystore kept outside the repo, supplied through
//    Gradle properties (or ORG_GRADLE_PROJECT_* env vars):
//   BUDGETTHING_UPLOAD_STORE_FILE, BUDGETTHING_UPLOAD_KEY_ALIAS,
//   BUDGETTHING_UPLOAD_STORE_PASSWORD, BUDGETTHING_UPLOAD_KEY_PASSWORD
//    Without them, release builds fall back to the debug keystore (Expo's default).
// 2. BUDGETTHING_HERMESC: path to a hermesc binary. React Native only ships x86-64 Linux
//    hermesc, so arm64 Linux hosts build one from source.
// EAS builds set neither property, so they keep the defaults.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// budgetthing-release-signing';
const HERMES_MARKER = 'BUDGETTHING_HERMESC';

const SIGNING_CONFIG = `
        release { ${MARKER}
            if (project.hasProperty('BUDGETTHING_UPLOAD_STORE_FILE')) {
                storeFile file(BUDGETTHING_UPLOAD_STORE_FILE)
                storePassword BUDGETTHING_UPLOAD_STORE_PASSWORD
                keyAlias BUDGETTHING_UPLOAD_KEY_ALIAS
                keyPassword BUDGETTHING_UPLOAD_KEY_PASSWORD
            }
        }`;

function withAndroidLocalBuild(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;

    if (!gradle.includes(MARKER)) {
      // Add a release signing config next to the debug one.
      gradle = gradle.replace(/signingConfigs\s*\{/, (m) => `${m}${SIGNING_CONFIG}`);

      // Point the release build type at it when the keystore is configured.
      gradle = gradle.replace(
        /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
        `$1signingConfig project.hasProperty('BUDGETTHING_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`
      );
    }

    // Allow overriding hermesc.
    if (!gradle.includes(HERMES_MARKER)) gradle = gradle.replace(
      /^(\s*)hermesCommand = (.+)$/m,
      `$1hermesCommand = project.hasProperty('${HERMES_MARKER}') ? ${HERMES_MARKER} : $2`
    );

    if (!gradle.includes('signingConfigs.release : signingConfigs.debug') || !gradle.includes(HERMES_MARKER)) {
      throw new Error('[withAndroidLocalBuild] could not patch app/build.gradle; Expo template changed?');
    }
    cfg.modResults.contents = gradle;
    return cfg;
  });
}

module.exports = withAndroidLocalBuild;
