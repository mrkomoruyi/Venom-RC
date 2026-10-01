/**
 * ControllerScreen — Main app screen with full RC car controller layout.
 *
 * Layout (landscape):
 * ┌─────────────────────────────────────────────────────────────┐
 * │              ConnectionToolbar (top)                        │
 * ├──────────┬─────────────────────────────┬────────────────────┤
 * │          │                             │  [💡] [📯]         │
 * │  ▲ FWD   │      Carbon Fiber BG        │                    │
 * │          │                             │   ◄        ►       │
 * │  ▼ REV   │                             │  LEFT    RIGHT     │
 * │          │                             │                    │
 * └──────────┴─────────────────────────────┴────────────────────┘
 *
 * Supports simultaneous button presses (e.g. Forward + Left)
 * by tracking active directions and sending combined commands.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, StatusBar, Alert } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { COLORS, SPACING } from '../constants/theme';
import { COMMANDS } from '../constants/commands';
import { useBluetoothDevice } from '../hooks/useBluetoothDevice';
import { useMockBluetoothDevice } from '../hooks/useMockBluetoothDevice';
import { ConnectionToolbar } from '../components/ConnectionToolbar';
import { DirectionalPad } from '../components/DirectionalPad';
import { SteeringPad } from '../components/SteeringPad';
import { ToolbarButtons } from '../components/ToolbarButtons';
import { DeviceListModal } from '../components/DeviceListModal';
import { MultiTouchArea } from '../components/MultiTouchArea';
import { DebugConsole } from '../components/DebugConsole';

/**
 * ─── MOCK MODE ────────────────────────────────────────────────
 * Set to true to use a fake Bluetooth backend with an on-screen
 * debug console. Useful for testing UI + multi-touch without
 * an ESP32 or any Bluetooth device.
 *
 * Set to false for production / real-device usage.
 */
const MOCK_BLUETOOTH = false;

/**
 * Resolves which command to send based on currently active directions.
 */
function resolveDirectionCommand(activeDirections: Set<string>): string {
  const fwd = activeDirections.has('forward');
  const bwd = activeDirections.has('backward');
  const left = activeDirections.has('left');
  const right = activeDirections.has('right');

  // Combined directions
  if (fwd && left) return COMMANDS.FORWARD_LEFT;
  if (fwd && right) return COMMANDS.FORWARD_RIGHT;
  if (bwd && left) return COMMANDS.BACKWARD_LEFT;
  if (bwd && right) return COMMANDS.BACKWARD_RIGHT;

  // Single directions
  if (fwd) return COMMANDS.FORWARD;
  if (bwd) return COMMANDS.BACKWARD;
  if (left) return COMMANDS.LEFT;
  if (right) return COMMANDS.RIGHT;

  // Nothing held
  return COMMANDS.STOP;
}

export function ControllerScreen() {
  const [lightsOn, setLightsOn] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const handleCommandLog = useCallback((entry: string) => {
    setDebugLogs((prev) => [...prev.slice(-50), entry]);
  }, []);

  // Use mock hook in dev mode, real hook in production
  const realBt = useBluetoothDevice();
  const mockBt = useMockBluetoothDevice(handleCommandLog);
  const bt = MOCK_BLUETOOTH ? mockBt : realBt;

  // Track which directional buttons are currently held down
  const activeDirectionsRef = useRef<Set<string>>(new Set());

  /**
   * Send the appropriate command based on the current combination
   * of active directions.
   */
  const sendDirectionUpdate = useCallback(() => {
    const command = resolveDirectionCommand(activeDirectionsRef.current);
    bt.send(command);
  }, [bt]);

  // Lock to landscape on mount
  useEffect(() => {
    ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE
    );
    return () => {
      ScreenOrientation.unlockAsync();
    };
  }, []);

  // ── Direction handlers ───────────────────────────────────────
  const handleForwardPress = useCallback(() => {
    activeDirectionsRef.current.add('forward');
    sendDirectionUpdate();
  }, [sendDirectionUpdate]);

  const handleForwardRelease = useCallback(() => {
    activeDirectionsRef.current.delete('forward');
    sendDirectionUpdate();
  }, [sendDirectionUpdate]);

  const handleBackwardPress = useCallback(() => {
    activeDirectionsRef.current.add('backward');
    sendDirectionUpdate();
  }, [sendDirectionUpdate]);

  const handleBackwardRelease = useCallback(() => {
    activeDirectionsRef.current.delete('backward');
    sendDirectionUpdate();
  }, [sendDirectionUpdate]);

  const handleLeftPress = useCallback(() => {
    activeDirectionsRef.current.add('left');
    sendDirectionUpdate();
  }, [sendDirectionUpdate]);

  const handleLeftRelease = useCallback(() => {
    activeDirectionsRef.current.delete('left');
    sendDirectionUpdate();
  }, [sendDirectionUpdate]);

  const handleRightPress = useCallback(() => {
    activeDirectionsRef.current.add('right');
    sendDirectionUpdate();
  }, [sendDirectionUpdate]);

  const handleRightRelease = useCallback(() => {
    activeDirectionsRef.current.delete('right');
    sendDirectionUpdate();
  }, [sendDirectionUpdate]);

  // ── Honk handler (momentary) ─────────────────────────────────
  const handleHonkPress = useCallback(() => {
    bt.send(COMMANDS.HONK);
  }, [bt]);

  const handleHonkRelease = useCallback(() => {
    // Re-send current direction state after honk ends
    sendDirectionUpdate();
  }, [sendDirectionUpdate]);

  // ── Lights handler (toggle) ──────────────────────────────────
  const handleLightsToggle = useCallback(() => {
    const newState = !lightsOn;
    setLightsOn(newState);
    bt.send(newState ? COMMANDS.LIGHTS_ON : COMMANDS.LIGHTS_OFF);
  }, [lightsOn, bt]);

  // ── Bluetooth connection handlers ────────────────────────────
  const handleConnectPress = useCallback(() => {
    setShowDeviceModal(true);
    bt.scan();
  }, [bt]);

  const handleDisconnectPress = useCallback(() => {
    Alert.alert('Disconnect', 'Disconnect from the RC car?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () => bt.disconnect(),
      },
    ]);
  }, [bt]);

  const handleSelectDevice = useCallback(
    async (device: { address: string; name: string; id: string }) => {
      setShowDeviceModal(false);
      await bt.stopScan();
      const success = await bt.connect(device);
      if (!success) {
        Alert.alert(
          'Connection Failed',
          `Could not connect to ${device.name}. Make sure the device is powered on and in range.`
        );
      }
    },
    [bt]
  );

  // Show error alerts
  useEffect(() => {
    if (bt.errorMessage && bt.status === 'error') {
      Alert.alert('Bluetooth Error', bt.errorMessage);
    }
  }, [bt.errorMessage, bt.status]);

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Top Toolbar */}
      <ConnectionToolbar
        status={bt.status}
        deviceName={bt.connectedDevice?.name ?? null}
        onConnectPress={handleConnectPress}
        onDisconnectPress={handleDisconnectPress}
      />

      {/* Main Control Area — MultiTouchArea handles all touches */}
      <MultiTouchArea style={styles.controlArea}>
        {/* Left: Forward/Backward */}
        <View style={styles.leftZone}>
          <DirectionalPad
            onForwardPress={handleForwardPress}
            onForwardRelease={handleForwardRelease}
            onBackwardPress={handleBackwardPress}
            onBackwardRelease={handleBackwardRelease}
          />
        </View>

        {/* Center: Carbon Fiber Background with subtle branding */}
        <View style={styles.centerZone}>
          {/* Decorative grid lines for carbon fiber feel */}
          <View style={styles.carbonGrid}>
            {Array.from({ length: 8 }).map((_, i) => (
              <View
                key={`h-${i}`}
                style={[
                  styles.gridLineHorizontal,
                  { top: `${(i + 1) * 11}%` },
                ]}
              />
            ))}
            {Array.from({ length: 12 }).map((_, i) => (
              <View
                key={`v-${i}`}
                style={[
                  styles.gridLineVertical,
                  { left: `${(i + 1) * 8}%` },
                ]}
              />
            ))}
          </View>

          {/* Ambient glow in center */}
          <View style={styles.ambientGlow} />

          {/* Debug console overlay (mock mode only) */}
          {MOCK_BLUETOOTH && <DebugConsole logs={debugLogs} />}
        </View>

        {/* Right: Utility buttons + Steering */}
        <View style={styles.rightZone}>
          <View style={styles.rightContent}>
            {/* Honk & Lights floating to the left of steering */}
            <ToolbarButtons
              lightsOn={lightsOn}
              onHonkPress={handleHonkPress}
              onHonkRelease={handleHonkRelease}
              onLightsToggle={handleLightsToggle}
            />
            {/* Left/Right steering */}
            <View style={styles.steeringContainer}>
              <SteeringPad
                onLeftPress={handleLeftPress}
                onLeftRelease={handleLeftRelease}
                onRightPress={handleRightPress}
                onRightRelease={handleRightRelease}
              />
            </View>
          </View>
        </View>
      </MultiTouchArea>

      {/* Device Selection Modal */}
      <DeviceListModal
        visible={showDeviceModal}
        devices={bt.discoveredDevices}
        status={bt.status}
        onSelectDevice={handleSelectDevice}
        onScan={() => bt.scan()}
        onClose={() => {
          setShowDeviceModal(false);
          bt.stopScan();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundDark,
  },
  controlArea: {
    flex: 1,
    flexDirection: 'row',
  },
  leftZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: SPACING.lg,
  },
  centerZone: {
    flex: 1.5,
    position: 'relative',
    overflow: 'hidden',
  },
  rightZone: {
    flex: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: SPACING.lg,
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xl,
  },
  steeringContainer: {
    marginLeft: SPACING.sm,
  },
  // Carbon fiber decorative grid
  carbonGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gridLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: COLORS.borderSubtle,
    opacity: 0.3,
  },
  gridLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: COLORS.borderSubtle,
    opacity: 0.3,
  },
  // Ambient glow effect
  ambientGlow: {
    position: 'absolute',
    top: '25%',
    left: '25%',
    width: '50%',
    height: '50%',
    borderRadius: 200,
    backgroundColor: COLORS.accentGlowSubtle,
    opacity: 0.5,
  },
});
