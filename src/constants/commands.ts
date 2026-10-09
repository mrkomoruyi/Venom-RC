/**
 * Bluetooth command characters sent to ESP32 via Serial.
 *
 * Single directions:
 *   F = Forward, B = Backward, L = Steering left, R = Steering right, S = Stop
 *
 * Combined directions (simultaneous):
 *   G = Forward + steer left, I = Forward + steer right
 *   H = Backward + steer left, J = Backward + steer right
 *
 * The firmware drives both rear motors at the same full throttle. The left and
 * right directions operate a dedicated DC steering motor.
 */

export const COMMANDS = {
  FORWARD: 'F',
  BACKWARD: 'B',
  LEFT: 'L',
  RIGHT: 'R',
  STOP: 'S',
  FORWARD_LEFT: 'G',
  FORWARD_RIGHT: 'I',
  BACKWARD_LEFT: 'H',
  BACKWARD_RIGHT: 'J',
  HONK: 'V',
  LIGHTS_ON: '1',
  LIGHTS_OFF: '0',
} as const;

export type Command = (typeof COMMANDS)[keyof typeof COMMANDS];
