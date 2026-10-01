/**
 * DirectionalPad — Forward and Backward control buttons, stacked vertically.
 * Placed on the left side of the screen.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ControlButton } from './ControlButton';
import { COLORS, SPACING } from '../constants/theme';

interface DirectionalPadProps {
  onForwardPress: () => void;
  onForwardRelease: () => void;
  onBackwardPress: () => void;
  onBackwardRelease: () => void;
}

export function DirectionalPad({
  onForwardPress,
  onForwardRelease,
  onBackwardPress,
  onBackwardRelease,
}: DirectionalPadProps) {
  return (
    <View style={styles.container}>
      <ControlButton
        icon="▲"
        label="FWD"
        onPressIn={onForwardPress}
        onPressOut={onForwardRelease}
        size="large"
        accentColor={COLORS.accentPrimary}
        glowColor={COLORS.accentGlow}
      />
      <View style={styles.spacer} />
      <ControlButton
        icon="▼"
        label="REV"
        onPressIn={onBackwardPress}
        onPressOut={onBackwardRelease}
        size="large"
        accentColor={COLORS.accentPrimary}
        glowColor={COLORS.accentGlow}
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
