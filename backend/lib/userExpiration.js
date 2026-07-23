const STUDENT_EXPIRY_DAYS = 7;

export function getDefaultExpirationForRole(role) {
  const normalizedRole = (role || '').trim().toLowerCase();

  if (normalizedRole !== 'student') {
    return null;
  }

  return new Date(Date.now() + STUDENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}
