/**
 * Custom hook for managing Bluetooth device connection.
 *
 * Features:
 * - Auto-reconnect to last-used device on mount
 * - Scan for new devices
 * - Persistent device memory via AsyncStorage
 * - Connection state management
 * - Command sending
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  requestBluetoothPermissions,
  isBluetoothEnabled,
  requestEnableBluetooth,
  getBondedDevices,
  startDiscoveryStream,
  cancelDiscovery,
  connectToDevice,
  disconnectFromDevice,
  isDeviceConnected,
  isBluetoothClassicSupported,
  sendCommand as btSendCommand,
  BTDevice,
} from '../services/BluetoothService';
import {
  saveLastDevice,
  getLastDevice,
  clearLastDevice,
} from '../services/StorageService';
import type { BluetoothErrorCode } from '../services/BluetoothErrors';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'scanning'
  | 'error';

export interface UseBluetoothDeviceReturn {
  /** Current connection status */
  status: ConnectionStatus;
  /** Currently connected device info */
  connectedDevice: BTDevice | null;
  /** List of discovered/bonded devices */
  discoveredDevices: BTDevice[];
  /** Human-readable error message, if any */
  errorMessage: string | null;
  /** Machine-readable error code corresponding to errorMessage */
  errorCode: BluetoothErrorCode | null;
  /** Whether Bluetooth is enabled on the phone */
  bluetoothEnabled: boolean;
  /** Whether this build can use Bluetooth Classic on this platform */
  platformSupported: boolean;
  /** Name of the last-connected device persisted for reconnect, or null */
  savedDeviceName: string | null;

  /** Connect to a specific device by address */
  connect: (device: BTDevice) => Promise<boolean>;
  /** Disconnect from the current device */
  disconnect: () => Promise<void>;
  /** Scan for nearby devices (bonded + discovery) */
  scan: () => Promise<void>;
  /** Cancel ongoing scan */
  stopScan: () => Promise<void>;
  /** Send a single character command */
  send: (command: string) => Promise<boolean>;
  /** Reconnect to the last-used device (user-triggered) */
  reconnect: () => Promise<boolean>;
  /** Request permissions */
  requestPermissions: () => Promise<boolean>;
  /** Forget the saved car so it will not be auto-reconnected. */
  forgetLastDevice: () => Promise<void>;
}

export function useBluetoothDevice(): UseBluetoothDeviceReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [connectedDevice, setConnectedDevice] = useState<BTDevice | null>(
    null
  );
  const [discoveredDevices, setDiscoveredDevices] = useState<BTDevice[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<BluetoothErrorCode | null>(null);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false);
  const [savedDeviceName, setSavedDeviceName] = useState<string | null>(null);
  const connectedAddressRef = useRef<string | null>(null);
  const connectionCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discoveryCleanupRef = useRef<(() => void) | null>(null);
  const connectingRef = useRef(false);
  const scanningRef = useRef(false);
  const mountedRef = useRef(true);
  const platformSupported = isBluetoothClassicSupported();

  const setError = useCallback((message: string, code: BluetoothErrorCode) => {
    setErrorMessage(message);
    setErrorCode(code);
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(null);
    setErrorCode(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      discoveryCleanupRef.current?.();
      void cancelDiscovery();
    };
  }, []);

  // Check Bluetooth enabled status
  useEffect(() => {
    const checkBT = async () => {
      const enabled = await isBluetoothEnabled();
      setBluetoothEnabled(enabled);
    };
    checkBT();
    const interval = setInterval(checkBT, 5000);
    return () => clearInterval(interval);
  }, []);

  // Periodic connection health check
  useEffect(() => {
    if (connectedAddressRef.current) {
      connectionCheckRef.current = setInterval(async () => {
        if (connectedAddressRef.current) {
          const connected = await isDeviceConnected(
            connectedAddressRef.current
          );
          if (!connected) {
            setStatus('disconnected');
            setConnectedDevice(null);
            connectedAddressRef.current = null;
          }
        }
      }, 3000);
    }
    return () => {
      if (connectionCheckRef.current) {
        clearInterval(connectionCheckRef.current);
      }
    };
  }, [connectedDevice]);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (!platformSupported) {
      setError('Bluetooth Classic control is available on Android only.', 'UNSUPPORTED_PLATFORM');
      return false;
    }
    const granted = await requestBluetoothPermissions();
    if (!granted) {
      setError('Bluetooth permissions are required', 'PERMISSION_DENIED');
    }
    return granted;
  }, [platformSupported, setError]);

  const connect = useCallback(
    async (device: BTDevice, silent = false): Promise<boolean> => {
      if (!platformSupported || connectingRef.current) return false;
      connectingRef.current = true;
      setStatus('connecting');
      clearError();

      try {
        const result = await connectToDevice(device.address);
        if (result) {
          setStatus('connected');
          setConnectedDevice(device);
          connectedAddressRef.current = device.address;
          setSavedDeviceName(device.name);
          await saveLastDevice({
            address: device.address,
            name: device.name,
          });
          return true;
        } else {
          setStatus('error');
          if (!silent) setError(`Failed to connect to ${device.name}`, 'CONNECTION_FAILED');
          return false;
        }
      } catch {
        setStatus('error');
        if (!silent) setError('Connection failed', 'CONNECTION_FAILED');
        return false;
      } finally {
        connectingRef.current = false;
      }
    },
    [platformSupported, setError, clearError]
  );

  const disconnect = useCallback(async () => {
    if (connectedAddressRef.current) {
      await disconnectFromDevice(connectedAddressRef.current);
    }
    setStatus('disconnected');
    setConnectedDevice(null);
    connectedAddressRef.current = null;
  }, []);

  const scan = useCallback(async () => {
    if (!platformSupported) {
      setStatus('error');
      setError('Bluetooth Classic control is available on Android only.', 'UNSUPPORTED_PLATFORM');
      return;
    }
    if (connectingRef.current || scanningRef.current) return;
    // If Bluetooth is off, prompt the user to enable it
    if (!bluetoothEnabled) {
      const enabled = await requestEnableBluetooth();
      if (!enabled) {
        setError('Bluetooth must be enabled to scan for devices', 'RADIO_OFF');
        return;
      }
      // User accepted — update our state
      setBluetoothEnabled(true);
    }

    scanningRef.current = true;
    setStatus('scanning');
    clearError();
    setDiscoveredDevices([]);

    try {
      // First get bonded/paired devices
      const bonded = await getBondedDevices();
      if (__DEV__) console.log('[BT Scan] Bonded devices:', JSON.stringify(bonded.map(d => d.address)));
      setDiscoveredDevices(bonded);

      // Clean up any previous discovery listener
      discoveryCleanupRef.current?.();

      // Track bonded addresses so we don't add them again from discovery.
      const bondedAddresses = new Set(bonded.map((d) => d.address));

      // Start streaming discovery — devices arrive one-by-one via the callback
      const cleanup = startDiscoveryStream(
        (device) => {
          const isBonded = bondedAddresses.has(device.address);

          if (!isBonded) {
            setDiscoveredDevices((prev) => {
              const isDuplicate = prev.some((d) => d.address === device.address);
              if (isDuplicate) return prev;
              return [...prev, device];
            });
          }
        },
        () => {
          // Discovery finished (~12s)
          scanningRef.current = false;
          if (mountedRef.current) {
            setStatus((s) => (s === 'scanning' ? 'disconnected' : s));
          }
          discoveryCleanupRef.current = null;
        },
      );

      discoveryCleanupRef.current = cleanup;
    } catch (error) {
      scanningRef.current = false;
      if (__DEV__) console.error('[BT Scan] Error:', error);
      setStatus('error');
      setError('Scan failed', 'DISCOVERY_FAILED');
    }
  }, [bluetoothEnabled, platformSupported, setError, clearError]);

  const stopScan = useCallback(async () => {
    scanningRef.current = false;
    discoveryCleanupRef.current?.();
    discoveryCleanupRef.current = null;
    await cancelDiscovery();
    setStatus('disconnected');
  }, []);

  const send = useCallback(async (command: string): Promise<boolean> => {
    if (!connectedAddressRef.current) return false;
    const sent = await btSendCommand(connectedAddressRef.current, command);
    if (!sent && mountedRef.current) {
      setStatus('disconnected');
      setConnectedDevice(null);
      connectedAddressRef.current = null;
      setError('Connection to the RC car was lost.', 'CONNECTION_LOST');
    }
    return sent;
  }, []);

  const autoReconnect = useCallback(async (): Promise<boolean> => {
    const lastDevice = await getLastDevice();
    if (!lastDevice) return false;

    // Bounded backoff absorbs transient radio start-up failures without
    // continually reconnecting to a car the user has intentionally turned off.
    let result = false;
    for (const delay of [0, 600, 1800]) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      result = await connect({
        address: lastDevice.address,
        name: lastDevice.name,
        id: lastDevice.address,
      }, true);
      if (result) break;
    }

    if (!result) {
      // Quietly reset to disconnected (don't leave error status from connect())
      setStatus('disconnected');
      setErrorMessage(null);
    }
    return result;
  }, [connect]);

  const reconnect = useCallback(async (): Promise<boolean> => {
    return autoReconnect();
  }, [autoReconnect]);

  const forgetLastDevice = useCallback(async () => {
    await clearLastDevice();
    setSavedDeviceName(null);
  }, []);

  // Initialise on mount: request permissions and load saved device name.
  // Auto-reconnect is NOT performed — the user can tap "Reconnect" instead.
  useEffect(() => {
    const init = async () => {
      const permsOk = await requestPermissions();
      if (permsOk) {
        const btOn = await isBluetoothEnabled();
        setBluetoothEnabled(btOn);
      }
      const saved = await getLastDevice();
      if (mountedRef.current) setSavedDeviceName(saved?.name ?? null);
    };
    init();
  }, []);

  return {
    status,
    connectedDevice,
    discoveredDevices,
    errorMessage,
    errorCode,
    bluetoothEnabled,
    platformSupported,
    savedDeviceName,
    connect,
    disconnect,
    scan,
    stopScan,
    send,
    reconnect,
    requestPermissions,
    forgetLastDevice,
  };
}
