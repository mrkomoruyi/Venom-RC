/**
 * ESP32 DevKit V1 — Bluetooth Classic RC Car Firmware
 * ====================================================
 *
 * Receives single-character commands over Bluetooth Classic (SPP/RFCOMM) from
 * the "RC Command" React Native controller app and drives two rear DC motors
 * at the same full throttle plus a separate DC steering motor.  The rear
 * motors are not used for differential or skid steering.
 *
 * Control Protocol (matches app's commands.ts):
 *   F = Rear motors forward, steering stopped
 *   B = Rear motors reverse, steering stopped
 *   L = Steer left, rear motors stopped
 *   R = Steer right, rear motors stopped
 *   G = Forward + steer left     I = Forward + steer right
 *   H = Reverse + steer left     J = Reverse + steer right
 *   S = Stop rear and steering motors
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
 * Motor Driver A (LEFT REAR motor — L298N #1, channel A):
 *   IN1  → GPIO 27    (direction pin A)
 *   IN2  → GPIO 26    (direction pin B)
 *   ENA  → GPIO 14    (PWM speed)
 *
 * Motor Driver A (STEERING motor — L298N #1, channel B):
 *   IN3  → GPIO 21    (direction pin A)
 *   IN4  → GPIO 22    (direction pin B)
 *   ENB  → GPIO 23    (PWM speed)
 *
 * Motor Driver B (RIGHT REAR motor — L298N #2, channel B):
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

// Rear-left motor (L298N #1, channel A)
static const int REAR_LEFT_IN1  = 27;   // Direction pin A
static const int REAR_LEFT_IN2  = 26;   // Direction pin B
static const int REAR_LEFT_ENA  = 14;   // PWM speed control

// Steering motor (L298N #1, channel B)
static const int STEERING_IN3 = 21;     // Direction pin A
static const int STEERING_IN4 = 22;     // Direction pin B
static const int STEERING_ENB = 23;     // PWM speed control

// Rear-right motor (L298N #2, channel B)
static const int REAR_RIGHT_IN3 = 25;   // Direction pin A
static const int REAR_RIGHT_IN4 = 33;   // Direction pin B
static const int REAR_RIGHT_ENB = 32;   // PWM speed control

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
static const int REAR_LEFT_PWM_CHANNEL = 0;
static const int REAR_RIGHT_PWM_CHANNEL = 1;
static const int BUZZER_PWM_CHANNEL = 2;
static const int STEERING_PWM_CHANNEL = 3;

// ──────────────────────────────────────────────
//  Motor Speed Profiles
// ──────────────────────────────────────────────
// Values 0–255 (8-bit PWM)
// Both rear motors always receive SPEED_FULL together; there is no differential.
static const int SPEED_FULL = 255;
// Tune to suit the steering gearbox/linkage. This does not affect rear throttle.
static const int STEERING_SPEED = 180;

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
 * Set the rear-left motor speed and direction.
 * @param speed  -255 to +255 (positive = forward, negative = reverse, 0 = stop)
 */
void setRearLeftMotor(int speed) {
  if (speed > 0) {
    digitalWrite(REAR_LEFT_IN1, HIGH);
    digitalWrite(REAR_LEFT_IN2, LOW);
    pwmWriteDuty(REAR_LEFT_ENA, REAR_LEFT_PWM_CHANNEL, constrain(speed, 0, 255));
  } else if (speed < 0) {
    digitalWrite(REAR_LEFT_IN1, LOW);
    digitalWrite(REAR_LEFT_IN2, HIGH);
    pwmWriteDuty(REAR_LEFT_ENA, REAR_LEFT_PWM_CHANNEL, constrain(-speed, 0, 255));
  } else {
    digitalWrite(REAR_LEFT_IN1, LOW);
    digitalWrite(REAR_LEFT_IN2, LOW);
    pwmWriteDuty(REAR_LEFT_ENA, REAR_LEFT_PWM_CHANNEL, 0);
  }
}

/**
 * Set the rear-right motor speed and direction.
 * @param speed  -255 to +255 (positive = forward, negative = reverse, 0 = stop)
 */
void setRearRightMotor(int speed) {
  if (speed > 0) {
    digitalWrite(REAR_RIGHT_IN3, HIGH);
    digitalWrite(REAR_RIGHT_IN4, LOW);
    pwmWriteDuty(REAR_RIGHT_ENB, REAR_RIGHT_PWM_CHANNEL, constrain(speed, 0, 255));
  } else if (speed < 0) {
    digitalWrite(REAR_RIGHT_IN3, LOW);
    digitalWrite(REAR_RIGHT_IN4, HIGH);
    pwmWriteDuty(REAR_RIGHT_ENB, REAR_RIGHT_PWM_CHANNEL, constrain(-speed, 0, 255));
  } else {
    digitalWrite(REAR_RIGHT_IN3, LOW);
    digitalWrite(REAR_RIGHT_IN4, LOW);
    pwmWriteDuty(REAR_RIGHT_ENB, REAR_RIGHT_PWM_CHANNEL, 0);
  }
}

/** Set the steering motor direction, or stop it at the current wheel position. */
void setSteeringMotor(int speed) {
  if (speed > 0) {
    digitalWrite(STEERING_IN3, HIGH);
    digitalWrite(STEERING_IN4, LOW);
    pwmWriteDuty(STEERING_ENB, STEERING_PWM_CHANNEL, constrain(speed, 0, 255));
  } else if (speed < 0) {
    digitalWrite(STEERING_IN3, LOW);
    digitalWrite(STEERING_IN4, HIGH);
    pwmWriteDuty(STEERING_ENB, STEERING_PWM_CHANNEL, constrain(-speed, 0, 255));
  } else {
    digitalWrite(STEERING_IN3, LOW);
    digitalWrite(STEERING_IN4, LOW);
    pwmWriteDuty(STEERING_ENB, STEERING_PWM_CHANNEL, 0);
  }
}

/** Drive both rear motors identically; this is deliberately non-differential. */
void setRearMotors(int speed) {
  setRearLeftMotor(speed);
  setRearRightMotor(speed);
}

/** Stop both rear motors and the steering motor immediately. */
void stopMotors() {
  setRearMotors(0);
  setSteeringMotor(0);
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
    case 'F':  // Forward, wheels straight
      setRearMotors(SPEED_FULL);
      setSteeringMotor(0);
      motorsRunning = true;
      lastMotionCommandMs = millis();
      break;

    case 'B':  // Reverse, wheels straight
      setRearMotors(-SPEED_FULL);
      setSteeringMotor(0);
      motorsRunning = true;
      lastMotionCommandMs = millis();
      break;

    case 'L':  // Steer left while stationary
      setRearMotors(0);
      setSteeringMotor(-STEERING_SPEED);
      motorsRunning = true;
      lastMotionCommandMs = millis();
      break;

    case 'R':  // Steer right while stationary
      setRearMotors(0);
      setSteeringMotor(STEERING_SPEED);
      motorsRunning = true;
      lastMotionCommandMs = millis();
      break;

    case 'G':  // Forward + steer left
      setRearMotors(SPEED_FULL);
      setSteeringMotor(-STEERING_SPEED);
      motorsRunning = true;
      lastMotionCommandMs = millis();
      break;

    case 'I':  // Forward + steer right
      setRearMotors(SPEED_FULL);
      setSteeringMotor(STEERING_SPEED);
      motorsRunning = true;
      lastMotionCommandMs = millis();
      break;

    case 'H':  // Reverse + steer left
      setRearMotors(-SPEED_FULL);
      setSteeringMotor(-STEERING_SPEED);
      motorsRunning = true;
      lastMotionCommandMs = millis();
      break;

    case 'J':  // Reverse + steer right
      setRearMotors(-SPEED_FULL);
      setSteeringMotor(STEERING_SPEED);
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
  pinMode(REAR_LEFT_IN1, OUTPUT);
  pinMode(REAR_LEFT_IN2, OUTPUT);
  pinMode(STEERING_IN3, OUTPUT);
  pinMode(STEERING_IN4, OUTPUT);
  pinMode(REAR_RIGHT_IN3, OUTPUT);
  pinMode(REAR_RIGHT_IN4, OUTPUT);

  digitalWrite(REAR_LEFT_IN1, LOW);
  digitalWrite(REAR_LEFT_IN2, LOW);
  digitalWrite(STEERING_IN3, LOW);
  digitalWrite(STEERING_IN4, LOW);
  digitalWrite(REAR_RIGHT_IN3, LOW);
  digitalWrite(REAR_RIGHT_IN4, LOW);

  // ── Configure PWM (LEDC) ──────────────────
#if USE_LEDC_V3
  // Core 3.x+ API: directly bind frequency and resolution to pins
  ledcAttach(REAR_LEFT_ENA, PWM_FREQ, PWM_RESOLUTION);
  ledcWrite(REAR_LEFT_ENA, 0);

  ledcAttach(REAR_RIGHT_ENB, PWM_FREQ, PWM_RESOLUTION);
  ledcWrite(REAR_RIGHT_ENB, 0);

  ledcAttach(STEERING_ENB, PWM_FREQ, PWM_RESOLUTION);
  ledcWrite(STEERING_ENB, 0);

  ledcAttach(BUZZER_PIN, HORN_FREQ, PWM_RESOLUTION);
  ledcWrite(BUZZER_PIN, 0);
#else
  // Core 2.x API: setup channel then attach to pin
  ledcSetup(REAR_LEFT_PWM_CHANNEL, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(REAR_LEFT_ENA, REAR_LEFT_PWM_CHANNEL);
  ledcWrite(REAR_LEFT_PWM_CHANNEL, 0);

  ledcSetup(REAR_RIGHT_PWM_CHANNEL, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(REAR_RIGHT_ENB, REAR_RIGHT_PWM_CHANNEL);
  ledcWrite(REAR_RIGHT_PWM_CHANNEL, 0);

  ledcSetup(STEERING_PWM_CHANNEL, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(STEERING_ENB, STEERING_PWM_CHANNEL);
  ledcWrite(STEERING_PWM_CHANNEL, 0);

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
  Serial.println("  Left rear: IN1=27, IN2=26, ENA=14 (L298N #1A)");
  Serial.println("  Steering: IN3=21, IN4=22, ENB=23 (L298N #1B)");
  Serial.println("  Right rear: IN3=25, IN4=33, ENB=32 (L298N #2B)");
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
