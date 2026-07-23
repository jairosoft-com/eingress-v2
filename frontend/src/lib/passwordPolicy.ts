export const passwordRequirements = [
  { key: 'length', label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  {
    key: 'uppercase',
    label: 'One uppercase letter',
    test: (value: string) => /[A-Z]/.test(value),
  },
  {
    key: 'lowercase',
    label: 'One lowercase letter',
    test: (value: string) => /[a-z]/.test(value),
  },
  { key: 'number', label: 'One number', test: (value: string) => /[0-9]/.test(value) },
  {
    key: 'special',
    label: 'One special character',
    test: (value: string) => /[^A-Za-z0-9]/.test(value),
  },
] as const;

const strengthLevels = [
  { label: 'Weak', tone: 'weak' },
  { label: 'Fair', tone: 'fair' },
  { label: 'Good', tone: 'good' },
  { label: 'Strong', tone: 'strong' },
] as const;

export function getPasswordRequirementResults(password: string) {
  return passwordRequirements.map((requirement) => ({
    ...requirement,
    passed: requirement.test(password),
  }));
}

export function getPasswordStrength(score: number) {
  if (score <= 1) return { ...strengthLevels[0], filled: 1 };
  if (score <= 3) return { ...strengthLevels[1], filled: 2 };
  if (score === 4) return { ...strengthLevels[2], filled: 3 };
  return { ...strengthLevels[3], filled: 4 };
}

export function meetsPasswordPolicy(password: string) {
  return passwordRequirements.every((requirement) => requirement.test(password));
}
