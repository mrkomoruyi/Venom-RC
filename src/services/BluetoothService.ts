/**
 * Bluetooth Classic (SPP/RFCOMM) communication service for ESP32 RC car.
 *
 * Wraps react-native-bluetooth-classic with a clean API for
 * scanning, connecting, disconnecting, and sending single-char commands.
 */
import RNBluetoothClassic, {
  BluetoothDevice,
} from 'react-native-bluetooth-classic';
import { Platform, PermissionsAndroid } from 'react-native';

export type BTDevice = {
  address: string;
  name: string;
  id: string;
};

/** Bluetooth Classic / RFCOMM is implemented only for Android in this app. */
export const isBluetoothClassicSupported = () => Platform.OS === 'android';

// Native writes are asynchronous. Keep them ordered so a late movement packet
// cannot overtake a STOP packet when the user releases a control quickly.
const writeQueues = new Map<string, Promise<void>>();

/**
 * Request the Android runtime permissions required for Bluetooth Classic.
 * Android 12+ requires BLUETOOTH_CONNECT and BLUETOOTH_SCAN.
 */
export async function requestBluetoothPermissions(): Promise<boolean> {
  if (!isBluetoothClassicSupported()) return false;

  try {
    const apiLevel = Platform.Version;

    if (typeof apiLevel === 'number' && apiLevel >= 31) {
      // Android 12+
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      ]);

      return (
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
          PermissionsAndroid.RESULTS.GRANTED
      );
    } else {
      // Android 11 and below
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
  } catch (error) {
    if (__DEV__) console.error('Permission request failed:', error);
    return false;
  }
}

/**
 * Check if Bluetooth is enabled on the device.
 */
export async function isBluetoothEnabled(): Promise<boolean> {
  if (!isBluetoothClassicSupported()) return false;
  try {
    return await RNBluetoothClassic.isBluetoothEnabled();
  } catch (error) {
    if (__DEV__) console.error('Failed to check Bluetooth status:', error);
    return false;
  }
}

/**
 * Show the native Android dialog asking the user to enable Bluetooth.
 * Returns true if the user accepted and Bluetooth is now enabled.
 */
export async function requestEnableBluetooth(): Promise<boolean> {
  if (!isBluetoothClassicSupported()) return false;
  try {
    return await RNBluetoothClassic.requestBluetoothEnabled();
  } catch (error) {
    if (__DEV__) console.error('Failed to request Bluetooth enable:', error);
    return false;
  }
}

/**
 * Get list of paired/bonded Bluetooth devices.
 */
export async function getBondedDevices(): Promise<BTDevice[]> {
  if (!isBluetoothClassicSupported()) return [];
  try {
    const devices: BluetoothDevice[] =
      await RNBluetoothClassic.getBondedDevices();
    return devices.map((d) => ({
      address: d.address,
      name: d.name || d.address,
      id: d.address,
    }));
  } catch (error) {
    if (__DEV__) console.error('Failed to get bonded devices:', error);
    return [];
  }
}

/**
 * Start Bluetooth discovery and report devices progressively via callback.
 *
 * `startDiscovery()` returns a promise that resolves when the ~12s scan
 * finishes, but on many Android versions the returned array is empty or
 * incomplete.  Using `onDeviceDiscovered` gives us each device the moment
 * the radio finds it.
 *
 * Deduplication is done here (not in the hook) because the event can fire
 * for the same device multiple times and React state batching can cause
 * the hook-level Set to miss duplicates.
 *
 * Returns a cleanup function that removes the event listener.
 */
export function startDiscoveryStream(
  onDeviceFound: (device: BTDevice) => void,
  onFinished?: () => void,
): () => void {
  if (!isBluetoothClassicSupported()) {
    onFinished?.();
    return () => undefined;
  }
  // Deduplicate at the source — the event fires multiple times per device
  const seenAddresses = new Set<string>();

  // Subscribe to live device-found events
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscription = RNBluetoothClassic.onDeviceDiscovered((event: any) => {
    // The event structure may vary — log it once for debugging
    if (__DEV__) console.log('[BT Discovery] Device event:', JSON.stringify(event));

    // event.device is a BluetoothNativeDevice on Android
    const d = event?.device ?? event;
    const address = d?.address;

    if (address && !seenAddresses.has(address)) {
      seenAddresses.add(address);
      onDeviceFound({
        address,
        name: d.name || address,
        id: address,
      });
    }
  });

  // Kick off discovery (the promise resolves when the scan finishes)
  RNBluetoothClassic.startDiscovery()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .then((devices: any[]) => {
      // Some Android versions return discovered devices via the promise too.
      // Add any we haven't seen from the event listener.
      if (Array.isArray(devices)) {
        for (const d of devices) {
          const address = d?.address;
          if (address && !seenAddresses.has(address)) {
            seenAddresses.add(address);
            onDeviceFound({
              address,
              name: d.name || address,
              id: address,
            });
          }
        }
      }
      onFinished?.();
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .catch((error: any) => {
      if (__DEV__) console.error('Discovery failed:', error);
      onFinished?.();
    });

  // Return a cleanup function
  return () => {
    subscription.remove();
  };
}

/**
 * Cancel ongoing Bluetooth discovery.
 */
export async function cancelDiscovery(): Promise<void> {
  if (!isBluetoothClassicSupported()) return;
  try {
    await RNBluetoothClassic.cancelDiscovery();
  } catch {
    // Ignore — discovery may not be running
  }
}

/**
 * Connect to a device by address.
 * Tries secure RFCOMM first, then falls back to insecure socket
 * to handle the common Android "read failed, socket might closed" error.
 */
export async function connectToDevice(
  address: string
): Promise<BluetoothDevice | null> {
  if (!isBluetoothClassicSupported()) return null;
  // Always stop discovery and allow radio to settle before connecting
  try {
    await RNBluetoothClassic.cancelDiscovery();
    await new Promise((resolve) => setTimeout(resolve, 300));
  } catch {
    // Ignore cancel errors
  }

  // First attempt: secure RFCOMM socket (default)
  try {
    const device = await RNBluetoothClassic.connectToDevice(address, {
      delimiter: '\n',
      connectorType: 'rfcomm',
      secureSocket: true,
    });
    return device;
  } catch (secureError) {
    if (__DEV__) {
      console.warn(
        `Secure connection to ${address} failed, trying insecure fallback...`,
        secureError
      );
    }
  }

  // Second attempt: insecure RFCOMM socket (fallback)
  try {
    const device = await RNBluetoothClassic.connectToDevice(address, {
      delimiter: '\n',
      connectorType: 'rfcomm',
      secureSocket: false,
    });
    return device;
  } catch (insecureError) {
    if (__DEV__) {
      console.error(
        `Failed to connect to ${address} (both secure and insecure):`,
        insecureError
      );
    }
    return null;
  }
}

/**
 * Disconnect from a connected device.
 */
export async function disconnectFromDevice(
  address: string
): Promise<boolean> {
  if (!isBluetoothClassicSupported()) return true;
  try {
    const device = await RNBluetoothClassic.getConnectedDevice(address);
    if (device) {
      return await device.disconnect();
    }
    return true;
  } catch (error) {
    if (__DEV__) console.error('Failed to disconnect:', error);
    return false;
  }
}

/**
 * Check if a specific device is currently connected.
 */
export async function isDeviceConnected(address: string): Promise<boolean> {
  if (!isBluetoothClassicSupported()) return false;
  try {
    return await RNBluetoothClassic.isDeviceConnected(address);
  } catch {
    return false;
  }
}

/**
 * Send a single character command to the connected device.
 */
export async function sendCommand(
  address: string,
  command: string
): Promise<boolean> {
  if (!isBluetoothClassicSupported()) return false;

  let sent = false;
  const previous = writeQueues.get(address) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      try {
        const device = await RNBluetoothClassic.getConnectedDevice(address);
        sent = device ? await device.write(command) : false;
      } catch {
        sent = false;
      }
    });

  writeQueues.set(address, next);
  try {
    await next;
    return sent;
  } finally {
    if (writeQueues.get(address) === next) writeQueues.delete(address);
  }
}
