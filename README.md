# RC Command

Android controller for an ESP32 Bluetooth Classic (SPP/RFCOMM) RC car. The UI
is landscape-first and supports simultaneous throttle and steering input.

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
| Forward / reverse / left / right | `F` / `B` / `L` / `R` |
| Stop | `S` |
| Forward-left / forward-right | `G` / `I` |
| Reverse-left / reverse-right | `H` / `J` |
| Horn | `V` |
| Lights on / off | `1` / `0` |

## Safety contract for the ESP32 firmware

The phone sends a movement command every 250 ms while a direction is held and
sends `S` on release, backgrounding, unmount, disconnect, and conflicting
inputs. Firmware **must not rely on that alone**: it must start a 500–750 ms
watchdog after every movement command and stop motors if the deadline passes.
This covers a killed app, depleted battery, or lost Bluetooth radio link.

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
