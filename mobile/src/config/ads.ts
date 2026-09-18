/**
 * Ads are disabled unless a build explicitly opts in. This keeps closed-test
 * and unconfigured builds ad-free; set the public environment variable to
 * `true` for a monetized production build.
 */
export const ADS_ENABLED_FOR_BUILD =
  process.env.EXPO_PUBLIC_ADS_ENABLED === 'true';
