const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withBackgroundService(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;
    const mainApplication = androidManifest.application[0];

    // Ensure we have the foreground service permission (redundant but safe)
    if (!androidManifest['uses-permission']) {
      androidManifest['uses-permission'] = [];
    }

    // Add the service tag for react-native-background-actions
    if (!mainApplication.service) {
      mainApplication.service = [];
    }

    const serviceName = 'com.asterinet.reactfastbackgroundactions.RNBackgroundActionsTask';

    const existingService = mainApplication.service.find(
      (s) => s.$['android:name'] === serviceName
    );

    if (!existingService) {
      mainApplication.service.push({
        $: {
          'android:name': serviceName,
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'microphone',
        },
      });
      console.log('[FRIDAY] Background Service registered in AndroidManifest.');
    }

    return config;
  });
};
