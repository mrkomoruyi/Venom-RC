/**
 * ConnectionToolbar — Top bar showing BT status and connect/disconnect button.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  COLORS,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
} from '../constants/theme';
import { StatusIndicator } from './StatusIndicator';
import { ConnectionStatus } from '../hooks/useBluetoothDevice';

interface ConnectionToolbarProps {
  status: ConnectionStatus;
  deviceName: string | null;
  onConnectPress: () => void;
  onDisconnectPress: () => void;
  platformSupported?: boolean;
  errorMessage?: string | null;
}

export function ConnectionToolbar({
  status,
  deviceName,
  onConnectPress,
  onDisconnectPress,
  platformSupported = true,
  errorMessage,
}: ConnectionToolbarProps) {
  const isConnected = status === 'connected';
  const isBusy = status === 'connecting' || status === 'scanning';

  return (
    <View style={styles.toolbar}>
      {/* Left: App branding */}
      <View style={styles.brandSection}>
        <Text style={styles.brandIcon}>🏎️</Text>
        <View>
          <Text style={styles.brandTitle}>RC COMMAND</Text>
          <Text style={styles.brandSubtitle}>BLUETOOTH CONTROLLER</Text>
        </View>
      </View>

      {/* Center: Status */}
      <View style={styles.statusSection}>
        <StatusIndicator status={status} deviceName={deviceName} />
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>

      {/* Right: Connect/Disconnect */}
      <Pressable
        onPress={isConnected ? onDisconnectPress : onConnectPress}
        disabled={isBusy || !platformSupported}
        style={({ pressed }) => [
          styles.connectButton,
          isConnected && styles.connectButtonActive,
          isBusy && styles.connectButtonBusy,
          pressed && styles.connectButtonPressed,
        ]}
      >
        <Text
          style={[
            styles.connectButtonText,
            isConnected && styles.connectButtonTextActive,
          ]}
        >
          {!platformSupported
            ? 'ANDROID REQUIRED'
            : isBusy
            ? status === 'scanning'
              ? '⟳ SCANNING'
              : '⟳ CONNECTING'
            : isConnected
            ? '⏻ DISCONNECT'
            : '⏻ CONNECT'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surfaceGlass,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  brandSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  brandIcon: {
    fontSize: 22,
  },
  brandTitle: {
    ...TYPOGRAPHY.label,
    color: COLORS.accentPrimary,
    fontSize: 13,
    letterSpacing: 2,
  },
  brandSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    fontSize: 8,
    letterSpacing: 1.5,
  },
  statusSection: {
    alignItems: 'center',
    maxWidth: 240,
  },
  errorText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.danger,
    fontSize: 9,
    marginTop: 2,
    textAlign: 'center',
  },
  connectButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.accentDim,
    backgroundColor: COLORS.backgroundElevated,
  },
  connectButtonActive: {
    borderColor: COLORS.danger,
    backgroundColor: `${COLORS.danger}15`,
  },
  connectButtonBusy: {
    borderColor: COLORS.warning,
    opacity: 0.7,
  },
  connectButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  connectButtonText: {
    ...TYPOGRAPHY.label,
    color: COLORS.accentPrimary,
    fontSize: 11,
  },
  connectButtonTextActive: {
    color: COLORS.danger,
  },
});
