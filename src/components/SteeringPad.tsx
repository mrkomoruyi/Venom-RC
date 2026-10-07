/**
 * SteeringPad — Left and Right control buttons, placed horizontally.
 * Placed on the right side of the screen.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ControlButton } from './ControlButton';
import { COLORS, SPACING } from '../constants/theme';

interface SteeringPadProps {
  disabled?: boolean;
  onLeftPress: () => void;
  onLeftRelease: () => void;
  onRightPress: () => void;
  onRightRelease: () => void;
}

export function SteeringPad({
  disabled = false,
  onLeftPress,
  onLeftRelease,
  onRightPress,
  onRightRelease,
}: SteeringPadProps) {
  return (
    <View style={styles.container}>
      <ControlButton
        icon="◄"
        label="LEFT"
        onPressIn={onLeftPress}
        onPressOut={onLeftRelease}
        disabled={disabled}
        size="large"
        accentColor={COLORS.bluePrimary}
        glowColor={COLORS.blueGlow}
      />
      <View style={styles.spacer} />
      <ControlButton
        icon="►"
        label="RIGHT"
        onPressIn={onRightPress}
        onPressOut={onRightRelease}
        disabled={disabled}
        size="large"
        accentColor={COLORS.bluePrimary}
        glowColor={COLORS.blueGlow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    width: SPACING.sm,
  },
});
