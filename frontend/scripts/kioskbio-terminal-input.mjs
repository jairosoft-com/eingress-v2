/* global URL, console */
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const publicDir = new URL('../public/', import.meta.url);
const kioskBioInputFile = new URL('kioskbio-input.json', publicDir);
let nonce = Date.now();

async function writeKioskBioInput({ fingerprintId = null } = {}) {
  nonce += 1;

  await mkdir(publicDir, { recursive: true });
  await writeFile(
    kioskBioInputFile,
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

await writeKioskBioInput();

const terminal = createInterface({ input, output });

console.log('KioskBio fingerprint terminal input');
console.log('Enter a fingerprint ID to simulate a scan.');
console.log('Type q to quit.');

async function handleAnswer(value) {
  const scanValue = value.trim();

  if (['q', 'quit', 'exit'].includes(scanValue.toLowerCase())) {
    return false;
  }

  if (!scanValue) {
    console.log('Invalid input. Enter a fingerprint ID.');
    return true;
  }

  await writeKioskBioInput({ fingerprintId: scanValue });
  console.log(`Sent fingerprint ID: ${scanValue}`);

  return true;
}

if (input.isTTY) {
  while (true) {
    const shouldContinue = await handleAnswer(await terminal.question('KioskBio input: '));

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

await writeKioskBioInput();
terminal.close();
