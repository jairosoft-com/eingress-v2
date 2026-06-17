let pendingEnrollmentFingerprintId = null;

export function setPendingEnrollmentFingerprintId(fingerprintId) {
  pendingEnrollmentFingerprintId = fingerprintId;
}

export function getPendingEnrollmentFingerprintId() {
  return pendingEnrollmentFingerprintId;
}

export function clearPendingEnrollmentFingerprintId() {
  pendingEnrollmentFingerprintId = null;
}
