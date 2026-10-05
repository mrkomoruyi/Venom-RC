/**
 * Structured error codes for Bluetooth operations.
 *
 * These allow the hook and UI layers to distinguish between permission
 * denials, radio-off conditions, connection failures, and I/O errors
 * without parsing human-readable message strings.
 */

export type BluetoothErrorCode =
  | 'PERMISSION_DENIED'
  | 'RADIO_OFF'
  | 'CONNECTION_FAILED'
  | 'CONNECTION_LOST'
  | 'DISCOVERY_FAILED'
  | 'SEND_FAILED'
  | 'UNSUPPORTED_PLATFORM';
