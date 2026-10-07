/**
 * DeviceListModal — Sleek overlay modal for scanning and selecting BT devices.
 * Shows bonded + discovered devices with connect action.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  COLORS,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
} from '../constants/theme';
import { BTDevice } from '../services/BluetoothService';
import { ConnectionStatus } from '../hooks/useBluetoothDevice';

interface DeviceListModalProps {
  visible: boolean;
  devices: BTDevice[];
  status: ConnectionStatus;
  onSelectDevice: (device: BTDevice) => void;
  onScan: () => void;
  onClose: () => void;
  onForgetLastDevice: () => void | Promise<void>;
  errorMessage?: string | null;
  onRetry?: () => void;
  savedDeviceName?: string | null;
}

export function DeviceListModal({
  visible,
  devices,
  status,
  onSelectDevice,
  onScan,
  onClose,
  onForgetLastDevice,
  errorMessage,
  onRetry,
  savedDeviceName,
}: DeviceListModalProps) {
  const isScanning = status === 'scanning';
  const hasSavedDevice =
    savedDeviceName !== undefined ? Boolean(savedDeviceName) : true;

  const [forgetSuccess, setForgetSuccess] = useState(false);
  const [isForgetting, setIsForgetting] = useState(false);

  const successScale = useRef(new Animated.Value(1)).current;
  const successOpacity = useRef(new Animated.Value(1)).current;
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  // Reset visual feedback state when modal is closed
  useEffect(() => {
    if (!visible) {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
      setForgetSuccess(false);
      setIsForgetting(false);
      successOpacity.setValue(1);
      successScale.setValue(1);
    }
  }, [visible, successOpacity, successScale]);

  const handleForgetLastDevice = useCallback(async () => {
    if (isForgetting || forgetSuccess) return;
    setIsForgetting(true);
    try {
      await onForgetLastDevice();
      setIsForgetting(false);
      setForgetSuccess(true);

      // Trigger subtle success haptic
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      ).catch(() => {});

      // Pop-in spring animation for the success feedback
      successScale.setValue(0.85);
      successOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(successScale, {
          toValue: 1,
          friction: 6,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.timing(successOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();

      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }

      // Revert after 2.5 seconds with a smooth fade
      resetTimerRef.current = setTimeout(() => {
        Animated.timing(successOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }).start(() => {
          setForgetSuccess(false);
          successOpacity.setValue(1);
          successScale.setValue(1);
        });
      }, 2500);
    } catch {
      setIsForgetting(false);
    }
  }, [
    isForgetting,
    forgetSuccess,
    onForgetLastDevice,
    successOpacity,
    successScale,
  ]);

  const renderDevice = ({ item }: { item: BTDevice }) => (
    <Pressable
      onPress={() => onSelectDevice(item)}
      accessibilityRole="button"
      accessibilityLabel={`Connect to ${item.name}`}
      accessibilityHint="Connect to this paired Bluetooth device"
      style={({ pressed }) => [
        styles.deviceItem,
        pressed && styles.deviceItemPressed,
      ]}
    >
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{item.name}</Text>
        <Text style={styles.deviceAddress}>{item.address}</Text>
      </View>
      <View style={styles.connectChevron}>
        <Text style={styles.chevronText}>→</Text>
      </View>
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>SELECT DEVICE</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          {/* Scan button */}
          <Pressable
            onPress={onScan}
            disabled={isScanning}
            accessibilityRole="button"
            accessibilityLabel={
              isScanning ? 'Scanning for devices' : 'Scan for Bluetooth devices'
            }
            style={[styles.scanButton, isScanning && styles.scanButtonDisabled]}
          >
            {isScanning ? (
              <ActivityIndicator color={COLORS.accentPrimary} size="small" />
            ) : null}
            <Text style={styles.scanButtonText}>
              {isScanning ? 'SCANNING...' : '⟳ SCAN FOR DEVICES'}
            </Text>
          </Pressable>

          {errorMessage ? (
            <View style={styles.errorPanel}>
              <Text style={styles.errorTitle}>Could not find a connection</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
              {onRetry ? (
                <Pressable onPress={onRetry} style={styles.retryButton}>
                  <Text style={styles.retryText}>TRY AGAIN</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* Forget saved device with dynamic feedback */}
          <Animated.View
            style={[
              styles.forgetButtonWrapper,
              {
                opacity: successOpacity,
                transform: [{ scale: successScale }],
              },
            ]}
          >
            <Pressable
              onPress={handleForgetLastDevice}
              disabled={
                isForgetting ||
                forgetSuccess ||
                (!hasSavedDevice && !forgetSuccess)
              }
              accessibilityRole={forgetSuccess ? 'alert' : 'button'}
              accessibilityLabel={
                forgetSuccess
                  ? 'Saved RC car forgotten successfully'
                  : hasSavedDevice
                  ? 'Forget saved RC car'
                  : 'No saved RC car'
              }
              accessibilityLiveRegion="polite"
              accessibilityState={{
                disabled:
                  isForgetting || (!hasSavedDevice && !forgetSuccess),
                busy: isForgetting,
              }}
              style={({ pressed }) => [
                styles.forgetButton,
                forgetSuccess && styles.forgetButtonSuccess,
                !hasSavedDevice &&
                  !forgetSuccess &&
                  styles.forgetButtonDisabled,
                pressed && !forgetSuccess && styles.forgetButtonPressed,
              ]}
            >
              {isForgetting ? (
                <>
                  <ActivityIndicator
                    size="small"
                    color={COLORS.accentPrimary}
                  />
                  <Text style={styles.forgetText}>FORGETTING...</Text>
                </>
              ) : forgetSuccess ? (
                <>
                  <Text style={styles.successCheckmark}>✓</Text>
                  <Text style={styles.successText}>SAVED CAR FORGOTTEN</Text>
                </>
              ) : (
                <Text
                  style={[
                    styles.forgetText,
                    !hasSavedDevice && styles.forgetTextDisabled,
                  ]}
                >
                  {hasSavedDevice ? 'FORGET SAVED CAR' : 'NO SAVED CAR'}
                </Text>
              )}
            </Pressable>
          </Animated.View>

          {/* Device list */}
          <FlatList
            data={devices}
            keyExtractor={(item) => item.id}
            renderItem={renderDevice}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {isScanning
                    ? 'Looking for nearby devices...'
                    : 'No devices found. Tap scan to search.'}
                </Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.surfaceOverlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '70%',
    maxHeight: '80%',
    backgroundColor: COLORS.backgroundCard,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.borderAccent,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  title: {
    ...TYPOGRAPHY.heading,
    color: COLORS.accentPrimary,
    fontSize: 16,
    letterSpacing: 2,
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundElevated,
  },
  closeText: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: 44,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.accentDim,
    backgroundColor: COLORS.backgroundElevated,
  },
  scanButtonDisabled: {
    opacity: 0.6,
  },
  scanButtonText: {
    ...TYPOGRAPHY.label,
    color: COLORS.accentPrimary,
    fontSize: 11,
  },
  forgetButtonWrapper: {
    alignSelf: 'center',
    marginBottom: SPACING.sm,
  },
  forgetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    minHeight: 34,
  },
  forgetButtonPressed: {
    backgroundColor: 'rgba(255, 23, 68, 0.1)',
    borderColor: 'rgba(255, 23, 68, 0.35)',
  },
  forgetButtonDisabled: {
    opacity: 0.45,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  forgetButtonSuccess: {
    backgroundColor: 'rgba(0, 230, 118, 0.14)',
    borderColor: COLORS.success,
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 4,
  },
  forgetText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  forgetTextDisabled: {
    color: COLORS.textMuted,
  },
  successCheckmark: {
    color: COLORS.success,
    fontSize: 13,
    fontWeight: '800',
  },
  successText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.success,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  list: {
    maxHeight: 250,
  },
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    marginVertical: 2,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  deviceItemPressed: {
    borderColor: COLORS.accentPrimary,
    backgroundColor: `${COLORS.accentPrimary}10`,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  deviceAddress: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  connectChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${COLORS.accentPrimary}15`,
  },
  chevronText: {
    color: COLORS.accentPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  errorPanel: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: `${COLORS.danger}55`,
    backgroundColor: `${COLORS.danger}10`,
  },
  errorTitle: {
    ...TYPOGRAPHY.label,
    color: COLORS.danger,
    fontSize: 11,
  },
  errorText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: `${COLORS.danger}20`,
  },
  retryText: {
    ...TYPOGRAPHY.label,
    color: COLORS.danger,
    fontSize: 10,
  },
});
