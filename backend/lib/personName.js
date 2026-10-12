const MAX_NAME_PART_LENGTH = 79;

function normalizePart(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function composeFullName(firstName, lastName) {
  return `${normalizePart(firstName)} ${normalizePart(lastName)}`.trim();
}

// Validates the firstName/lastName pair of a request body. `errors` is empty when valid.
export function validateNameParts(body) {
  const firstName = normalizePart(body?.firstName);
  const lastName = normalizePart(body?.lastName);
  const errors = {};

  if (!firstName) {
    errors.firstName = 'First name is required.';
  } else if (firstName.length > MAX_NAME_PART_LENGTH) {
    errors.firstName = `First name must be ${MAX_NAME_PART_LENGTH} characters or fewer.`;
  }

  if (!lastName) {
    errors.lastName = 'Last name is required.';
  } else if (lastName.length > MAX_NAME_PART_LENGTH) {
    errors.lastName = `Last name must be ${MAX_NAME_PART_LENGTH} characters or fewer.`;
  }

  return { firstName, lastName, errors };
}
