/* global URL, console */
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const publicDir = new URL('../public/', import.meta.url);
const kioskInputFile = new URL('kiosk-input.json', publicDir);
let nonce = Date.now();

async function writeKioskInput({ biometricCaptured = false, fingerprintId = null, rfidUid = null } = {}) {
  nonce += 1;

  await mkdir(publicDir, { recursive: true });
  await writeFile(
    kioskInputFile,
    `${JSON.stringify(
      {
        biometricCaptured,
        fingerprintId,
        rfidUid,
        nonce,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}

await writeKioskInput();

const terminal = createInterface({ input, output });

console.log('Kiosk fingerprint terminal input');
console.log('Enter a fingerprint ID from the database, such as FP01 or FP-EMP001.');
console.log('After an unrecognized fingerprint, enter the admin RFID or rfid:<admin-rfid>.');
console.log('After admin RFID is accepted, enter rfid:<new-user-rfid> to capture the RFID UID.');
console.log('Type q to quit.');

async function handleAnswer(value) {
  const scanValue = value.trim();

  if (['q', 'quit', 'exit'].includes(scanValue.toLowerCase())) {
    return false;
  }

  if (!scanValue) {
    console.log('Invalid input. Enter a fingerprint ID, admin RFID, or rfid:<rfid-uid>.');
    return true;
  }

  if (scanValue.toLowerCase().startsWith('rfid:')) {
    const rfidUid = scanValue.slice(5).trim();

    if (!rfidUid) {
      console.log('Invalid RFID input. Use rfid:<rfid-uid>.');
      return true;
    }

    await writeKioskInput({ rfidUid });
    console.log(`Sent RFID UID: ${rfidUid}`);
    return true;
  }

  await writeKioskInput({ fingerprintId: scanValue });
  console.log(`Sent fingerprint ID: ${scanValue}`);

  return true;
}

if (input.isTTY) {
  while (true) {
    const shouldContinue = await handleAnswer(await terminal.question('Kiosk input: '));

    if (!shouldContinue) {
      break;
    }
  }
} else {
  for await (const line of terminal) {
    const shouldContinue = await handleAnswer(line);

    if (!shouldContinue) {
      break;
    }
  }
}

await writeKioskInput();
terminal.close();
