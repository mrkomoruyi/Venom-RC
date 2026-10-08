# ESP32 RC Car Firmware

Arduino firmware for the ESP32 DevKit V1 that powers the Bluetooth-controlled RC car.

## Quick Start

1. Open `esp32_rc_car.ino` in the Arduino IDE
2. Install the **ESP32 board package** via Board Manager (`https://dl.espressif.com/dl/package_esp32_index.json`)
3. Select board: **ESP32 Dev Module**
4. Select your COM port
5. Upload

No external libraries are required — only the built-in `BluetoothSerial` library that ships with the ESP32 Arduino core.
Fully compatible with both **ESP32 Arduino Core 3.x+** and **2.x**.

## Wiring Diagram

```
                         ESP32 DevKit V1
                        ┌───────────────┐
                        │               │
          L298N #1 IN1 ←│ GPIO 27       │
          L298N #1 IN2 ←│ GPIO 26       │
     L298N #1 ENA (PWM)←│ GPIO 14       │
                        │               │
          L298N #2 IN3 ←│ GPIO 25       │
          L298N #2 IN4 ←│ GPIO 33       │
     L298N #2 ENB (PWM)←│ GPIO 32       │
                        │               │
         Buzzer (+)    ←│ GPIO 13       │
         Headlight LED ←│ GPIO 4        │
         [Onboard LED]  │ GPIO 2        │
                        │               │
      Buck converter   →│ VIN (5V reg)  │
                    GND ─│ GND          │
                        └───────────────┘
```

### Left Motor (L298N #1)

| L298N Pin | ESP32 GPIO | Purpose              |
|-----------|------------|----------------------|
| IN1       | 27         | Direction A          |
| IN2       | 26         | Direction B          |
| ENA       | 14         | PWM speed (LEDC ch0) |

### Right Motor (L298N #2)

| L298N Pin | ESP32 GPIO | Purpose              |
|-----------|------------|----------------------|
| IN3       | 25         | Direction A          |
| IN4       | 33         | Direction B          |
| ENB       | 32         | PWM speed (LEDC ch1) |

### Peripherals

| Component      | ESP32 GPIO | Notes                          |
|----------------|------------|--------------------------------|
| Buzzer         | 13         | PWM tone via LEDC ch2          |
| Headlight LEDs | 4          | Digital HIGH/LOW               |
| Status LED     | 2          | Onboard LED — heartbeat blink  |

### Power

- **Battery pack** (7–12 V) → L298N `VCC` / `12V` terminal
- L298N onboard **5 V regulator** → ESP32 `VIN` pin (remove the L298N 5V jumper if powering ESP32 separately via USB)
- All **GND** pins must be connected together (ESP32 + both L298N + buzzer + LEDs)

## Control Protocol

The React Native app sends single ASCII characters over Bluetooth Classic (SPP):

| Command | Action           | Left Motor | Right Motor |
|---------|------------------|------------|-------------|
| `F`     | Forward          | +FULL      | +FULL       |
| `B`     | Backward         | −FULL      | −FULL       |
| `L`     | Spin Left        | −SPIN      | +SPIN       |
| `R`     | Spin Right       | +SPIN      | −SPIN       |
| `G`     | Forward-Left     | +CURVE     | +FULL       |
| `I`     | Forward-Right    | +FULL      | +CURVE      |
| `H`     | Backward-Left    | −CURVE     | −FULL       |
| `J`     | Backward-Right   | −FULL      | −CURVE      |
| `S`     | Stop             | 0          | 0           |
| `V`     | Horn             | —          | —           |
| `1`     | Headlights ON    | —          | —           |
| `0`     | Headlights OFF   | —          | —           |

Speed values: `FULL=220`, `CURVE=100`, `SPIN=180` (out of 255).

## Safety Features

### Motion Watchdog (750 ms)
The app re-sends the active movement command every 250 ms while a direction is held. If the firmware doesn't receive a movement command within **750 ms**, it force-stops the motors. This covers:
- App crash / killed process
- Phone battery death
- Bluetooth link loss
- Phone moving out of range

### Horn Auto-off (300 ms)
The horn automatically silences after 300 ms to prevent a stuck buzzer if the Bluetooth connection drops while honking.

### Disconnect Safety
On Bluetooth disconnect event, motors are immediately stopped and the horn is silenced.

## Status LED Behavior

| State         | Pattern                     |
|---------------|-----------------------------|
| Booting       | Two short chirps from buzzer |
| BT Waiting    | Slow blink (500 ms)         |
| BT Connected  | Gentle heartbeat (2 s)       |
| BT Error      | Rapid blink (100 ms, stuck) |
| Client Joins  | 3 quick flashes             |

## Tuning

Edit these constants in the `.ino` file to adjust behavior:

```cpp
static const int SPEED_FULL    = 220;  // Max motor speed (0–255)
static const int SPEED_CURVE   = 100;  // Inner wheel speed during curves
static const int SPEED_SPIN    = 180;  // Speed during in-place turns

static const unsigned long WATCHDOG_TIMEOUT_MS = 750;  // Safety cutoff
static const int HORN_FREQ = 800;                      // Horn tone (Hz)
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Motors don't spin | Check ENA/ENB jumpers on L298N are removed and wired to ESP32 PWM pins |
| Car goes backwards when told forward | Swap IN1/IN2 or IN3/IN4 wires for that motor |
| Car turns wrong direction | Swap left/right motor wiring |
| Buzzer is silent | Verify passive buzzer (not active); check GPIO 13 connection |
| Can't find "ESP32_CAR" on phone | Ensure Bluetooth is on; try power-cycling ESP32 |
| Motors stop randomly | This is the watchdog — ensure app is sending commands every 250 ms |
