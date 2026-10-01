/**
 * ToolbarButton — Small circular utility buttons for honk and headlamps.
 * Placed as floating buttons next to the steering pad.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ControlButton } from './ControlButton';
import { COLORS, SPACING } from '../constants/theme';

interface ToolbarButtonsProps {
  lightsOn: boolean;
  onHonkPress: () => void;
  onHonkRelease: () => void;
  onLightsToggle: () => void;
}

export function ToolbarButtons({
  lightsOn,
  onHonkPress,
  onHonkRelease,
  onLightsToggle,
}: ToolbarButtonsProps) {
  return (
    <View style={styles.container}>
      {/* Headlamp toggle */}
      <ControlButton
        icon="💡"
        label="LIGHTS"
        onPress={onLightsToggle}
        size="small"
        circular
        isActive={lightsOn}
        accentColor={lightsOn ? COLORS.lampActive : COLORS.lampPrimary}
        glowColor={lightsOn ? COLORS.lampActiveGlow : COLORS.lampGlow}
      />
      <View style={styles.spacer} />
      {/* Honk momentary */}
      <ControlButton
        icon="📯"
        label="HONK"
        onPressIn={onHonkPress}
        onPressOut={onHonkRelease}
        size="small"
        circular
        accentColor={COLORS.honkPrimary}
        glowColor={COLORS.honkGlow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    height: SPACING.md,
  },
});
