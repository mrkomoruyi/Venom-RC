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
      Left rear, L298N #1 IN1 ←│ GPIO 27       │
      Left rear, L298N #1 IN2 ←│ GPIO 26       │
 Left rear, L298N #1 ENA (PWM)←│ GPIO 14       │
                        │               │
      Steering, L298N #1 IN3 ←│ GPIO 21       │
      Steering, L298N #1 IN4 ←│ GPIO 22       │
 Steering, L298N #1 ENB (PWM)←│ GPIO 23       │
                        │               │
     Right rear, L298N #2 IN3 ←│ GPIO 25       │
     Right rear, L298N #2 IN4 ←│ GPIO 33       │
Right rear, L298N #2 ENB (PWM)←│ GPIO 32       │
                        │               │
         Buzzer (+)    ←│ GPIO 13       │
         Headlight LED ←│ GPIO 4        │
         [Onboard LED]  │ GPIO 2        │
                        │               │
      Buck converter   →│ VIN (5V reg)  │
                    GND ─│ GND          │
                        └───────────────┘
```

### Left Rear Motor (L298N #1, channel A)

| L298N Pin | ESP32 GPIO | Purpose              |
|-----------|------------|----------------------|
| IN1       | 27         | Direction A          |
| IN2       | 26         | Direction B          |
| ENA       | 14         | PWM speed (LEDC ch0) |

### Steering Motor (L298N #1, channel B)

| L298N Pin | ESP32 GPIO | Purpose              |
|-----------|------------|----------------------|
| IN3       | 21         | Direction A          |
| IN4       | 22         | Direction B          |
| ENB       | 23         | PWM speed (LEDC ch3) |

Connect the steering DC motor to L298N #1 `OUT3` and `OUT4`. Swap those two
motor wires, or swap the direction pin states in firmware, if left/right is
reversed on your linkage.

### Right Rear Motor (L298N #2, channel B)

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

- **Battery pack** (7–12 V) → both L298N `VCC` / `12V` terminals
- L298N onboard **5 V regulator** → ESP32 `VIN` pin (remove the L298N 5V jumper if powering ESP32 separately via USB)
- All **GND** pins must be connected together (ESP32 + both L298N + buzzer + LEDs)

## Control Protocol

The React Native app sends single ASCII characters over Bluetooth Classic (SPP):

| Command | Action                   | Both Rear Motors | Steering Motor |
|---------|--------------------------|------------------|----------------|
| `F`     | Forward, wheels straight | +FULL            | Stop           |
| `B`     | Reverse, wheels straight | −FULL            | Stop           |
| `L`     | Steer left, stationary   | Stop             | Left           |
| `R`     | Steer right, stationary  | Stop             | Right          |
| `G`     | Forward + steer left     | +FULL            | Left           |
| `I`     | Forward + steer right    | +FULL            | Right          |
| `H`     | Reverse + steer left     | −FULL            | Left           |
| `J`     | Reverse + steer right    | −FULL            | Right          |
| `S`     | Stop all motors          | Stop             | Stop           |
| `V`     | Horn                     | —                | —              |
| `1`     | Headlights ON            | —                | —              |
| `0`     | Headlights OFF           | —                | —              |

`FULL=255` (out of 255) is applied equally to both rear motors. There is no
differential speed reduction during turns. `STEERING_SPEED=180` is independent
and can be tuned for your steering gearbox.

> **Steering safety:** A DC steering motor has no position feedback in this
> design. Use mechanical end stops and preferably normally-closed limit
> switches on the steering linkage so a held button cannot stall the motor at
> full lock. The firmware stops steering when the button is released or its
> 750 ms control lease expires.

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
static const int SPEED_FULL     = 255;  // Both rear motors (0–255)
static const int STEERING_SPEED = 180;  // Steering motor (0–255)

static const unsigned long WATCHDOG_TIMEOUT_MS = 750;  // Safety cutoff
static const int HORN_FREQ = 800;                      // Horn tone (Hz)
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| A motor doesn't spin | Check its ENA/ENB jumper is removed and its PWM pin is wired to the ESP32 |
| Car goes backwards when told forward | Swap the affected rear motor's direction wires or IN pin states |
| Steering turns the wrong way | Swap the steering motor's OUT3/OUT4 wires, or reverse the steering IN3/IN4 states |
| Buzzer is silent | Verify passive buzzer (not active); check GPIO 13 connection |
| Can't find "ESP32_CAR" on phone | Ensure Bluetooth is on; try power-cycling ESP32 |
| Motors stop randomly | This is the watchdog — ensure app is sending commands every 250 ms |
