/**
 * Mock Bluetooth hook for testing without a real device.
 *
 * Provides the same API surface as useBluetoothDevice but:
 * - Simulates scan with fake devices
 * - Simulates connect/disconnect
 * - Logs every command to a visible debug console via callback
 *
 * To activate, swap the import in ControllerScreen:
 *   import { useMockBluetoothDevice as useBluetoothDevice } from '../hooks/useMockBluetoothDevice';
 */
import { useState, useCallback, useRef } from 'react';
import type { ConnectionStatus, UseBluetoothDeviceReturn } from './useBluetoothDevice';

// Reverse map: command character → human-readable label
const COMMAND_LABELS: Record<string, string> = {
  F: '▲ FORWARD',
  B: '▼ BACKWARD',
  L: '◄ LEFT',
  R: '► RIGHT',
  S: '■ STOP',
  G: '▲◄ FWD+LEFT',
  I: '▲► FWD+RIGHT',
  H: '▼◄ BWD+LEFT',
  J: '▼► BWD+RIGHT',
  V: '📯 HONK',
  '1': '💡 LIGHTS ON',
  '0': '💡 LIGHTS OFF',
};

interface BTDevice {
  address: string;
  name: string;
  id: string;
}

const FAKE_DEVICES: BTDevice[] = [
  { address: 'AA:BB:CC:DD:EE:01', name: 'ESP32-RC-Car (Mock)', id: 'AA:BB:CC:DD:EE:01' },
  { address: 'AA:BB:CC:DD:EE:02', name: 'HC-05 (Mock)', id: 'AA:BB:CC:DD:EE:02' },
];

export function useMockBluetoothDevice(
  onCommandLog?: (entry: string) => void,
): UseBluetoothDeviceReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [connectedDevice, setConnectedDevice] = useState<BTDevice | null>(null);
  const [discoveredDevices, setDiscoveredDevices] = useState<BTDevice[]>([]);
  const [errorMessage] = useState<string | null>(null);
  const lastCommandRef = useRef<string>('');

  const connect = useCallback(async (device: BTDevice): Promise<boolean> => {
    setStatus('connecting');
    // Simulate connection delay
    await new Promise((r) => setTimeout(r, 800));
    setStatus('connected');
    setConnectedDevice(device);
    onCommandLog?.(`✅ Connected to ${device.name}`);
    return true;
  }, [onCommandLog]);

  const disconnect = useCallback(async () => {
    setStatus('disconnected');
    const name = connectedDevice?.name;
    setConnectedDevice(null);
    onCommandLog?.(`❌ Disconnected from ${name}`);
  }, [connectedDevice, onCommandLog]);

  const scan = useCallback(async () => {
    setStatus('scanning');
    setDiscoveredDevices([]);
    // Simulate scan delay
    await new Promise((r) => setTimeout(r, 1200));
    setDiscoveredDevices(FAKE_DEVICES);
    setStatus('disconnected');
  }, []);

  const stopScan = useCallback(async () => {
    setStatus('disconnected');
  }, []);

  const send = useCallback(async (command: string): Promise<boolean> => {
    // Only log if command actually changed (avoid flooding console with repeats)
    if (command !== lastCommandRef.current) {
      lastCommandRef.current = command;
      const label = COMMAND_LABELS[command] || `CMD: ${command}`;
      onCommandLog?.(label);
    }
    return true;
  }, [onCommandLog]);

  const reconnect = useCallback(async (): Promise<boolean> => false, []);
  const requestPermissions = useCallback(async (): Promise<boolean> => true, []);
  const forgetLastDevice = useCallback(async () => {}, []);

  return {
    status,
    connectedDevice,
    discoveredDevices,
    errorMessage,
    errorCode: null,
    bluetoothEnabled: true,
    platformSupported: true,
    savedDeviceName: null,
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
