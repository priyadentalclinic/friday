const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Trick react-native-lan-port-scanner into using react-native-tcp-socket
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'react-native-tcp': require.resolve('react-native-tcp-socket'),
};

module.exports = config;
