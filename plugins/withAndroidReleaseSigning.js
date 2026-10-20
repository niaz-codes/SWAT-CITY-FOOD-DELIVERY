const { withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');
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
  "            signingConfig rootProject.file('keystore.properties').exists()\n" +
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
          'changed - update the anchors in plugins/withAndroidReleaseSigning.js.',
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
          'plugins/withAndroidReleaseSigning.js.',
      );
    }

    src = src.replace(ANCHOR_SIGNING_CONFIGS, SIGNING_CONFIG_BLOCK);
    cfg.modResults.contents = src;
    return cfg;
  });

  // Ship a documented template next to the generated build file.
  config = withAppBuildGradle(config, (cfg) => {
    const examplePath = path.join(
      cfg.modRequest.platformProjectRoot,
      'keystore.properties.example',
    );
    if (!fs.existsSync(examplePath)) {
      fs.writeFileSync(examplePath, EXAMPLE);
    }
    return cfg;
  });

  // Regenerate keystore.properties + the keystore itself when they are missing.
  //
  // `expo prebuild --clean` deletes the whole android/ tree, including both
  // files, so a local release build after a prebuild would silently fall back
  // to the shared debug key (see build.gradle). EAS is unaffected - it reads
  // credentials.json locally and uploads the keystore with the build job - but
  // local builds need them on disk.
  //
  // credentials.json is gitignored and may legitimately be absent (fresh clone,
  // CI without the upload key), so this warns rather than throwing.
  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const projectRoot = cfg.modRequest.projectRoot;

      if (fs.existsSync(path.join(platformRoot, 'keystore.properties'))) {
        return cfg;
      }

      const credentialsPath = path.join(projectRoot, 'credentials.json');
      if (!fs.existsSync(credentialsPath)) {
        console.warn(
          '[withAndroidReleaseSigning] credentials.json not found - release ' +
            'builds will be signed with the debug key.',
        );
        return cfg;
      }

      let keystore;
      try {
        keystore = JSON.parse(fs.readFileSync(credentialsPath, 'utf8')).android?.keystore;
      } catch (error) {
        console.warn(
          `[withAndroidReleaseSigning] could not read credentials.json (${error.message}). ` +
            'Release builds will be signed with the debug key.',
        );
        return cfg;
      }

      if (!keystore?.keystorePath) {
        console.warn(
          '[withAndroidReleaseSigning] credentials.json has no android.keystore - ' +
            'release builds will be signed with the debug key.',
        );
        return cfg;
      }

      // build.gradle resolves storeFile relative to android/, and the path in
      // credentials.json is repo-relative ("android/app/release.keystore").
      const relativeStoreFile = keystore.keystorePath.replace(/^android[\\/]/, '');
      writeKeystoreProperties(
        path.join(platformRoot, 'keystore.properties'),
        relativeStoreFile,
        keystore,
      );

      // credentials.json holds only the passwords, so the keystore itself is
      // restored from the gitignored copy kept at the repo root (outside
      // android/, which --clean destroys).
      const keystoreTarget = path.resolve(platformRoot, relativeStoreFile);
      const keystoreSource = path.join(projectRoot, path.basename(relativeStoreFile));
      if (!fs.existsSync(keystoreTarget) && fs.existsSync(keystoreSource)) {
        fs.mkdirSync(path.dirname(keystoreTarget), { recursive: true });
        fs.copyFileSync(keystoreSource, keystoreTarget);
      }

      return cfg;
    },
  ]);

  return config;
};

/** Writes the Gradle-readable signing file. Values are never logged. */
function writeKeystoreProperties(targetPath, storeFile, keystore) {
  const body = [
    `storeFile=${storeFile}`,
    `storePassword=${keystore.keystorePassword ?? ''}`,
    `keyAlias=${keystore.keyAlias ?? ''}`,
    `keyPassword=${keystore.keyPassword ?? ''}`,
    '',
  ].join('\n');

  fs.writeFileSync(targetPath, body);
}
