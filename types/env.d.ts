/// <reference types="expo/types" />

/**
 * EXPO_PUBLIC_* variables are inlined into the JS bundle at build time by Expo's
 * Metro transformer, so they must be referenced as static `process.env.X`
 * expressions - destructuring or dynamic access will not pick them up.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * Base URL of the Swat City backend, including the `/api` prefix.
     * e.g. https://api.swatcity.pk/api
     */
    EXPO_PUBLIC_API_URL?: string;

    /**
     * Escape hatch that re-enables the bundled demo/fallback data.
     *
     * Leave unset in release builds: demo fallbacks are meant for UI work and
     * silently hide backend failures in production if enabled.
     */
    EXPO_PUBLIC_ALLOW_DEMO_DATA?: 'true' | 'false';
  }
}
