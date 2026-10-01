#!/usr/bin/env python3
"""
ESP32 Bluetooth Classic (SPP) RC Car Simulator
================================================
Simulates an ESP32 Bluetooth RC Car directly on Linux using BlueZ.

This allows end-to-end testing of the React Native RC Car app without physical hardware:
  - Phone scans and discovers this PC as "ESP32_CAR"
  - Phone connects via standard Bluetooth Serial Port Profile (SPP)
  - Controller button presses send real RFCOMM commands ('F', 'B', 'L', 'R', 'G', etc.)
  - Live ASCII dashboard visualizes car motion, motors, lights, and commands in real time!
"""

import sys
import os
import time
import signal
import select
import logging
import argparse
import threading
from datetime import datetime

# Setup debug file logger
LOG_FILE = "/tmp/esp32_simulator.log"
logging.basicConfig(
    filename=LOG_FILE,
    filemode="w",
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("ESP32_Sim")

try:
    import dbus
    import dbus.service
    import dbus.mainloop.glib
    from gi.repository import GLib
except ImportError as err:
    print(f"Error: Missing required Python libraries: {err}")
    print("Please install them with: sudo apt-get install python3-dbus python3-gi")
    sys.exit(1)

# UUID for standard Bluetooth Serial Port Profile (SPP)
SPP_UUID = "00001101-0000-1000-8000-00805f9b34fb"
BLUEZ_BUS_NAME = "org.bluez"
PROFILE_PATH = "/car/esp32/profile"
AGENT_PATH = "/car/esp32/agent"

# SDP Service Record XML advertising SPP on Channel 1
SPP_SERVICE_RECORD = """
<?xml version="1.0" encoding="UTF-8" ?>
<record>
  <attribute id="0x0001">
    <sequence>
      <uuid value="0x1101"/>
    </sequence>
  </attribute>
  <attribute id="0x0004">
    <sequence>
      <sequence>
        <uuid value="0x0100"/>
      </sequence>
      <sequence>
        <uuid value="0x0003"/>
        <uint8 value="1" name="channel"/>
      </sequence>
    </sequence>
  </attribute>
  <attribute id="0x0100">
    <text value="ESP32 Serial Port" name="name"/>
  </attribute>
</record>
"""

# Command mapping identical to app's COMMANDS constant
COMMAND_NAMES = {
    'F': ('FORWARD', '▲ Forward', (100, 100)),
    'B': ('BACKWARD', '▼ Reverse', (-100, -100)),
    'L': ('LEFT', '◄ Turn Left (Spin)', (-100, 100)),
    'R': ('RIGHT', 'Turn Right (Spin) ►', (100, -100)),
    'G': ('FORWARD_LEFT', '▲◄ Forward + Left Curve', (40, 100)),
    'I': ('FORWARD_RIGHT', '▲► Forward + Right Curve', (100, 40)),
    'H': ('BACKWARD_LEFT', '▼◄ Reverse + Left Curve', (-40, -100)),
    'J': ('BACKWARD_RIGHT', '▼► Reverse + Right Curve', (-100, -40)),
    'S': ('STOP', '■ Stopped', (0, 0)),
    '1': ('LIGHTS_ON', '💡 Headlights ON', None),
    '0': ('LIGHTS_OFF', '⚪ Headlights OFF', None),
    'V': ('HONK', '📯 Horn BEEP!', None),
}

class CarState:
    def __init__(self):
        self.connected = False
        self.client_name = "Waiting for phone..."
        self.client_addr = "N/A"
        self.direction = "STOP"
        self.direction_label = "■ Stopped"
        self.left_motor = 0    # -100 to +100
        self.right_motor = 0   # -100 to +100
        self.lights = False
        self.horn = False
        self.horn_timestamp = 0
        self.total_commands = 0
        self.history = []
        self.adapter_name = "ESP32_CAR"
        self.adapter_addr = "00:00:00:00:00:00"

    def handle_command(self, char):
        now = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        self.total_commands += 1
        logger.info(f"Received command: '{char}'")

        if char in COMMAND_NAMES:
            name, label, motors = COMMAND_NAMES[char]
            if char in ('1', '0'):
                self.lights = (char == '1')
                self.history.append((now, char, f"Headlights -> {'ON' if self.lights else 'OFF'}"))
            elif char == 'V':
                self.horn = True
                self.horn_timestamp = time.time()
                self.history.append((now, char, "Horn -> BEEP!"))
            else:
                self.direction = name
                self.direction_label = label
                if motors:
                    self.left_motor, self.right_motor = motors
                self.history.append((now, char, f"{name} ({label})"))
        elif char in ('\r', '\n', ' '):
            # Ignore whitespace / delimiter characters
            pass
        else:
            self.history.append((now, repr(char), "Unknown command byte"))

        # Keep history to last 8 lines
        if len(self.history) > 8:
            self.history = self.history[-8:]


class AutoPairingAgent(dbus.service.Object):
    """Auto-authorizes pairing and connection so user doesn't need to accept prompts."""
    @dbus.service.method("org.bluez.Agent1", in_signature="", out_signature="")
    def Release(self):
        logger.info("Agent released")

    @dbus.service.method("org.bluez.Agent1", in_signature="o", out_signature="")
    def RequestAuthorization(self, device):
        logger.info(f"Agent RequestAuthorization for {device}")
        return

    @dbus.service.method("org.bluez.Agent1", in_signature="os", out_signature="")
    def AuthorizeService(self, device, uuid):
        logger.info(f"Agent AuthorizeService {uuid} for {device}")
        return

    @dbus.service.method("org.bluez.Agent1", in_signature="ou", out_signature="")
    def RequestConfirmation(self, device, passkey):
        logger.info(f"Agent RequestConfirmation passkey={passkey} for {device}")
        return

    @dbus.service.method("org.bluez.Agent1", in_signature="o", out_signature="u")
    def RequestPasskey(self, device):
        logger.info(f"Agent RequestPasskey for {device}")
        return dbus.UInt32(0)

    @dbus.service.method("org.bluez.Agent1", in_signature="o", out_signature="s")
    def RequestPinCode(self, device):
        logger.info(f"Agent RequestPinCode for {device}")
        return "1234"

    @dbus.service.method("org.bluez.Agent1", in_signature="os", out_signature="")
    def DisplayPinCode(self, device, pincode):
        logger.info(f"Agent DisplayPinCode {pincode} for {device}")

    @dbus.service.method("org.bluez.Agent1", in_signature="ou", out_signature="")
    def DisplayPasskey(self, device, passkey):
        logger.info(f"Agent DisplayPasskey {passkey} for {device}")

    @dbus.service.method("org.bluez.Agent1", in_signature="", out_signature="")
    def Cancel(self):
        logger.info("Agent Cancel")


class SPPProfile(dbus.service.Object):
    """Registers Bluetooth Classic Serial Port Profile (SPP) with BlueZ."""
    def __init__(self, bus, path, on_connect_cb):
        super().__init__(bus, path)
        self.on_connect_cb = on_connect_cb

    @dbus.service.method("org.bluez.Profile1", in_signature="", out_signature="")
    def Release(self):
        logger.info("Profile released")

    @dbus.service.method("org.bluez.Profile1", in_signature="oha{sv}", out_signature="")
    def NewConnection(self, path, fd, properties):
        fd_num = fd.take()
        logger.info(f"Profile NewConnection: path={path}, fd={fd_num}, properties={properties}")
        self.on_connect_cb(path, fd_num)

    @dbus.service.method("org.bluez.Profile1", in_signature="o", out_signature="")
    def RequestDisconnection(self, path):
        logger.info(f"Profile RequestDisconnection: {path}")


def draw_motor_bar(val):
    """Draws a visual motor power bar: [-100% ... 0 ... +100%]"""
    width = 10
    if val > 0:
        bar = "■" * int((val / 100.0) * width)
        return f"\033[92m+{val:3d}% [ {bar:<10} ]\033[0m"
    elif val < 0:
        bar = "■" * int((abs(val) / 100.0) * width)
        return f"\033[91m{val:3d}% [ {bar:>10} ]\033[0m"
    else:
        return f"\033[90m   0% [    STOP    ]\033[0m"


def render_dashboard(state):
    """Clears and re-renders the terminal car telemetry display."""
    # Auto-turn off horn display after 0.5s
    if state.horn and (time.time() - state.horn_timestamp > 0.5):
        state.horn = False

    conn_status = "\033[92m● CONNECTED\033[0m" if state.connected else "\033[93m◌ WAITING FOR PHONE...\033[0m"
    lights_status = "\033[93m💡 ON \033[0m" if state.lights else "\033[90m⚪ OFF\033[0m"
    horn_status = "\033[91m📯 HONK!\033[0m" if state.horn else "\033[90m🔇 OFF  \033[0m"

    # Direction visual diagram
    fwd = " \033[92m▲ FWD\033[0m " if "FORWARD" in state.direction else "   ▲   "
    bwd = " \033[91m▼ REV\033[0m " if "BACKWARD" in state.direction else "   ▼   "
    lft = "\033[96m◄ LEFT\033[0m " if "LEFT" in state.direction else "◄ LEFT "
    rgt = " \033[96mRIGHT ►\033[0m" if "RIGHT" in state.direction else " RIGHT ►"

    out = []
    # Move cursor to home and hide cursor
    out.append("\033[H\033[?25l")
    out.append("\033[96m╔══════════════════════════════════════════════════════════════════════╗\033[0m\n")
    out.append(f"\033[96m║\033[0m            \033[1;97m🚗 ESP32 BLUETOOTH RC CAR SIMULATOR\033[0m                      \033[96m║\033[0m\n")
    out.append("\033[96m╠══════════════════════════════════════════════════════════════════════╣\033[0m\n")
    out.append(f"\033[96m║\033[0m Bluetooth Name : \033[1;33m{state.adapter_name:<16}\033[0m  Status : {conn_status:<28}\033[96m║\033[0m\n")
    out.append(f"\033[96m║\033[0m Local Address  : {state.adapter_addr:<16}  Client : \033[1;37m{state.client_name[:24]:<24}\033[0m\033[96m║\033[0m\n")
    out.append("\033[96m╠══════════════════════════════════════════════════════════════════════╣\033[0m\n")
    out.append("\033[96m║\033[0m  \033[1mCAR TELEMETRY & CONTROLS\033[0m                                             \033[96m║\033[0m\n")
    out.append(f"\033[96m║\033[0m      {fwd}              Active Command : \033[1;97m{state.direction_label:<20}\033[0m   \033[96m║\033[0m\n")
    out.append(f"\033[96m║\033[0m  {lft}   {rgt}          Headlights     : {lights_status}                 \033[96m║\033[0m\n")
    out.append(f"\033[96m║\033[0m      {bwd}              Horn           : {horn_status}                 \033[96m║\033[0m\n")
    out.append("\033[96m║\033[0m                                                                      \033[96m║\033[0m\n")
    out.append(f"\033[96m║\033[0m  Left Motor  (Track A): {draw_motor_bar(state.left_motor)}                               \033[96m║\033[0m\n")
    out.append(f"\033[96m║\033[0m  Right Motor (Track B): {draw_motor_bar(state.right_motor)}                               \033[96m║\033[0m\n")
    out.append("\033[96m╠══════════════════════════════════════════════════════════════════════╣\033[0m\n")
    out.append(f"\033[96m║\033[0m  \033[1mRECEIVED COMMAND LOG\033[0m (Total: {state.total_commands:4d})                              \033[96m║\033[0m\n")

    history_lines = state.history[-6:]
    for entry in history_lines:
        ts, char, desc = entry
        line_str = f"  [{ts}] ➜ '{char}' : {desc}"
        out.append(f"\033[96m║\033[0m  {line_str:<66}\033[96m║\033[0m\n")
    for _ in range(6 - len(history_lines)):
        out.append(f"\033[96m║\033[0m  {'':<66}\033[96m║\033[0m\n")

    out.append("\033[96m╚══════════════════════════════════════════════════════════════════════╝\033[0m\n")
    out.append("\033[90m  Logs: /tmp/esp32_simulator.log  |  Press Ctrl+C to exit\033[0m\n")

    sys.stdout.write("".join(out))
    sys.stdout.flush()


def main():
    parser = argparse.ArgumentParser(description="Simulate an ESP32 Bluetooth Car on Linux.")
    parser.add_argument("--name", default="ESP32_CAR", help="Bluetooth device name (default: ESP32_CAR)")
    parser.add_argument("--adapter", default="hci0", help="Bluetooth adapter to use (default: hci0)")
    args = parser.parse_args()

    # Unblock Bluetooth via rfkill if needed
    os.system("rfkill unblock bluetooth >/dev/null 2>&1")

    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
    bus = dbus.SystemBus()

    # Get Bluetooth adapter
    adapter_path = f"/org/bluez/{args.adapter}"
    try:
        adapter_obj = bus.get_object(BLUEZ_BUS_NAME, adapter_path)
    except Exception as e:
        print(f"Error finding adapter {args.adapter}: {e}")
        sys.exit(1)

    adapter_props = dbus.Interface(adapter_obj, "org.freedesktop.DBus.Properties")

    # Save original settings
    original_alias = str(adapter_props.Get("org.bluez.Adapter1", "Alias"))
    original_discoverable = bool(adapter_props.Get("org.bluez.Adapter1", "Discoverable"))
    adapter_addr = str(adapter_props.Get("org.bluez.Adapter1", "Address"))

    state = CarState()
    state.adapter_name = args.name
    state.adapter_addr = adapter_addr

    # Ensure adapter is powered, named, discoverable, and pairable
    adapter_props.Set("org.bluez.Adapter1", "Powered", dbus.Boolean(True))
    adapter_props.Set("org.bluez.Adapter1", "Alias", dbus.String(args.name))
    adapter_props.Set("org.bluez.Adapter1", "Discoverable", dbus.Boolean(True))
    adapter_props.Set("org.bluez.Adapter1", "DiscoverableTimeout", dbus.UInt32(0))
    adapter_props.Set("org.bluez.Adapter1", "Pairable", dbus.Boolean(True))

    logger.info(f"Adapter configured: Alias={args.name}, Address={adapter_addr}")

    # Setup Auto-Pairing Agent
    bluez_obj = bus.get_object(BLUEZ_BUS_NAME, "/org/bluez")
    agent_mgr = dbus.Interface(bluez_obj, "org.bluez.AgentManager1")
    agent = AutoPairingAgent(bus, AGENT_PATH)
    try:
        agent_mgr.RegisterAgent(AGENT_PATH, "NoInputNoOutput")
        agent_mgr.RequestDefaultAgent(AGENT_PATH)
        logger.info("Agent registered as default (NoInputNoOutput)")
    except Exception as e:
        logger.warning(f"RegisterAgent notice: {e}")

    # Connection handler
    def client_worker(client_path, fd_num):
        logger.info(f"client_worker started for {client_path} (fd={fd_num})")
        state.connected = True

        # Ensure the socket is in blocking mode so os.read waits for commands
        # instead of throwing BlockingIOError (EAGAIN) on idle sockets
        try:
            os.set_blocking(fd_num, True)
            logger.info(f"Socket fd={fd_num} set to blocking mode successfully")
        except Exception as e:
            logger.error(f"Failed to set blocking on fd={fd_num}: {e}")

        try:
            client_obj = bus.get_object(BLUEZ_BUS_NAME, client_path)
            c_props = dbus.Interface(client_obj, "org.freedesktop.DBus.Properties")
            state.client_name = str(c_props.Get("org.bluez.Device1", "Name"))
            state.client_addr = str(c_props.Get("org.bluez.Device1", "Address"))
            logger.info(f"Client info: Name='{state.client_name}', Address='{state.client_addr}'")
        except Exception as e:
            state.client_name = "Connected Device"
            logger.warning(f"Could not read client properties: {e}")

        render_dashboard(state)

        # Read loop with select so we don't block forever and can cleanly detect EOF / disconnect
        try:
            while state.connected:
                # Wait up to 1 second for data to become readable
                rlist, _, xlist = select.select([fd_num], [], [fd_num], 1.0)
                if xlist:
                    logger.warning("Socket error in xlist")
                    break
                if not rlist:
                    # Timeout reached, still connected — loop again
                    continue

                data = os.read(fd_num, 64)
                if not data:
                    logger.info("Client closed connection (EOF)")
                    break

                text = data.decode("utf-8", errors="ignore")
                logger.debug(f"Raw data received: {repr(data)} -> '{text}'")
                for ch in text:
                    state.handle_command(ch)

                render_dashboard(state)
        except Exception as e:
            logger.error(f"Exception in client_worker loop: {e}", exc_info=True)
        finally:
            logger.info("Cleaning up disconnected client")
            state.connected = False
            state.direction = "STOP"
            state.direction_label = "■ Stopped"
            state.left_motor = 0
            state.right_motor = 0
            state.client_name = "Waiting for phone..."
            try:
                os.close(fd_num)
            except Exception:
                pass
            render_dashboard(state)

    def on_connect(path, fd_num):
        logger.info(f"on_connect callback invoked: path={path}, fd={fd_num}")
        t = threading.Thread(target=client_worker, args=(path, fd_num), daemon=True)
        t.start()

    # Register SPP Profile with custom ServiceRecord and channel 1
    profile_mgr = dbus.Interface(bluez_obj, "org.bluez.ProfileManager1")
    profile = SPPProfile(bus, PROFILE_PATH, on_connect)
    opts = {
        "ServiceRecord": SPP_SERVICE_RECORD,
        "Channel": dbus.UInt16(1),
        "Role": "server",
        "RequireAuthentication": False,
        "RequireAuthorization": False,
        "AutoConnect": False,
    }

    try:
        profile_mgr.RegisterProfile(PROFILE_PATH, SPP_UUID, opts)
        logger.info("SPP Profile registered with ServiceRecord & Channel=1")
    except Exception as e:
        logger.error(f"Failed to register profile: {e}", exc_info=True)
        print(f"Failed to register Bluetooth profile: {e}")
        sys.exit(1)

    loop = GLib.MainLoop()

    # Cleanup function
    def cleanup(*args):
        sys.stdout.write("\033[?25h\n\n")
        print("\033[93mRestoring Bluetooth settings...\033[0m")
        try:
            profile_mgr.UnregisterProfile(PROFILE_PATH)
        except Exception:
            pass
        try:
            agent_mgr.UnregisterAgent(AGENT_PATH)
        except Exception:
            pass
        try:
            adapter_props.Set("org.bluez.Adapter1", "Alias", dbus.String(original_alias))
            adapter_props.Set("org.bluez.Adapter1", "Discoverable", dbus.Boolean(original_discoverable))
        except Exception:
            pass
        logger.info("Cleanup complete. PC Bluetooth restored.")
        print(f"\033[92mDone! PC Bluetooth restored to '{original_alias}'.\033[0m")
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    # Initial display
    os.system("clear")
    render_dashboard(state)

    # Periodic timer to refresh dashboard (e.g. for horn timeout)
    def periodic_tick():
        render_dashboard(state)
        return True

    GLib.timeout_add(200, periodic_tick)

    try:
        loop.run()
    except KeyboardInterrupt:
        cleanup()

if __name__ == "__main__":
    main()
