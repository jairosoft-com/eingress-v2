let pendingEnrollmentRfidUid = null;

export function setPendingEnrollmentFingerprintId(fingerprintId) {
  pendingEnrollmentRfidUid = fingerprintId;
}

export function getPendingEnrollmentFingerprintId() {
  return pendingEnrollmentRfidUid;
}

export function clearPendingEnrollmentFingerprintId() {
  pendingEnrollmentRfidUid = null;
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
