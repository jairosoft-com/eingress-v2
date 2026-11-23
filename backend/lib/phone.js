// Collapses common Philippine phone formats to +63XXXXXXXXXX so "0917 123 4567", "9171234567"
// and "+63 917 123 4567" are recognised as the same number for duplicate-checking, and so the
// value saved is consistent regardless of how it was typed. A number that's already
// international under a different country code (e.g. +1 555 123 4567) is left exactly as
// submitted, as is anything that doesn't match a recognised PH shape (e.g. a landline).
export function normalizePhPhoneNumber(rawPhone) {
  const trimmed = String(rawPhone || '').trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');

  if (hasPlus && !trimmed.startsWith('+63')) {
    return trimmed;
  }

  if (trimmed.startsWith('+63') && digits.length === 12) {
    return `+${digits}`;
  }

  if (!hasPlus && digits.startsWith('63') && digits.length === 12) {
    return `+${digits}`;
  }

  if (!hasPlus && digits.startsWith('0') && digits.length === 11) {
    return `+63${digits.slice(1)}`;
  }

  if (!hasPlus && digits.length === 10 && digits.startsWith('9')) {
    return `+63${digits}`;
  }

  return trimmed;
}

export function validateOptionalPhPhone(rawPhone) {
  const trimmed = String(rawPhone ?? '').trim();

  if (!trimmed) {
    return { normalized: null, error: null };
  }

  const normalized = normalizePhPhoneNumber(trimmed);

  if (!/^\+639\d{9}$/.test(normalized)) {
    return {
      normalized: null,
      error: 'Enter a valid 10-digit mobile number starting with 9.',
    };
  }

  return { normalized, error: null };
}
