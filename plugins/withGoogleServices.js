const { withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Firebase / Google Services wiring for Android.
 *
 * `expo prebuild --clean` deletes `android/app/google-services.json` and does
 * not re-apply the `com.google.gms.google-services` Gradle plugin, both of
 * which the project had in its committed native project. Losing them means
 * `FirebaseApp.initializeApp()` returns null and FCM never issues a device
 * token.
 *
 * The two must move together: the Google Services Gradle plugin *hard-fails*
 * the build ("File google-services.json is missing") when the config file is
 * absent, so this plugin only applies it when the config will actually be
 * there. That keeps a fresh clone (no Firebase config) building cleanly while
 * a configured build keeps direct FCM working.
 *
 * The config's source of truth is `firebase/google-services.json` at the repo
 * root - deliberately *outside* `android/`, because everything under `android/`
 * is destroyed by `prebuild --clean`, so a file stored there cannot be used to
 * restore itself.
 */

const GOOGLE_SERVICES_PLUGIN = "apply plugin: 'com.google.gms.google-services'";

/** `apply plugin:` line the Expo template generates, used as an anchor. */
const ANCHOR = 'apply plugin: "com.facebook.react"';

/** Source of truth, kept outside android/ so --clean cannot delete it. */
const SOURCE = path.join('firebase', 'google-services.json');

function addGoogleServicesPlugin(src) {
  if (src.includes(GOOGLE_SERVICES_PLUGIN)) return src;

  if (!src.includes(ANCHOR)) {
    throw new Error(
      '[withGoogleServices] Could not find the generated `' +
        ANCHOR +
        '` line in android/app/build.gradle. The Expo template changed - ' +
        'update ANCHOR in plugins/withGoogleServices.js.',
    );
  }

  // Applied after com.android.application (which the anchor follows), so the
  // Google Services plugin's `googleServices` extension is registered first.
  return src.replace(ANCHOR, `${ANCHOR}\n${GOOGLE_SERVICES_PLUGIN}`);
}

module.exports = function withGoogleServices(config) {
  const projectRoot = config._internal?.projectRoot ?? process.cwd();
  const source = path.join(projectRoot, SOURCE);

  // Decide up front: no config file means the Gradle plugin must stay off.
  const hasConfig = fs.existsSync(source);

  if (hasConfig) {
    config = withAppBuildGradle(config, (cfg) => {
      cfg.modResults.contents = addGoogleServicesPlugin(cfg.modResults.contents);
      return cfg;
    });
  } else {
    console.warn(
      `[withGoogleServices] ${SOURCE} not found - leaving the Google Services ` +
        'Gradle plugin disabled. Push still works through the Expo Push ' +
        'Service; only direct FCM delivery is unavailable.',
    );
  }

  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      if (!hasConfig) return cfg;

      const root = cfg.modRequest.projectRoot;
      const from = path.join(root, SOURCE);
      const to = path.join(cfg.modRequest.platformProjectRoot, 'app', 'google-services.json');

      if (!fs.existsSync(from)) return cfg;
      fs.copyFileSync(from, to);
      return cfg;
    },
  ]);

  return config;
};

/** Expo calls plugins with the config object; `_internal.projectRoot` is the app root. */
module.exports.SOURCE = SOURCE;
