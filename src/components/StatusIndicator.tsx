/**
 * StatusIndicator — Pulsing connection status dot with label.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/theme';
import { ConnectionStatus } from '../hooks/useBluetoothDevice';

interface StatusIndicatorProps {
  status: ConnectionStatus;
  deviceName?: string | null;
}

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { color: string; label: string; pulse: boolean }
> = {
  disconnected: {
    color: COLORS.textMuted,
    label: 'Disconnected',
    pulse: false,
  },
  connecting: {
    color: COLORS.warning,
    label: 'Connecting...',
    pulse: true,
  },
  connected: {
    color: COLORS.success,
    label: 'Connected',
    pulse: false,
  },
  scanning: {
    color: COLORS.accentPrimary,
    label: 'Scanning...',
    pulse: true,
  },
  error: {
    color: COLORS.danger,
    label: 'Error',
    pulse: false,
  },
};

export function StatusIndicator({ status, deviceName }: StatusIndicatorProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const config = STATUS_CONFIG[status];

  useEffect(() => {
    if (config.pulse) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [config.pulse, pulseAnim]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.dot,
          {
            backgroundColor: config.color,
            opacity: pulseAnim,
            shadowColor: config.color,
            shadowOpacity: 0.6,
            shadowRadius: 6,
            elevation: 4,
          },
        ]}
      />
      <View style={styles.textContainer}>
        <Text style={[styles.statusText, { color: config.color }]}>
          {config.label}
        </Text>
        {deviceName && status === 'connected' && (
          <Text style={styles.deviceName} numberOfLines={1}>
            {deviceName}
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
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  textContainer: {
    flexDirection: 'column',
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
    maxWidth: 120,
  },
});
