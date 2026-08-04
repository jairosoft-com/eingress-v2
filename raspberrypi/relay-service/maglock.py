#!/usr/bin/env python3

import os
import socket
import time
from threading import Timer
from gpiozero import OutputDevice, Button

# ----------------------------
# GPIO Configuration
# ----------------------------

RELAY_PIN = 17
BUTTON_PIN = 23

SOCKET_PATH = "/tmp/maglock.sock"

UNLOCK_DURATION = 8

relay = OutputDevice(
    RELAY_PIN,
    active_high=True,
    initial_value=False
)

emergency_btn = Button(
    BUTTON_PIN,
    pull_up=True
)

lock_timer = None
is_unlocked = False


# ----------------------------
# Door Control
# ----------------------------

def lock_door():
    global lock_timer
    global is_unlocked

    relay.off()
    is_unlocked = False
    lock_timer = None

    print("[MAGLOCK] Door LOCKED")


def unlock_door():
    global lock_timer
    global is_unlocked

    if is_unlocked:
        print("[MAGLOCK] Already unlocked")
        return

    is_unlocked = True

    relay.on()

    print(f"[MAGLOCK] Door UNLOCKED for {UNLOCK_DURATION} seconds")

    if lock_timer:
        lock_timer.cancel()

    lock_timer = Timer(
        UNLOCK_DURATION,
        lock_door
    )

    lock_timer.start()


# ----------------------------
# Emergency Button
# ----------------------------

last_button_state = False

def check_emergency_button():
    global last_button_state

    current_state = emergency_btn.is_pressed

    # Detect False -> True transition
    if current_state and not last_button_state:
        print("[MAGLOCK] Emergency button pressed")
        unlock_door()

    last_button_state = current_state


# ----------------------------
# Startup
# ----------------------------

relay.off()

if os.path.exists(SOCKET_PATH):
    os.remove(SOCKET_PATH)

server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
server.bind(SOCKET_PATH)
server.listen(1)

server.settimeout(0.1)

print("===================================")
print(" MAGLOCK SERVICE RUNNING")
print(" Waiting for UNLOCK commands...")
print("===================================")


# ----------------------------
# Main Loop
# ----------------------------

try:

    while True:

        # Check emergency button
        check_emergency_button()

        # Check Unix socket
        try:

            conn, _ = server.accept()

            with conn:

                command = conn.recv(1024).decode().strip()

                print("[MAGLOCK] Command:", command)

                if command == "UNLOCK":

                    unlock_door()

                    conn.sendall(b"OK")

                else:

                    conn.sendall(b"UNKNOWN")

        except socket.timeout:
            pass

        time.sleep(0.01)


finally:

    if lock_timer:
        lock_timer.cancel()

    relay.off()

    server.close()

    if os.path.exists(SOCKET_PATH):