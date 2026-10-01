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
  sendCommand as btSendCommand,
  BTDevice,
} from '../services/BluetoothService';
import {
  saveLastDevice,
  getLastDevice,
  clearLastDevice,
} from '../services/StorageService';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'scanning'
  | 'error';

interface UseBluetoothDeviceReturn {
  /** Current connection status */
  status: ConnectionStatus;
  /** Currently connected device info */
  connectedDevice: BTDevice | null;
  /** List of discovered/bonded devices */
  discoveredDevices: BTDevice[];
  /** Error message if any */
  errorMessage: string | null;
  /** Whether Bluetooth is enabled on the phone */
  bluetoothEnabled: boolean;

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
  /** Auto-reconnect to last-used device */
  autoReconnect: () => Promise<boolean>;
  /** Request permissions */
  requestPermissions: () => Promise<boolean>;
}

export function useBluetoothDevice(): UseBluetoothDeviceReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [connectedDevice, setConnectedDevice] = useState<BTDevice | null>(
    null
  );
  const [discoveredDevices, setDiscoveredDevices] = useState<BTDevice[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false);
  const connectedAddressRef = useRef<string | null>(null);
  const connectionCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discoveryCleanupRef = useRef<(() => void) | null>(null);

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
    const granted = await requestBluetoothPermissions();
    if (!granted) {
      setErrorMessage('Bluetooth permissions are required');
    }
    return granted;
  }, []);

  const connect = useCallback(
    async (device: BTDevice): Promise<boolean> => {
      setStatus('connecting');
      setErrorMessage(null);

      try {
        const result = await connectToDevice(device.address);
        if (result) {
          setStatus('connected');
          setConnectedDevice(device);
          connectedAddressRef.current = device.address;
          await saveLastDevice({
            address: device.address,
            name: device.name,
          });
          return true;
        } else {
          setStatus('error');
          setErrorMessage(`Failed to connect to ${device.name}`);
          return false;
        }
      } catch (error) {
        setStatus('error');
        setErrorMessage('Connection failed');
        return false;
      }
    },
    []
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
    // If Bluetooth is off, prompt the user to enable it
    if (!bluetoothEnabled) {
      const enabled = await requestEnableBluetooth();
      if (!enabled) {
        setErrorMessage('Bluetooth must be enabled to scan for devices');
        return;
      }
      // User accepted — update our state
      setBluetoothEnabled(true);
    }

    setStatus('scanning');
    setErrorMessage(null);
    setDiscoveredDevices([]);

    try {
      // First get bonded/paired devices
      const bonded = await getBondedDevices();
      console.log('[BT Scan] Bonded devices:', JSON.stringify(bonded.map(d => d.address)));
      setDiscoveredDevices(bonded);

      // Clean up any previous discovery listener
      discoveryCleanupRef.current?.();

      // Track bonded addresses so we don't add them again from discovery.
      const bondedAddresses = new Set(bonded.map((d) => d.address));

      // Start streaming discovery — devices arrive one-by-one via the callback
      const cleanup = startDiscoveryStream(
        (device) => {
          console.log('[BT Scan] onDeviceFound callback:', device.address, device.name);
          const isBonded = bondedAddresses.has(device.address);
          console.log('[BT Scan] isBonded?', isBonded, '| bondedAddresses:', [...bondedAddresses]);

          if (!isBonded) {
            console.log('[BT Scan] Adding discovered device to list:', device.address);
            setDiscoveredDevices((prev) => {
              const isDuplicate = prev.some((d) => d.address === device.address);
              console.log('[BT Scan] prev length:', prev.length, '| isDuplicate?', isDuplicate);
              if (isDuplicate) return prev;
              const next = [...prev, device];
              console.log('[BT Scan] New list length:', next.length);
              return next;
            });
          } else {
            console.log('[BT Scan] Skipped (already bonded):', device.address);
          }
        },
        () => {
          // Discovery finished (~12s)
          console.log('[BT Scan] Discovery finished');
          setStatus((s) => (s === 'scanning' ? 'disconnected' : s));
          discoveryCleanupRef.current = null;
        },
      );

      discoveryCleanupRef.current = cleanup;
    } catch (error) {
      console.error('[BT Scan] Error:', error);
      setStatus('error');
      setErrorMessage('Scan failed');
    }
  }, [bluetoothEnabled]);

  const stopScan = useCallback(async () => {
    discoveryCleanupRef.current?.();
    discoveryCleanupRef.current = null;
    await cancelDiscovery();
    setStatus('disconnected');
  }, []);

  const send = useCallback(async (command: string): Promise<boolean> => {
    if (!connectedAddressRef.current) return false;
    return btSendCommand(connectedAddressRef.current, command);
  }, []);

  const autoReconnect = useCallback(async (): Promise<boolean> => {
    const lastDevice = await getLastDevice();
    if (!lastDevice) return false;

    // Attempt silently — don't show error UI if the last device isn't around
    const result = await connect({
      address: lastDevice.address,
      name: lastDevice.name,
      id: lastDevice.address,
    });

    if (!result) {
      // Quietly reset to disconnected (don't leave error status from connect())
      setStatus('disconnected');
      setErrorMessage(null);
    }
    return result;
  }, [connect]);

  // Auto-reconnect on mount
  useEffect(() => {
    const init = async () => {
      const permsOk = await requestPermissions();
      if (permsOk) {
        const btOn = await isBluetoothEnabled();
        setBluetoothEnabled(btOn);
        if (btOn) {
          await autoReconnect();
        }
      }
    };
    init();
  }, []);

  return {
    status,
    connectedDevice,
    discoveredDevices,
    errorMessage,
    bluetoothEnabled,
    connect,
    disconnect,
    scan,
    stopScan,
    send,
    autoReconnect,
    requestPermissions,
  };
}
