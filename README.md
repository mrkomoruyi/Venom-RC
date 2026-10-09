# RC Command

Android controller for an ESP32 Bluetooth Classic (SPP/RFCOMM) RC car. The UI
is landscape-first and supports simultaneous throttle and steering input via
ref-counted multi-touch.

## Run locally

```sh
npm ci
npm run android
```

The app requires a custom Android development build; it cannot use Expo Go
because it includes a native Bluetooth Classic module. Use `npm run simulate`
to start the included ESP32 protocol simulator while developing the UI.

## Control protocol

| Input | Command |
| --- | --- |
| Forward / reverse / steer left / steer right | `F` / `B` / `L` / `R` |
| Stop | `S` |
| Forward + steer left / forward + steer right | `G` / `I` |
| Reverse + steer left / reverse + steer right | `H` / `J` |
| Horn | `V` |
| Lights on / off | `1` / `0` |

## Safety contract for the ESP32 firmware

The phone sends a movement command every 250 ms while a direction is held and
sends `S` on release, backgrounding, unmount, disconnect, and conflicting
inputs. Firmware **must not rely on that alone**: it must start a 500–750 ms
watchdog after every movement command and stop motors if the deadline passes.
This covers a killed app, depleted battery, or lost Bluetooth radio link.

The app does **not** auto-reconnect on launch. Instead it loads the last-used
device name and shows a "Reconnect" button in the toolbar so the user is
always in control.

## Drivetrain configuration

The supplied ESP32 firmware is configured for two rear drive motors and one DC
steering motor. Both rear motors receive the same full-speed throttle command;
there is no differential speed reduction or skid steering. The steering motor
uses the unused B channel of L298N #1 (`IN3=GPIO 21`, `IN4=GPIO 22`,, not differential drive.
`ENB=GPIO 23`). See the [firmware wiring guide](firmware/esp32_rc_car/README.md)
before connecting the hardware.

## Development

For UI development without a physical Bluetooth device, swap the hook import
in `ControllerScreen.tsx`:

```ts
import { useMockBluetoothDevice as useBluetoothDevice } from '../hooks/useMockBluetoothDevice';
```

Alternatively, `npm run simulate` starts the included ESP32 protocol simulator
for end-to-end testing against the real Bluetooth stack.

## Quality checks

```sh
npm run typecheck
npm run lint
npm test
```

GitHub Actions runs all three checks for pushes and pull requests.

## Platform and privacy

Bluetooth Classic driving is supported on Android. Android 12+ requests only
nearby-device Bluetooth permissions; location is retained only for Android 11
and lower because their discovery API requires it.
