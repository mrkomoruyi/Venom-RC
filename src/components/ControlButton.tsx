/**
 * ControlButton — Reusable neon-glow control button with press animations.
 *
 * Used for directional controls and utility buttons.
 * Supports press-and-hold for directional commands.
 *
 * Registers itself with the nearest <MultiTouchArea> parent so that a single
 * responder handles ALL touches — enabling true simultaneous multi-touch
 * (e.g. Forward + Left at the same time).
 */
import React, { useRef, useCallback, useEffect, useId, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ViewStyle,
  TextStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { COLORS, BORDER_RADIUS, TYPOGRAPHY } from '../constants/theme';
import { useMultiTouch } from './MultiTouchArea';

interface ControlButtonProps {
  /** Icon or emoji to display */
  icon: string;
  /** Label text below icon */
  label?: string;
  /** Called when button is pressed down */
  onPressIn?: () => void;
  /** Called when button is released */
  onPressOut?: () => void;
  /** Called on tap (for toggle buttons) */
  onPress?: () => void;
  /** Button size variant */
  size?: 'small' | 'medium' | 'large';
  /** Accent color override */
  accentColor?: string;
  /** Glow color override */
  glowColor?: string;
  /** Whether the button is in active/toggled state */
  isActive?: boolean;
  /** Custom container style */
  style?: ViewStyle;
  /** Custom icon style */
  iconStyle?: TextStyle;
  /** Whether button is circular */
  circular?: boolean;
}

export function ControlButton({
  icon,
  label,
  onPressIn,
  onPressOut,
  onPress,
  size = 'medium',
  accentColor = COLORS.accentPrimary,
  glowColor = COLORS.accentGlow,
  isActive = false,
  style,
  iconStyle,
  circular = false,
}: ControlButtonProps) {
  const buttonId = useId();
  const buttonRef = useRef<View>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const [pressed, setPressed] = useState(false);

  // Keep refs to latest callbacks so the registered handlers always call current versions
  const onPressInRef = useRef(onPressIn);
  onPressInRef.current = onPressIn;
  const onPressOutRef = useRef(onPressOut);
  onPressOutRef.current = onPressOut;
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  const multiTouch = useMultiTouch();

  const sizeConfig = SIZE_MAP[size];

  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.92,
        useNativeDriver: false,
        speed: 50,
        bounciness: 4,
      }),
      Animated.timing(glowAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: false,
      }),
    ]).start();
  }, [scaleAnim, glowAnim]);

  const animateOut = useCallback(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: false,
        speed: 30,
        bounciness: 6,
      }),
      Animated.timing(glowAnim, {
        toValue: isActive ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [isActive, scaleAnim, glowAnim]);

  // Stable callbacks that read from refs
  const handlePressIn = useCallback(() => {
    setPressed(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    animateIn();
    onPressInRef.current?.();
  }, [animateIn]);

  const handlePressOut = useCallback(() => {
    setPressed(false);
    animateOut();
    onPressOutRef.current?.();
    onPressRef.current?.();
  }, [animateOut]);

  // Register with MultiTouchArea
  useEffect(() => {
    multiTouch.registerButton(buttonId, buttonRef, handlePressIn, handlePressOut);
    return () => {
      multiTouch.unregisterButton(buttonId);
    };
  }, [buttonId, multiTouch, handlePressIn, handlePressOut]);

  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.borderSubtle, accentColor],
  });

  const shadowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.6],
  });

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          transform: [{ scale: scaleAnim }],
          shadowColor: accentColor,
          shadowOpacity: shadowOpacity as unknown as number,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 0 },
          elevation: 8,
        },
      ]}
    >
      <View
        ref={buttonRef}
        collapsable={false}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label ?? icon}
        accessibilityHint={onPressIn ? 'Press and hold to control the car' : 'Double tap to activate'}
        accessibilityState={{ selected: isActive, disabled: false }}
        onAccessibilityTap={() => {
          handlePressIn();
          handlePressOut();
        }}
        style={[
          styles.button,
          {
            width: sizeConfig.width,
            height: sizeConfig.height,
            borderRadius: circular
              ? sizeConfig.width / 2
              : BORDER_RADIUS.lg,
          },
          isActive && { backgroundColor: `${accentColor}15` },
          pressed && { backgroundColor: `${accentColor}10` },
          style,
        ]}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.glowBorder,
            {
              borderColor: borderColor as unknown as string,
              borderRadius: circular
                ? sizeConfig.width / 2
                : BORDER_RADIUS.lg,
            },
          ]}
        />
        <Text
          style={[
            styles.icon,
            { fontSize: sizeConfig.iconSize, color: accentColor },
            isActive && { textShadowColor: glowColor, textShadowRadius: 12 },
            iconStyle,
          ]}
        >
          {icon}
        </Text>
        {label && (
          <Text
            style={[
              styles.label,
              { color: isActive ? accentColor : COLORS.textSecondary },
            ]}
          >
            {label}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const SIZE_MAP = {
  small: { width: 56, height: 56, iconSize: 20 },
  medium: { width: 80, height: 80, iconSize: 32 },
  large: { width: 100, height: 100, iconSize: 40 },
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundCard,
    overflow: 'hidden',
  },
  glowBorder: {
    borderWidth: 1.5,
    position: 'absolute',
  },
  icon: {
    fontWeight: '700',
  },
  label: {
    ...TYPOGRAPHY.caption,
    marginTop: 4,
    color: COLORS.textSecondary,
  },
});
