const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const defaultTransformOptions = config.transformer.getTransformOptions;

config.transformer.getTransformOptions = async (...args) => {
  const options = defaultTransformOptions
    ? await defaultTransformOptions(...args)
    : {};
  const platform = args[1]?.platform;
  return {
    ...options,
    transform: {
      ...options.transform,
      // Defer unused native modules until their screen needs them.
      // Preserve Expo's web behavior.
      inlineRequires: platform === 'android' || platform === 'ios',
    },
  };
};

module.exports = config;
