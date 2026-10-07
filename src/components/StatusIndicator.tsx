/**
 * StatusIndicator — connection status with label.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/theme';
import { ConnectionStatus } from '../hooks/useBluetoothDevice';

interface StatusIndicatorProps {
  status: ConnectionStatus;
  deviceName?: string | null;
}

const STATUS_CONFIG: Record<ConnectionStatus, { color: string; label: string }> = {
  disconnected: {
    color: COLORS.textMuted,
    label: 'Disconnected',
  },
  connecting: {
    color: COLORS.warning,
    label: 'Connecting...',
  },
  connected: {
    color: COLORS.success,
    label: 'Ready to drive',
  },
  scanning: {
    color: COLORS.accentPrimary,
    label: 'Scanning...',
  },
  error: {
    color: COLORS.danger,
    label: 'Error',
  },
};

export function StatusIndicator({ status, deviceName }: StatusIndicatorProps) {
  const config = STATUS_CONFIG[status];

  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        <Text style={[styles.statusText, { color: config.color }]}>
          {status === 'connected' ? '● ' : '○ '}
          {config.label}
        </Text>
        {deviceName && status === 'connected' && (
          <Text style={styles.deviceName} numberOfLines={1}>
            {`· ${deviceName}`}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  textContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    maxWidth: 240,
  },
  statusText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  deviceName: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    flexShrink: 1,
  },
});
