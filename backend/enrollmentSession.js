let pendingEnrollmentFingerprintId = null;
let pendingEnrollmentRfidUid = null;

export function setPendingEnrollmentFingerprintId(fingerprintId) {
  pendingEnrollmentFingerprintId = fingerprintId;
}

export function getPendingEnrollmentFingerprintId() {
  return pendingEnrollmentFingerprintId;
}

export function clearPendingEnrollmentFingerprintId() {
  pendingEnrollmentFingerprintId = null;
}

export function setPendingEnrollmentRfidUid(rfidUid) {
  pendingEnrollmentRfidUid = rfidUid;
}

export function getPendingEnrollmentRfidUid() {
  return pendingEnrollmentRfidUid;
}

export function clearPendingEnrollmentRfidUid() {
  pendingEnrollmentRfidUid = null;
}
