/**
 * AsyncStorage helpers for persisting app state.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  LAST_DEVICE_ADDRESS: '@rc_car/last_device_address',
  LAST_DEVICE_NAME: '@rc_car/last_device_name',
} as const;

export interface SavedDevice {
  address: string;
  name: string;
}

/**
 * Save the last connected device for auto-reconnect.
 */
export async function saveLastDevice(device: SavedDevice): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [KEYS.LAST_DEVICE_ADDRESS, device.address],
      [KEYS.LAST_DEVICE_NAME, device.name],
    ]);
  } catch (error) {
    console.warn('Failed to save last device:', error);
  }
}

/**
 * Retrieve the last connected device.
 */
export async function getLastDevice(): Promise<SavedDevice | null> {
  try {
    const values = await AsyncStorage.multiGet([
      KEYS.LAST_DEVICE_ADDRESS,
      KEYS.LAST_DEVICE_NAME,
    ]);
    const address = values[0][1];
    const name = values[1][1];
    if (address && name) {
      return { address, name };
    }
    return null;
  } catch (error) {
    console.warn('Failed to get last device:', error);
    return null;
  }
}

/**
 * Clear the saved device.
 */
export async function clearLastDevice(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      KEYS.LAST_DEVICE_ADDRESS,
      KEYS.LAST_DEVICE_NAME,
    ]);
  } catch (error) {
    console.warn('Failed to clear last device:', error);
  }
}
