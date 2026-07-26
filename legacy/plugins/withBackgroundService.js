const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withBackgroundService(config) {
  return withAndroidManifest(config, (config) => {
    const mainApplication = config.modResults.manifest.application[0];

    // Ensure the background service is declared with the correct type for Android 14+
    const service = {
      $: {
        'android:name': 'com.asterinet.react.bgactions.RNBackgroundActionsTask',
        'android:foregroundServiceType': 'microphone',
        'android:exported': 'false',
      },
    };

    if (!mainApplication.service) {
      mainApplication.service = [];
    }

    // Remove existing if any to avoid duplicates
    mainApplication.service = mainApplication.service.filter(
      (s) => s.$['android:name'] !== 'com.asterinet.react.bgactions.RNBackgroundActionsTask'
    );

    mainApplication.service.push(service);

    return config;
  });
};
