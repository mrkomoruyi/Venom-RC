/**
 * Custom Expo config plugin for react-native-bluetooth-classic.
 *
 * Since the library doesn't ship its own Expo config plugin,
 * we need to manually configure the Android native project:
 * - Add Bluetooth permissions to AndroidManifest.xml
 * - Ensure the library is properly linked
 */
const {
  withAndroidManifest,
  AndroidConfig,
} = require('@expo/config-plugins');

function withBluetoothClassic(config) {
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    // Ensure permissions are in the manifest
    if (!manifest.manifest['uses-permission']) {
      manifest.manifest['uses-permission'] = [];
    }

    const permissions = [
      'android.permission.BLUETOOTH',
      'android.permission.BLUETOOTH_ADMIN',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ];

    for (const perm of permissions) {
      const exists = manifest.manifest['uses-permission'].some(
        (p) => p.$?.['android:name'] === perm
      );
      if (!exists) {
        manifest.manifest['uses-permission'].push({
          $: { 'android:name': perm },
        });
      }
    }

    return config;
  });

  return config;
}

module.exports = withBluetoothClassic;
