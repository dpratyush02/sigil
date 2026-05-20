const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ensure TTF fonts are bundled as assets
config.resolver.assetExts.push('ttf', 'otf');

// Enable platform-specific file resolution for web (.web.ts, .web.tsx, etc.)
config.resolver.platforms = ['web', 'ios', 'android', 'native'];

module.exports = config;
