/**
 * Bluetooth command characters sent to ESP32 via Serial.
 *
 * Single directions:
 *   F = Forward, B = Backward, L = Left, R = Right, S = Stop
 *
 * Combined directions (simultaneous):
 *   G = Forward-Left, I = Forward-Right
 *   H = Backward-Left, J = Backward-Right
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
