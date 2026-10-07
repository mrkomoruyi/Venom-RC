/**
 * ToolbarButtons — Utility deck for the headlamps and momentary horn.
 * Placed next to the steering pad.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ControlButton } from './ControlButton';
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY } from '../constants/theme';

interface ToolbarButtonsProps {
  disabled?: boolean;
  compact?: boolean;
  lightsOn: boolean;
  onHonkPress: () => void;
  onHonkRelease: () => void;
  onLightsToggle: () => void;
}

export function ToolbarButtons({
  disabled = false,
  compact = false,
  lightsOn,
  onHonkPress,
  onHonkRelease,
  onLightsToggle,
}: ToolbarButtonsProps) {
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View style={[styles.header, compact && styles.headerCompact]}>
        <Text style={styles.title}>UTILITY</Text>
        <Text style={styles.subtitle}>QUICK CONTROLS</Text>
      </View>
      <View style={styles.controls}>
        <View style={styles.control}>
          <ControlButton
            icon="💡"
            label="LIGHTS"
            onPress={onLightsToggle}
            size={compact ? 'small' : 'utility'}
            isActive={lightsOn}
            disabled={disabled}
            accentColor={lightsOn ? COLORS.lampActive : COLORS.lampPrimary}
            glowColor={lightsOn ? COLORS.lampActiveGlow : COLORS.lampGlow}
          />
          <Text style={[styles.state, lightsOn && styles.stateActive]}>
            {lightsOn ? 'ON' : 'OFF'}
          </Text>
        </View>
        <View style={styles.control}>
          <ControlButton
            icon="📯"
            label="HONK"
            onPressIn={onHonkPress}
            onPressOut={onHonkRelease}
            disabled={disabled}
            size={compact ? 'small' : 'utility'}
            accentColor={COLORS.honkPrimary}
            glowColor={COLORS.honkGlow}
          />
          <Text style={styles.state}>HOLD</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    backgroundColor: `${COLORS.backgroundCard}CC`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerCompact: {
    padding: SPACING.xs,
  },
  header: {
    alignSelf: 'stretch',
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  headerCompact: {
    marginBottom: SPACING.xs,
  },
  title: {
    ...TYPOGRAPHY.label,
    color: COLORS.textPrimary,
    fontSize: 10,
    letterSpacing: 1.3,
  },
  subtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    fontSize: 8,
    marginTop: 2,
    letterSpacing: 1,
  },
  controls: {
    flexDirection: 'column',
    gap: SPACING.sm,
  },
  control: {
    alignItems: 'center',
  },
  state: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: SPACING.xs,
  },
  stateActive: {
    color: COLORS.lampActive,
  },
});
