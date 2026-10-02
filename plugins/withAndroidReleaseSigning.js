const { withAppBuildGradle } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Release signing for Android.
 *
 * `expo prebuild` generates android/app/build.gradle with
 *
 *     release {
 *       // Caution! In production, you need to generate your own keystore file.
 *       signingConfig signingConfigs.debug
 *
 * so any release build is signed with the shared `debug.keystore` that ships in
 * the repository. Play Store rejects that, and a key everyone already has is
 * not a signing key at all.
 *
 * This plugin rewrites the generated file to read the upload keystore from
 * `android/keystore.properties` (gitignored, never committed). When that file
 * is absent it deliberately keeps the debug key so `expo run:android --variant
 * release` still works on a fresh clone.
 */

const SIGNING_CONFIG_BLOCK = `    signingConfigs {
        release {
            // Injected by plugins/withAndroidReleaseSigning.js.
            // Reads android/keystore.properties so upload credentials stay out
            // of the committed build file. Falls back to the debug key when the
            // file is absent, which keeps local release runs working.
            if (rootProject.file('keystore.properties').exists()) {
                def swatCityKeystore = new Properties()
                swatCityKeystore.load(new FileInputStream(rootProject.file('keystore.properties')))
                storeFile rootProject.file(swatCityKeystore['storeFile'])
                storePassword swatCityKeystore['storePassword']
                keyAlias swatCityKeystore['keyAlias']
                keyPassword swatCityKeystore['keyPassword']
            }
        }
        debug {`;

const ANCHOR_SIGNING_CONFIGS = '    signingConfigs {\n        debug {';

// The `release` block is the only one preceded by this caution comment, so this
// anchor is unambiguous (the debug build type has an identical
// `signingConfig signingConfigs.debug` line).
const ANCHOR_RELEASE_SIGNING =
  '// see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug';

const REPLACEMENT_RELEASE_SIGNING =
  '// Upload signing comes from android/keystore.properties when present.\n' +
  '            signingConfig rootProject.file(\'keystore.properties\').exists()\n' +
  '                ? signingConfigs.release\n' +
  '                : signingConfigs.debug';

const EXAMPLE = `# Android release signing - COPY THIS FILE to keystore.properties and fill it in.
#
#   keytool -genkeypair -v -keystore swatcity-upload.keystore -alias swatcity \\
#     -keyalg RSA -keysize 2048 -validity 10000
#
# keystore.properties is gitignored. Never commit real credentials.
#
# storeFile is resolved relative to the android/ directory.

storeFile=swatcity-upload.keystore
storePassword=CHANGE_ME
keyAlias=swatcity
keyPassword=CHANGE_ME
`;

module.exports = function withAndroidReleaseSigning(config) {
  config = withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;

    if (!src.includes(ANCHOR_RELEASE_SIGNING)) {
      throw new Error(
        '[withAndroidReleaseSigning] Could not find the generated release ' +
          'signingConfig block in android/app/build.gradle. The Expo template ' +
          'changed - update the anchors in plugins/withAndroidReleaseSigning.js.'
      );
    }

    if (src.includes('withAndroidReleaseSigning.js')) {
      return cfg; // already applied
    }

    src = src.replace(ANCHOR_RELEASE_SIGNING, REPLACEMENT_RELEASE_SIGNING);

    if (!src.includes(ANCHOR_SIGNING_CONFIGS)) {
      throw new Error(
        '[withAndroidReleaseSigning] Could not find the generated signingConfigs ' +
          'block in android/app/build.gradle. Update the anchors in ' +
          'plugins/withAndroidReleaseSigning.js.'
      );
    }

    src = src.replace(ANCHOR_SIGNING_CONFIGS, SIGNING_CONFIG_BLOCK);
    cfg.modResults.contents = src;
    return cfg;
  });

  // Ship a documented template next to the generated build file.
  config = withAppBuildGradle(config, (cfg) => {
    const examplePath = path.join(cfg.modRequest.platformProjectRoot, 'keystore.properties.example');
    if (!fs.existsSync(examplePath)) {
      fs.writeFileSync(examplePath, EXAMPLE);
    }
    return cfg;
  });

  return config;
};