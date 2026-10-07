/**
 * ESP32 DevKit V1 — Bluetooth Classic RC Car Firmware
 * ====================================================
 *
 * Receives single-character commands over Bluetooth Classic (SPP/RFCOMM) from
 * the "RC Command" React Native controller app and drives two TT geared motors
 * through individual L298N H-bridge drivers.
 *
 * Control Protocol (matches app's commands.ts):
 *   F = Forward           B = Backward
 *   L = Left (spin)       R = Right (spin)
 *   G = Forward-Left      I = Forward-Right
 *   H = Backward-Left     J = Backward-Right
 *   S = Stop
 *   V = Horn (momentary)
 *   1 = Headlights ON     0 = Headlights OFF
 *
 * Safety:
 *   The app sends the active command every 250 ms and sends 'S' on release,
 *   backgrounding, unmount, or disconnect. This firmware runs a 750 ms
 *   watchdog timer that stops motors if no movement command is received within
 *   the deadline, covering a killed app, dead battery, or lost BT link.
 *
 * Hardware — ESP32 DevKit V1 + 2× L298N + Buzzer + LEDs
 * ======================================================
 *
 * Motor Driver A (LEFT motor — L298N #1):
 *   IN1  → GPIO 27    (direction pin A)
 *   IN2  → GPIO 26    (direction pin B)
 *   ENA  → GPIO 14    (PWM speed)
 *
 * Motor Driver B (RIGHT motor — L298N #2):
 *   IN3  → GPIO 25    (direction pin A)
 *   IN4  → GPIO 33    (direction pin B)
 *   ENB  → GPIO 32    (PWM speed)
 *
 * Peripherals:
 *   Buzzer (horn)        → GPIO 13
 *   Headlight LEDs       → GPIO 4
 *   Status LED (onboard) → GPIO 2
 *
 * Compatibility:
 *   Supports both ESP32 Arduino Core 2.x and Core 3.x+ (LEDC API change).
 */

#include "BluetoothSerial.h"

#if __has_include(<esp_arduino_version.h>)
  #include <esp_arduino_version.h>
#endif

// Detect Arduino ESP32 Core major version (Core 3.0+ redesigned LEDC)
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  #define USE_LEDC_V3 1
#else
  #define USE_LEDC_V3 0
#endif

// ──────────────────────────────────────────────
//  Verify Bluetooth Classic is enabled
// ──────────────────────────────────────────────
#if !defined(CONFIG_BT_ENABLED) || !defined(CONFIG_BLUEDROID_ENABLED)
  #error "Bluetooth Classic is not enabled. Run `make menuconfig` or set CONFIG_BT_ENABLED in sdkconfig."
#endif

// ──────────────────────────────────────────────
//  Pin Assignments
// ──────────────────────────────────────────────

// Left motor (L298N #1)
static const int LEFT_IN1  = 27;   // Direction pin A
static const int LEFT_IN2  = 26;   // Direction pin B
static const int LEFT_ENA  = 14;   // PWM speed control

// Right motor (L298N #2)
static const int RIGHT_IN3 = 25;   // Direction pin A
static const int RIGHT_IN4 = 33;   // Direction pin B
static const int RIGHT_ENB = 32;   // PWM speed control

// Peripherals
static const int BUZZER_PIN     = 13;
static const int HEADLIGHT_PIN  = 4;   // Safe GPIO (avoided bootstrapping pin 12)
static const int STATUS_LED_PIN = 2;   // Built-in blue LED on DevKit V1

// ──────────────────────────────────────────────
//  PWM Configuration (LEDC)
// ──────────────────────────────────────────────
static const int PWM_FREQ       = 5000;  // 5 kHz — above audible motor whine
static const int PWM_RESOLUTION = 8;     // 0–255 duty cycle

// Legacy LEDC channels (only needed for Core 2.x)
static const int LEFT_PWM_CHANNEL   = 0;
static const int RIGHT_PWM_CHANNEL  = 1;
static const int BUZZER_PWM_CHANNEL = 2;

// ──────────────────────────────────────────────
//  Motor Speed Profiles
// ──────────────────────────────────────────────
// Values 0–255 (8-bit PWM)
static const int SPEED_FULL  = 220;  // ~86% duty — leaves headroom & kinder to TT gearboxes
static const int SPEED_CURVE = 100;  // ~39% duty — inner wheel during turn-while-driving
static const int SPEED_SPIN  = 180;  // ~70% duty — spot spin turn (wheels in opposite direction)

// ──────────────────────────────────────────────
//  Horn Configuration
// ──────────────────────────────────────────────
static const int HORN_FREQ        = 800;   // Hz — classic horn tone
static const int HORN_DURATION_MS = 300;   // Auto-off after this many ms

// ──────────────────────────────────────────────
//  Safety: Motion Watchdog
// ──────────────────────────────────────────────
// The app sends movement commands every 250 ms. If no command arrives within
// this timeout, assume signal loss and stop immediately.
static const unsigned long WATCHDOG_TIMEOUT_MS = 750;

// ──────────────────────────────────────────────
//  Status LED Blink Patterns
// ──────────────────────────────────────────────
static const unsigned long BLINK_DISCONNECTED_MS = 500;   // Slow blink (searching)
static const unsigned long BLINK_CONNECTED_MS    = 2000;  // Gentle heartbeat

// ──────────────────────────────────────────────
//  Global State
// ──────────────────────────────────────────────
BluetoothSerial SerialBT;

static unsigned long lastMotionCommandMs = 0;
static bool          motorsRunning       = false;
static bool          headlightsOn        = false;
static bool          hornActive          = false;
static unsigned long hornStartMs         = 0;

static unsigned long lastBlinkToggleMs   = 0;
static bool          statusLedState      = false;

// ──────────────────────────────────────────────
//  Cross-Version PWM Helpers (Core 2.x & 3.x)
// ──────────────────────────────────────────────

void pwmWriteDuty(int pin, int channel, int duty) {
#if USE_LEDC_V3
  ledcWrite(pin, duty);
#else
  ledcWrite(channel, duty);
#endif
}

void pwmToneSet(int pin, int channel, int freq) {
#if USE_LEDC_V3
  ledcWriteTone(pin, freq);
#else
  ledcWriteTone(channel, freq);
#endif
}

// ──────────────────────────────────────────────
//  Motor Control Helpers
// ──────────────────────────────────────────────

/**
 * Set the left motor speed and direction.
 * @param speed  -255 to +255 (positive = forward, negative = reverse, 0 = brake)
 */
void setLeftMotor(int speed) {
  if (speed > 0) {
    digitalWrite(LEFT_IN1, HIGH);
    digitalWrite(LEFT_IN2, LOW);
    pwmWriteDuty(LEFT_ENA, LEFT_PWM_CHANNEL, constrain(speed, 0, 255));
  } else if (speed < 0) {
    digitalWrite(LEFT_IN1, LOW);
    digitalWrite(LEFT_IN2, HIGH);
    pwmWriteDuty(LEFT_ENA, LEFT_PWM_CHANNEL, constrain(-speed, 0, 255));
  } else {
    // Active brake: both LOW + 0 PWM
    digitalWrite(LEFT_IN1, LOW);
    digitalWrite(LEFT_IN2, LOW);
    pwmWriteDuty(LEFT_ENA, LEFT_PWM_CHANNEL, 0);
  }
}

/**
 * Set the right motor speed and direction.
 * @param speed  -255 to +255 (positive = forward, negative = reverse, 0 = brake)
 */
void setRightMotor(int speed) {
  if (speed > 0) {
    digitalWrite(RIGHT_IN3, HIGH);
    digitalWrite(RIGHT_IN4, LOW);
    pwmWriteDuty(RIGHT_ENB, RIGHT_PWM_CHANNEL, constrain(speed, 0, 255));
  } else if (speed < 0) {
    digitalWrite(RIGHT_IN3, LOW);
    digitalWrite(RIGHT_IN4, HIGH);
    pwmWriteDuty(RIGHT_ENB, RIGHT_PWM_CHANNEL, constrain(-speed, 0, 255));
  } else {
    digitalWrite(RIGHT_IN3, LOW);
    digitalWrite(RIGHT_IN4, LOW);
    pwmWriteDuty(RIGHT_ENB, RIGHT_PWM_CHANNEL, 0);
  }
}

/** Stop both motors immediately. */
void stopMotors() {
  setLeftMotor(0);
  setRightMotor(0);
  motorsRunning = false;
}

// ──────────────────────────────────────────────
//  Horn Helpers
// ──────────────────────────────────────────────

void hornOn() {
  if (!hornActive) {
    pwmToneSet(BUZZER_PIN, BUZZER_PWM_CHANNEL, HORN_FREQ);
    hornActive = true;
    hornStartMs = millis();
  }
}

void hornOff() {
  pwmToneSet(BUZZER_PIN, BUZZER_PWM_CHANNEL, 0);
  pwmWriteDuty(BUZZER_PIN, BUZZER_PWM_CHANNEL, 0);
  hornActive = false;
}

// ──────────────────────────────────────────────
//  Bluetooth Callbacks
// ──────────────────────────────────────────────

void btCallback(esp_spp_cb_event_t event, esp_spp_cb_param_t *param) {
  switch (event) {
    case ESP_SPP_SRV_OPEN_EVT:
      Serial.println("[BT] Client connected");
      for (int i = 0; i < 3; i++) {
        digitalWrite(STATUS_LED_PIN, HIGH);
        delay(80);
        digitalWrite(STATUS_LED_PIN, LOW);
        delay(80);
      }
      break;

    case ESP_SPP_CLOSE_EVT:
      Serial.println("[BT] Client disconnected — stopping motors");
      stopMotors();
      hornOff();
      break;

    default:
      break;
  }
}

// ──────────────────────────────────────────────
//  Command Processor
// ──────────────────────────────────────────────

void processCommand(char cmd) {
  switch (cmd) {
    // ── Movement Commands ──────────────────
    case 'F':  // Forward
      setLeftMotor(SPEED_FULL);
      setRightMotor(SPEED_FULL);
      motorsRunning = true;
      lastMotionCommandMs = millis();
      break;

    case 'B':  // Backward
      setLeftMotor(-SPEED_FULL);
      setRightMotor(-SPEED_FULL);
      motorsRunning = true;
      lastMotionCommandMs = millis();
      break;

    case 'L':  // Left — spin in place
      setLeftMotor(-SPEED_SPIN);
      setRightMotor(SPEED_SPIN);
      motorsRunning = true;
      lastMotionCommandMs = millis();
      break;

    case 'R':  // Right — spin in place
      setLeftMotor(SPEED_SPIN);
      setRightMotor(-SPEED_SPIN);
      motorsRunning = true;
      lastMotionCommandMs = millis();
      break;

    case 'G':  // Forward-Left (curve)
      setLeftMotor(SPEED_CURVE);
      setRightMotor(SPEED_FULL);
      motorsRunning = true;
      lastMotionCommandMs = millis();
      break;

    case 'I':  // Forward-Right (curve)
      setLeftMotor(SPEED_FULL);
      setRightMotor(SPEED_CURVE);
      motorsRunning = true;
      lastMotionCommandMs = millis();
      break;

    case 'H':  // Backward-Left (curve)
      setLeftMotor(-SPEED_CURVE);
      setRightMotor(-SPEED_FULL);
      motorsRunning = true;
      lastMotionCommandMs = millis();
      break;

    case 'J':  // Backward-Right (curve)
      setLeftMotor(-SPEED_FULL);
      setRightMotor(-SPEED_CURVE);
      motorsRunning = true;
      lastMotionCommandMs = millis();
      break;

    case 'S':  // Stop
      stopMotors();
      break;

    // ── Peripheral Commands ────────────────
    case 'V':  // Horn
      hornOn();
      break;

    case '1':  // Headlights ON
      digitalWrite(HEADLIGHT_PIN, HIGH);
      headlightsOn = true;
      break;

    case '0':  // Headlights OFF
      digitalWrite(HEADLIGHT_PIN, LOW);
      headlightsOn = false;
      break;

    default:
      // Ignore newlines, carriage returns, spaces
      break;
  }
}

// ──────────────────────────────────────────────
//  Status LED
// ──────────────────────────────────────────────

void updateStatusLed() {
  unsigned long now = millis();
  unsigned long interval = SerialBT.hasClient()
    ? BLINK_CONNECTED_MS
    : BLINK_DISCONNECTED_MS;

  if (now - lastBlinkToggleMs >= interval) {
    statusLedState = !statusLedState;
    digitalWrite(STATUS_LED_PIN, statusLedState ? HIGH : LOW);
    lastBlinkToggleMs = now;
  }
}

// ──────────────────────────────────────────────
//  Setup
// ──────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(500);  // Allow USB-UART bridge to settle after reset
  Serial.println();
  Serial.println("=================================");
  Serial.println("  ESP32 RC Car — Booting...");
  Serial.println("=================================");

  // ── Configure motor direction pins ────────
  pinMode(LEFT_IN1, OUTPUT);
  pinMode(LEFT_IN2, OUTPUT);
  pinMode(RIGHT_IN3, OUTPUT);
  pinMode(RIGHT_IN4, OUTPUT);

  digitalWrite(LEFT_IN1, LOW);
  digitalWrite(LEFT_IN2, LOW);
  digitalWrite(RIGHT_IN3, LOW);
  digitalWrite(RIGHT_IN4, LOW);

  // ── Configure PWM (LEDC) ──────────────────
#if USE_LEDC_V3
  // Core 3.x+ API: directly bind frequency and resolution to pins
  ledcAttach(LEFT_ENA, PWM_FREQ, PWM_RESOLUTION);
  ledcWrite(LEFT_ENA, 0);

  ledcAttach(RIGHT_ENB, PWM_FREQ, PWM_RESOLUTION);
  ledcWrite(RIGHT_ENB, 0);

  ledcAttach(BUZZER_PIN, HORN_FREQ, PWM_RESOLUTION);
  ledcWrite(BUZZER_PIN, 0);
#else
  // Core 2.x API: setup channel then attach to pin
  ledcSetup(LEFT_PWM_CHANNEL, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(LEFT_ENA, LEFT_PWM_CHANNEL);
  ledcWrite(LEFT_PWM_CHANNEL, 0);

  ledcSetup(RIGHT_PWM_CHANNEL, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(RIGHT_ENB, RIGHT_PWM_CHANNEL);
  ledcWrite(RIGHT_PWM_CHANNEL, 0);

  ledcSetup(BUZZER_PWM_CHANNEL, HORN_FREQ, PWM_RESOLUTION);
  ledcAttachPin(BUZZER_PIN, BUZZER_PWM_CHANNEL);
  ledcWrite(BUZZER_PWM_CHANNEL, 0);
#endif

  // ── Configure peripheral pins ─────────────
  pinMode(HEADLIGHT_PIN, OUTPUT);
  digitalWrite(HEADLIGHT_PIN, LOW);

  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  // ── Start Bluetooth Classic ───────────────
  SerialBT.register_callback(btCallback);

  if (!SerialBT.begin("ESP32_CAR")) {
    Serial.println("[BT] ERROR: Failed to start Bluetooth!");
    while (true) {
      digitalWrite(STATUS_LED_PIN, HIGH);
      delay(100);
      digitalWrite(STATUS_LED_PIN, LOW);
      delay(100);
    }
  }

  Serial.println("[BT] Bluetooth started — device name: ESP32_CAR");
  Serial.println("[BT] Waiting for connection...");
  Serial.println();
  Serial.println("Pin Map:");
  Serial.println("  Left  Motor: IN1=27, IN2=26, ENA=14");
  Serial.println("  Right Motor: IN3=25, IN4=33, ENB=32");
  Serial.println("  Buzzer: 13  |  Headlights: 4  |  Status LED: 2");
  Serial.println();

  // Startup chirp
  pwmToneSet(BUZZER_PIN, BUZZER_PWM_CHANNEL, 1200);
  delay(90);
  pwmToneSet(BUZZER_PIN, BUZZER_PWM_CHANNEL, 0);
  pwmWriteDuty(BUZZER_PIN, BUZZER_PWM_CHANNEL, 0);
  delay(60);
  pwmToneSet(BUZZER_PIN, BUZZER_PWM_CHANNEL, 1600);
  delay(90);
  pwmToneSet(BUZZER_PIN, BUZZER_PWM_CHANNEL, 0);
  pwmWriteDuty(BUZZER_PIN, BUZZER_PWM_CHANNEL, 0);
}

// ──────────────────────────────────────────────
//  Main Loop
// ──────────────────────────────────────────────

void loop() {
  // ── Read incoming Bluetooth commands ──────
  while (SerialBT.available()) {
    char incoming = (char)SerialBT.read();
    processCommand(incoming);
    Serial.printf("[CMD] '%c' (0x%02X)\n", incoming, (uint8_t)incoming);
  }

  // ── Motion Watchdog ───────────────────────
  if (motorsRunning) {
    unsigned long elapsed = millis() - lastMotionCommandMs;
    if (elapsed >= WATCHDOG_TIMEOUT_MS) {
      Serial.println("[SAFETY] Watchdog timeout — stopping motors!");
      stopMotors();
    }
  }

  // ── Horn auto-off ─────────────────────────
  if (hornActive && (millis() - hornStartMs >= HORN_DURATION_MS)) {
    hornOff();
  }

  // ── Status LED heartbeat ──────────────────
  updateStatusLed();

  delay(1);
}
