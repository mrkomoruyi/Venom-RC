/**
 * DeviceListModal — Sleek overlay modal for scanning and selecting BT devices.
 * Shows bonded + discovered devices with connect action.
 */
import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
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
}

export function DeviceListModal({
  visible,
  devices,
  status,
  onSelectDevice,
  onScan,
  onClose,
}: DeviceListModalProps) {
  const isScanning = status === 'scanning';

  const renderDevice = ({ item }: { item: BTDevice }) => (
    <Pressable
      onPress={() => onSelectDevice(item)}
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
            style={[styles.scanButton, isScanning && styles.scanButtonDisabled]}
          >
            {isScanning ? (
              <ActivityIndicator color={COLORS.accentPrimary} size="small" />
            ) : null}
            <Text style={styles.scanButtonText}>
              {isScanning ? 'SCANNING...' : '⟳ SCAN FOR DEVICES'}
            </Text>
          </Pressable>

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
    width: 32,
    height: 32,
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
});
