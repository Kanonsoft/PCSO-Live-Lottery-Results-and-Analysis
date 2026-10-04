const {
  withAppBuildGradle,
  withGradleProperties,
} = require('@expo/config-plugins');

/** Keep optimized R8 settings when Expo regenerates the Android project. */
module.exports = function withAndroidReleaseOptimization(config) {
  config = withAppBuildGradle(config, (appConfig) => {
    if (appConfig.modResults.language === 'groovy') {
      appConfig.modResults.contents = appConfig.modResults.contents.replace(
        /getDefaultProguardFile\(["']proguard-android\.txt["']\)/g,
        'getDefaultProguardFile("proguard-android-optimize.txt")',
      );
    }
    return appConfig;
  });

  return withGradleProperties(config, (appConfig) => {
    const key = 'android.r8.optimizedResourceShrinking';
    const existing = appConfig.modResults.find(
      (item) => item.type === 'property' && item.key === key,
    );
    if (existing) existing.value = 'true';
    else appConfig.modResults.push({ type: 'property', key, value: 'true' });
    return appConfig;
  });
};
