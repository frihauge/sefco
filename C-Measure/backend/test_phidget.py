#!/usr/bin/env python3
"""
Test script for Phidget sensor connection.
Run this from command line to debug connection issues.
"""
import sys
import time

try:
    from Phidget22.Devices.VoltageRatioInput import VoltageRatioInput
    from Phidget22.PhidgetException import PhidgetException
    from Phidget22.Phidget import Phidget
    from Phidget22.Net import Net, PhidgetServerType
    print("[OK] Phidget22 library imported successfully")
except ImportError as e:
    print(f"[ERROR] Failed to import Phidget22: {e}")
    print("Install with: pip install Phidget22")
    sys.exit(1)

NUM_PORTS = 6
NUM_CHANNELS = 2

def on_attach(ph):
    port = ph.getHubPort()
    channel = ph.getChannel()
    serial = ph.getDeviceSerialNumber()
    print(f"[ATTACHED] Port {port}, Channel {channel}, Serial: {serial}")
    try:
        ph.setDataInterval(1000)
        ph.setVoltageRatioChangeTrigger(0.0)
        print(f"  -> DataInterval and ChangeTrigger configured")
    except Exception as e:
        print(f"  -> Config error: {e}")

def on_change(ph, value):
    port = ph.getHubPort()
    channel = ph.getChannel()
    print(f"[VALUE] Port {port}, Channel {channel}: {value:.6f}")

def on_error(ph, code, description):
    port = ph.getHubPort()
    channel = ph.getChannel()
    print(f"[ERROR] Port {port}, Channel {channel}: {description} (code {code})")

def main():
    print("\n=== Phidget Connection Test ===\n")

    # Try to enable server discovery
    print("Enabling server discovery for remote devices...")
    try:
        Net.enableServerDiscovery(PhidgetServerType.PHIDGETSERVER_DEVICEREMOTE)
        print("[OK] Server discovery enabled")
    except PhidgetException as e:
        print(f"[WARNING] Server discovery failed: {e}")
        print("         Make sure Phidget Network Server is running on the remote machine")

    # Create and open channels
    channels = []
    print(f"\nOpening {NUM_PORTS * NUM_CHANNELS} channels...")

    for port in range(NUM_PORTS):
        for channel in range(NUM_CHANNELS):
            try:
                ph = VoltageRatioInput()
                ph.setHubPort(port)
                ph.setIsHubPortDevice(0)
                ph.setChannel(channel)
                ph.setIsRemote(True)
                ph.setOnAttachHandler(on_attach)
                ph.setOnVoltageRatioChangeHandler(on_change)
                ph.setOnErrorHandler(on_error)
                channels.append(ph)

                print(f"  Opening Port {port}, Channel {channel}...", end=" ")
                ph.openWaitForAttachment(5000)
                print("OK")
            except PhidgetException as e:
                print(f"FAILED: {e}")
            except Exception as e:
                print(f"ERROR: {e}")

    # Wait for values
    print("\nWaiting for sensor values (Ctrl+C to stop)...")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n\nClosing channels...")

    # Close all channels
    for ph in channels:
        try:
            ph.close()
        except:
            pass

    print("Done.")

if __name__ == "__main__":
    main()
