/**
 * DebugConsole — Floating overlay that shows Bluetooth commands in real-time.
 *
 * Renders over the carbon-fiber center zone so it doesn't block controls.
 * Shows the last N commands with timestamps and the current active command
 * highlighted prominently.
 */
import React, { useRef, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { COLORS, BORDER_RADIUS, TYPOGRAPHY, SPACING } from '../constants/theme';

interface DebugConsoleProps {
  /** Array of log entries (newest last) */
  logs: string[];
  /** Maximum entries to display */
  maxEntries?: number;
}

export function DebugConsole({ logs, maxEntries = 12 }: DebugConsoleProps) {
  const scrollRef = useRef<ScrollView>(null);
  const visibleLogs = logs.slice(-maxEntries);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [logs.length]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.dotLive} />
        <Text style={styles.headerText}>DEBUG CONSOLE</Text>
        <Text style={styles.headerBadge}>MOCK</Text>
      </View>

      {/* Log entries */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollArea}
        showsVerticalScrollIndicator={false}
      >
        {visibleLogs.length === 0 && (
          <Text style={styles.emptyText}>
            Press buttons to see commands…
          </Text>
        )}
        {visibleLogs.map((entry, i) => {
          const isLatest = i === visibleLogs.length - 1;
          const isStop = entry.includes('STOP');
          const isCombo = entry.includes('+');

          return (
            <View
              key={`${i}-${entry}`}
              style={[
                styles.logRow,
                isLatest && styles.logRowLatest,
              ]}
            >
              <Text
                style={[
                  styles.logText,
                  isLatest && styles.logTextLatest,
                  isStop && styles.logTextStop,
                  isCombo && styles.logTextCombo,
                ]}
              >
                {entry}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Current active command (large) */}
      {visibleLogs.length > 0 && (
        <View style={styles.activeBar}>
          <Text style={styles.activeLabel}>ACTIVE:</Text>
          <Text style={styles.activeCommand}>
            {visibleLogs[visibleLogs.length - 1]}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(10, 10, 15, 0.88)',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderAccent,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
    backgroundColor: 'rgba(0, 229, 255, 0.05)',
  },
  dotLive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
    marginRight: 6,
  },
  headerText: {
    ...TYPOGRAPHY.label,
    color: COLORS.accentPrimary,
    flex: 1,
  },
  headerBadge: {
    ...TYPOGRAPHY.caption,
    color: COLORS.warning,
    backgroundColor: 'rgba(255, 214, 0, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  scrollArea: {
    flex: 1,
    paddingHorizontal: SPACING.sm,
    paddingTop: 4,
  },
  emptyText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
  logRow: {
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRadius: 4,
    marginBottom: 2,
  },
  logRowLatest: {
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
  },
  logText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  logTextLatest: {
    color: COLORS.accentPrimary,
    fontWeight: '700',
  },
  logTextStop: {
    color: COLORS.textMuted,
  },
  logTextCombo: {
    color: COLORS.success,
    fontWeight: '700',
  },
  activeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSubtle,
    backgroundColor: 'rgba(0, 229, 255, 0.05)',
  },
  activeLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginRight: 6,
  },
  activeCommand: {
    ...TYPOGRAPHY.label,
    color: COLORS.accentPrimary,
    flex: 1,
  },
});
