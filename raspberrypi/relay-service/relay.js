import { io } from "socket.io-client";
import EvdevReader from "evdev";
import net from "net";

const BACKEND_URL = "http://192.168.53.90:4000";
const RFID_DEVICE = "/dev/input/event5";
const MAGLOCK_SOCKET = "/tmp/maglock.sock";

// ------------------------------------
// Socket.IO Connection
// ------------------------------------

console.log(`Connecting to ${BACKEND_URL}...`);

const socket = io(BACKEND_URL);

socket.on("connect", () => {
  console.log("[Socket.IO] Connected! Socket ID:", socket.id);
});

socket.on("disconnect", (reason) => {
  console.log("[Socket.IO] Disconnected:", reason);
});

socket.on("connect_error", (err) => {
  console.error("[Socket.IO] Connection Error:", err.message);
});

// ------------------------------------
// Website -> Raspberry Pi Door Unlock
// ------------------------------------

socket.on("door:unlock", (data) => {
  console.log("");
  console.log("==============================");
  console.log("🚪 Door Unlock Request");
  console.log("User:", data.userName);
  console.log("Employee ID:", data.employeeId);
  console.log("==============================");
  console.log("");

  unlockMaglock();
});

// ------------------------------------
// Maglock Helper
// ------------------------------------

function unlockMaglock() {
  const client = net.createConnection(MAGLOCK_SOCKET);

  client.on("connect", () => {
    console.log("[MAGLOCK] Sending UNLOCK command...");
    client.write("UNLOCK");
  });

  client.on("data", (data) => {
    console.log("[MAGLOCK] Response:", data.toString());
    client.end();
  });

  client.on("error", (err) => {
    console.error("[MAGLOCK] Error:", err.message);
  });
}

// ------------------------------------
// RFID Reader
// ------------------------------------

const reader = new EvdevReader();

const device = reader.open(RFID_DEVICE);

console.log("[RFID] Reader opened:", RFID_DEVICE);

let uid = "";

const keyMap = {
  KEY_0: "0",
  KEY_1: "1",
  KEY_2: "2",
  KEY_3: "3",
  KEY_4: "4",
  KEY_5: "5",
  KEY_6: "6",
  KEY_7: "7",
  KEY_8: "8",
  KEY_9: "9",
};

device.on("EV_KEY", async (event) => {
  // Only key press
  if (event.value !== 1) return;

  console.log("[RFID] Key code:", event.code);

  // RFID finished
  if (event.code === "KEY_ENTER") {
    if (!uid) return;

    console.log("[RFID] UID detected:", uid);
    console.log("[RFID] Sending to backend...");

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/kiosk/rfid-scan`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rfidUid: uid,
          }),
        }
      );

      const data = await response.json();

      console.log("[Backend]", data);

      if (response.ok && data.result === "Granted") {
        console.log("");
        console.log("==============================");
        console.log("✅ ACCESS GRANTED");
        console.log("User:", data.userName);
        console.log("Employee ID:", data.employeeId);
        console.log("==============================");
        console.log("");

        unlockMaglock();
      } else {
        console.log("");
        console.log("==============================");
        console.log("❌ ACCESS DENIED");
        console.log(data.error);
        console.log("==============================");
        console.log("");
      }
    } catch (err) {
      console.error("[Backend Error]", err.message);
    }

    uid = "";
    return;
  }

  if (keyMap[event.code]) {
    uid += keyMap[event.code];
  }
});
