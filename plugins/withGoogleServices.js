const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Removes the stale Google Services Gradle plugin from the generated Android
 * project.
 *
 * The project's SDK 57 native project applied
 * `com.google.gms.google-services` (with a matching `classpath` in the root
 * build.gradle), left over from an earlier plan to deliver push directly
 * through FCM. That plan is gone: there is no Firebase SDK in package.json and
 * nothing in `src/` or the native sources touches `FirebaseApp` /
 * `FirebaseMessaging`. Push now goes through `expo-notifications`, i.e. the
 * Expo Push Service, which needs no google-services.json and no Google
 * Services plugin.
 *
 * Leaving the line in is not harmless: `expo prebuild` regenerates the root
 * build.gradle *without* the `com.google.gms:google-services` classpath, so the
 * `apply plugin` line fails to resolve and the whole Gradle build dies with
 *
 *     Plugin with id 'com.google.gms.google-services' not found.
 *
 * Doing this in a plugin rather than by hand means the line cannot come back on
 * the next prebuild. If direct FCM delivery is ever wanted, the correct move is
 * to add `@react-native-firebase/app` (which brings its own plugin wiring and
 * config plugin) instead of re-adding this line alone.
 */

const STALE_PLUGIN = /apply plugin:\s*['"]com\.google\.gms\.google-services['"]\s*\n?/g;

module.exports = function withGoogleServices(config) {
  return withAppBuildGradle(config, (cfg) => {
    const before = cfg.modResults.contents;
    const after = before.replace(STALE_PLUGIN, '');

    if (after !== before) {
      console.log(
        '[withGoogleServices] removed the stale com.google.gms.google-services ' +
          'plugin application (push goes through the Expo Push Service)',
      );
    }

    cfg.modResults.contents = after;
    return cfg;
  });
};
