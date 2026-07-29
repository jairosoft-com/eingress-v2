import os
import sys
from threading import Timer

import requests
from gpiozero import OutputDevice, Button

# --- Backend connection ---
# EINGRESS_API_URL should point at the backend's LAN address, e.g. http://192.168.1.20:4000
API_BASE_URL = os.environ.get("EINGRESS_API_URL", "http://localhost:4000").rstrip("/")
# Numeric id from the `devices` table (see devices.id in schema.sql). Optional -
# access still works without it, but access_logs.device_id will be left null.
DEVICE_ID = os.environ.get("EINGRESS_DEVICE_ID")
REQUEST_TIMEOUT = 4  # seconds

# --- GPIO Pin Setup ---
RELAY_PIN = 17
BUTTON_PIN = 27

relay = OutputDevice(RELAY_PIN, active_high=True, initial_value=False)
emergency_btn = Button(BUTTON_PIN, pull_up=True)

# Global state
lock_timer = None
UNLOCK_DURATION = 8  # Seconds to hold door open
is_unlocked = False  # Prevents accepting new inputs during the unlock window


def lock_door():
    """De-energizes relay coil -> NC contact remains closed -> 12V flows -> LOCKED"""
    global lock_timer, is_unlocked
    relay.off()
    is_unlocked = False
    lock_timer = None
    print("\n[STATUS] Magnetic Lock: LOCKED (Power ON)")
    print("Waiting for RFID scan (or 'q' to quit & leave unlocked): ", end="", flush=True)


def unlock_door():
    """Energizes relay coil -> NC contact opens -> 12V cut -> UNLOCKED for 8s"""
    global lock_timer, is_unlocked

    is_unlocked = True
    relay.on()
    print(f"\n[STATUS] Magnetic Lock: UNLOCKED! (Busy - Ignoring new inputs for {UNLOCK_DURATION}s)")

    lock_timer = Timer(UNLOCK_DURATION, lock_door)
    lock_timer.start()


def check_rfid_with_backend(rfid_uid):
    """
    Asks the EINGRESS backend whether this RFID belongs to an active, non-expired
    user. Reuses the same /api/kiosk/rfid-scan endpoint the web kiosk uses, so
    every tap here also lands in access_logs, attendance, and the live admin
    dashboard feed - this script does not talk to Postgres directly.
    Returns (granted: bool, display_name: str | None).
    """
    payload = {"rfidUid": rfid_uid}
    if DEVICE_ID:
        payload["deviceId"] = int(DEVICE_ID)

    try:
        response = requests.post(
            f"{API_BASE_URL}/api/kiosk/rfid-scan",
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )
    except requests.RequestException as exc:
        print(f"\n[ERROR] Could not reach EINGRESS backend at {API_BASE_URL}: {exc}")
        return False, None

    if response.status_code == 404:
        # Card not found in the users table
        return False, None

    if response.status_code != 200:
        print(f"\n[ERROR] Unexpected backend response: {response.status_code} {response.text}")
        return False, None

    data = response.json()
    return data.get("result") == "Granted", data.get("userName")


def handle_rfid_scan(card_id):
    """Looks the card up against the database before unlocking anything."""
    if is_unlocked:
        print("\n[IGNORED] Door is currently unlocked (RFID input ignored).")
        return

    granted, user_name = check_rfid_with_backend(card_id)

    if not granted:
        who = user_name or card_id
        print(f"\n[ACCESS DENIED] {who} is not authorized.")
        return

    print(f"\n[ACCESS GRANTED] Welcome, {user_name}!")
    unlock_door()


def emergency_button_pressed():
    """Physical safety override - always unlocks locally, no backend round trip."""
    global is_unlocked

    if is_unlocked:
        print("\n[IGNORED] Door is currently unlocked (Emergency Button input ignored).")
        return

    print("\n[ACCESS GRANTED] Triggered by: Emergency Button")
    unlock_door()


emergency_btn.when_pressed = emergency_button_pressed


def start_rfid_listener():
    print("=" * 50)
    print("      RFID & EMERGENCY ACCESS SYSTEM ONLINE      ")
    print("=" * 50)
    print(f"Backend: {API_BASE_URL}")
    print("Status: Door is LOCKED.")
    print("Type 'q' or 'quit' anytime to exit and leave UNLOCKED.\n")

    while True:
        try:
            card_id = input("Waiting for RFID scan (or 'q' to quit): ").strip()

            if card_id.lower() in ["q", "quit", "exit"]:
                print("\n[EXIT] Drive pin HIGH -> Door permanently UNLOCKED.")

                if lock_timer is not None:
                    lock_timer.cancel()

                relay.on()
                relay.pin.close = lambda: None

                print("Exiting program to terminal. Lock remains UNLOCKED.")
                sys.exit(0)

            if card_id:
                handle_rfid_scan(card_id)

        except (EOFError, KeyboardInterrupt):
            print("\nExiting program via KeyboardInterrupt...")
            break


if __name__ == "__main__":
    try:
        relay.off()
        is_unlocked = False
        start_rfid_listener()
    finally:
        if lock_timer is not None:
            lock_timer.cancel()
