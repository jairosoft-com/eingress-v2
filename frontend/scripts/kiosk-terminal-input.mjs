/* global URL, console */
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const publicDir = new URL('../public/', import.meta.url);
const kioskInputFile = new URL('kiosk-input.json', publicDir);
let nonce = Date.now();

async function writeKioskInput(fingerprintId) {
  nonce += 1;

  await mkdir(publicDir, { recursive: true });
  await writeFile(
    kioskInputFile,
    `${JSON.stringify(
      {
        fingerprintId,
        nonce,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}

await writeKioskInput(null);

const terminal = createInterface({ input, output });

console.log('Kiosk fingerprint terminal input');
console.log('Enter a fingerprint ID from the database, such as FP01 or FP-EMP001.');
console.log('Type q to quit.');

async function handleAnswer(value) {
  const fingerprintId = value.trim();

  if (['q', 'quit', 'exit'].includes(fingerprintId.toLowerCase())) {
    return false;
  }

  if (!fingerprintId) {
    console.log('Invalid input. Enter a fingerprint ID.');
    return true;
  }

  await writeKioskInput(fingerprintId);
  console.log(`Sent fingerprint ID: ${fingerprintId}`);

  return true;
}

if (input.isTTY) {
  while (true) {
    const shouldContinue = await handleAnswer(await terminal.question('Fingerprint ID: '));

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

await writeKioskInput(null);
terminal.close();
