import {
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Globe2,
  Mail,
  Phone,
  Send,
  UserRound,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import eingressIcon from '../assets/icons/eingress-icon.png';

import { API_BASE_URL } from '../lib/api';

type RegistrationErrors = {
  email?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  role?: string;
  form?: string;
};

type RoleOption = {
  id: number;
  name: string;
};

function stripNonLetters(value: string) {
  return value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ '’-]/g, '');
}

function validateNamePart(label: string, value: string): string | undefined {
  if (!value.trim()) return `${label} is required.`;
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[ '’-][A-Za-zÀ-ÖØ-öø-ÿ]+)*$/.test(value.trim()))
    return `Enter a valid ${label.toLowerCase()}.`;
  return undefined;
}

function validateSingleField(
  fieldName: keyof RegistrationErrors,
  value: string,
): string | undefined {
  if (fieldName === 'firstName') return validateNamePart('First name', value);
  if (fieldName === 'lastName') return validateNamePart('Last name', value);

  if (fieldName === 'email') {
    if (!value.trim()) return 'Email address is required.';
    if (!/^[A-Za-z0-9]+(?:[._%+-][A-Za-z0-9]+)*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(value))
      return 'Enter a valid email address.';
  }

  if (fieldName === 'phoneNumber') {
    if (!value.trim()) return 'Phone number is required.';
    if (!/^9\d{9}$/.test(value.trim()))
      return 'Enter a valid 10-digit mobile number starting with 9.';
  }

  if (fieldName === 'role') {
    if (!value) return 'Role is required.';
  }

  return undefined;
}

function validateRegistrationForm(
  firstName: string,
  lastName: string,
  email: string,
  phoneNumber: string,
  role: string,
): RegistrationErrors {
  const errors: RegistrationErrors = {};

  const firstNameError = validateNamePart('First name', firstName);
  if (firstNameError) {
    errors.firstName = firstNameError;
  }

  const lastNameError = validateNamePart('Last name', lastName);
  if (lastNameError) {
    errors.lastName = lastNameError;
  }

  if (!email.trim()) {
    errors.email = 'Email address is required.';
  } else if (
    !/^[A-Za-z0-9]+(?:[._%+-][A-Za-z0-9]+)*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(email)
  ) {
    errors.email = 'Enter a valid email address.';
  }

  if (!phoneNumber.trim()) {
    errors.phoneNumber = 'Phone number is required.';
  } else if (!/^9\d{9}$/.test(phoneNumber.trim())) {
    errors.phoneNumber = 'Enter a valid 10-digit mobile number starting with 9.';
  }

  if (!role) {
    errors.role = 'Role is required.';
  }

  return errors;
}

export function RegistrationPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  // Holds only the 10-digit local part (9XXXXXXXXX); +63 is a fixed prefix, prepended on submit.
  const [phoneNumber, setPhoneNumber] = useState('');
  const [role, setRole] = useState('');
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState('');
  const [rolesRequest, setRolesRequest] = useState(0);
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    let isCurrentRequest = true;

    async function loadRoles() {
      setRolesLoading(true);
      setRolesError('');

      try {
        const response = await fetch(`${API_BASE_URL}/roles/active`);
        const data = (await response.json().catch(() => null)) as
          | RoleOption[]
          | { error?: string }
          | null;

        if (!response.ok) {
          const message = data && !Array.isArray(data) ? data.error : undefined;
          throw new Error(message || 'Role options could not be loaded.');
        }

        if (!Array.isArray(data)) {
          throw new Error('Role options could not be loaded.');
        }

        if (isCurrentRequest) {
          setRoles(data);
          setRole((currentRole) =>
            data.some((option) => option.name === currentRole) ? currentRole : '',
          );
        }
      } catch (error) {
        if (isCurrentRequest) {
          setRoles([]);
          setRole('');
          setRolesError(
            error instanceof Error ? error.message : 'Role options could not be loaded.',
          );
        }
      } finally {
        if (isCurrentRequest) setRolesLoading(false);
      }
    }

    void loadRoles();

    return () => {
      isCurrentRequest = false;
    };
  }, [rolesRequest]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationErrors = validateRegistrationForm(
      firstName,
      lastName,
      email,
      phoneNumber,
      role,
    );
    if (rolesLoading || roles.length === 0) {
      validationErrors.role =
        rolesError || 'No active roles are available. Please try again later.';
    }
    setErrors(validationErrors);
    setSuccessMessage('');

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch(`${API_BASE_URL}/enrollment-requests/public`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role,
          email,
          phone: `+63${phoneNumber}`,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
        errors?: {
          email?: string;
          firstName?: string;
          lastName?: string;
          phone?: string;
          role?: string;
        };
        field?: string;
        request_code?: string;
      } | null;

      if (!response.ok) {
        if (response.status === 400 && data?.errors) {
          const fieldErrors: RegistrationErrors = {
            email: data.errors.email,
            firstName: data.errors.firstName,
            lastName: data.errors.lastName,
            phoneNumber: data.errors.phone,
            role: data.errors.role,
          };

          if (Object.values(fieldErrors).some(Boolean)) {
            setErrors(fieldErrors);
            return;
          }
        }

        if (response.status === 409) {
          if (data?.field === 'rfidUid') {
            setErrors({
              form: data.error || 'Existing RFID. This ID is already registered.',
            });
            return;
          }

          if (data?.field === 'email') {
            setErrors({
              email: data.error || 'Existing email. This email address is already registered.',
            });
            return;
          }

          if (data?.field === 'phone') {
            setErrors({
              phoneNumber:
                data.error || 'Existing phone number. This phone number is already registered.',
            });
            return;
          }

          setErrors({
            lastName: data?.error || 'Existing user. This name is already registered.',
          });
          return;
        }

        throw new Error(data?.error || 'Registration could not be submitted.');
      }

      setSuccessMessage(
        data?.request_code
          ? `Registration submitted successfully. Reference: ${data.request_code}`
          : 'Registration submitted successfully.',
      );
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhoneNumber('');
      setRole('');
    } catch (error) {
      setErrors({
        form: error instanceof Error ? error.message : 'Registration could not be submitted.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="registration-screen" aria-labelledby="registration-title">
      <header className="registration-topbar">
        <Link className="auth-brand registration-brand" to="/login">
          <span className="logo-mark logo-mark-image" aria-hidden="true">
            <img src={eingressIcon} alt="" />
          </span>
          <strong>EINGRESS</strong>
        </Link>

        <div className="auth-actions">
          <button className="language-button" type="button">
            <Globe2 size={18} />
            English
            <ChevronDown size={16} />
          </button>
          <Link className="help-link" to="/login">
            <CircleHelp size={18} />
            Need help?
          </Link>
        </div>
      </header>

      <section className="registration-form-shell">
        <div className="registration-hero-card">
          <span>Employee Registration</span>
          <h1 id="registration-title">Enrollment Form</h1>
          <p>Submit your details for EINGRESS account and access verification.</p>
        </div>

        <form className="google-form" noValidate onSubmit={handleSubmit}>
          <section className="question-card">
            <label htmlFor="firstName">
              First name <span aria-hidden="true">*</span>
            </label>
            <div className="google-input-shell">
              <UserRound size={20} aria-hidden="true" />
              <input
                aria-describedby={errors.firstName ? 'first-name-error' : undefined}
                aria-invalid={Boolean(errors.firstName)}
                autoComplete="given-name"
                id="firstName"
                name="firstName"
                onBlur={() => {
                  const error = validateSingleField('firstName', firstName);
                  setErrors((prev) => ({ ...prev, firstName: error }));
                }}
                onChange={(event) => {
                  const sanitized = stripNonLetters(event.target.value);
                  setFirstName(sanitized);
                  if (errors.firstName && !validateSingleField('firstName', sanitized)) {
                    setErrors((prev) => ({ ...prev, firstName: undefined }));
                  }
                }}
                placeholder="Your answer"
                type="text"
                value={firstName}
              />
            </div>
            {errors.firstName ? (
              <span className="field-error" id="first-name-error">
                {errors.firstName}
              </span>
            ) : null}
          </section>

          <section className="question-card">
            <label htmlFor="lastName">
              Last name <span aria-hidden="true">*</span>
            </label>
            <div className="google-input-shell">
              <UserRound size={20} aria-hidden="true" />
              <input
                aria-describedby={errors.lastName ? 'last-name-error' : undefined}
                aria-invalid={Boolean(errors.lastName)}
                autoComplete="family-name"
                id="lastName"
                name="lastName"
                onBlur={() => {
                  const error = validateSingleField('lastName', lastName);
                  setErrors((prev) => ({ ...prev, lastName: error }));
                }}
                onChange={(event) => {
                  const sanitized = stripNonLetters(event.target.value);
                  setLastName(sanitized);
                  if (errors.lastName && !validateSingleField('lastName', sanitized)) {
                    setErrors((prev) => ({ ...prev, lastName: undefined }));
                  }
                }}
                placeholder="Your answer"
                type="text"
                value={lastName}
              />
            </div>
            {errors.lastName ? (
              <span className="field-error" id="last-name-error">
                {errors.lastName}
              </span>
            ) : null}
          </section>

          <section className="question-card">
            <label htmlFor="registrationEmail">
              Email <span aria-hidden="true">*</span>
            </label>
            <div className="google-input-shell">
              <Mail size={20} aria-hidden="true" />
              <input
                aria-describedby={errors.email ? 'registration-email-error' : undefined}
                aria-invalid={Boolean(errors.email)}
                autoComplete="email"
                id="registrationEmail"
                name="email"
                onBlur={() => {
                  const error = validateSingleField('email', email);
                  setErrors((prev) => ({ ...prev, email: error }));
                }}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (errors.email && !validateSingleField('email', event.target.value)) {
                    setErrors((prev) => ({ ...prev, email: undefined }));
                  }
                }}
                placeholder="name@example.com"
                type="email"
                value={email}
              />
            </div>
            {errors.email ? (
              <span className="field-error" id="registration-email-error">
                {errors.email}
              </span>
            ) : null}
          </section>

          <section className="question-card">
            <label htmlFor="phoneNumber">
              Phone Number <span aria-hidden="true">*</span>
            </label>
            <div className="google-input-shell">
              <Phone size={20} aria-hidden="true" />
              <span className="phone-prefix" id="phone-prefix-label">
                +63
              </span>
              <input
                aria-describedby={`phone-prefix-label${errors.phoneNumber ? ' phone-number-error' : ''}`}
                aria-invalid={Boolean(errors.phoneNumber)}
                autoComplete="tel-national"
                id="phoneNumber"
                inputMode="numeric"
                maxLength={10}
                name="phoneNumber"
                onBlur={() => {
                  const error = validateSingleField('phoneNumber', phoneNumber);
                  setErrors((prev) => ({ ...prev, phoneNumber: error }));
                }}
                onChange={(event) => {
                  const sanitized = event.target.value.replace(/\D/g, '').slice(0, 10);
                  setPhoneNumber(sanitized);
                  if (errors.phoneNumber && !validateSingleField('phoneNumber', sanitized)) {
                    setErrors((prev) => ({ ...prev, phoneNumber: undefined }));
                  }
                }}
                placeholder="9171234567"
                type="tel"
                value={phoneNumber}
              />
            </div>
            {errors.phoneNumber ? (
              <span className="field-error" id="phone-number-error">
                {errors.phoneNumber}
              </span>
            ) : null}
          </section>

          <section className="question-card">
            <label htmlFor="role">
              Role <span aria-hidden="true">*</span>
            </label>
            <div className="google-input-shell select-shell">
              <Building2 size={20} aria-hidden="true" />
              <select
                aria-describedby={errors.role ? 'role-error' : undefined}
                aria-invalid={Boolean(errors.role)}
                disabled={rolesLoading || roles.length === 0}
                id="role"
                name="role"
                onChange={(event) => {
                  setRole(event.target.value);
                  const error = validateSingleField('role', event.target.value);
                  setErrors((prev) => ({ ...prev, role: error }));
                }}
                value={role}
              >
                <option value="">
                  {rolesLoading
                    ? 'Loading roles...'
                    : roles.length
                      ? 'Choose role'
                      : 'No active roles available'}
                </option>
                {roles.map((roleOption) => (
                  <option key={roleOption.id} value={roleOption.name}>
                    {roleOption.name}
                  </option>
                ))}
              </select>
            </div>
            {rolesError ? (
              <span className="field-error" id="role-options-error" role="alert">
                {rolesError}{' '}
                <button
                  className="clear-form-button"
                  onClick={() => setRolesRequest((request) => request + 1)}
                  type="button"
                >
                  Retry
                </button>
              </span>
            ) : null}
            {!rolesLoading && !rolesError && roles.length === 0 ? (
              <span className="field-error" id="role-options-error" role="alert">
                No active roles are available. Registration cannot be submitted.
              </span>
            ) : null}
            {errors.role ? (
              <span className="field-error" id="role-error">
                {errors.role}
              </span>
            ) : null}
          </section>

          <div className="registration-actions">
            <button
              className="gradient-button registration-submit"
              disabled={isSubmitting || rolesLoading || roles.length === 0}
              type="submit"
            >
              {isSubmitting ? (
                <>
                  <span className="button-spinner" aria-hidden="true" />
                  Submitting
                </>
              ) : (
                <>
                  <Send size={18} />
                  Submit
                </>
              )}
            </button>

            <button
              className="clear-form-button"
              onClick={() => {
                setFirstName('');
                setLastName('');
                setEmail('');
                setPhoneNumber('');
                setRole('');
                setErrors({});
                setSuccessMessage('');
              }}
              type="button"
            >
              Clear form
            </button>
          </div>

          {successMessage ? (
            <div className="registration-success" role="status">
              <CheckCircle2 size={18} />
              {successMessage}
            </div>
          ) : null}

          {errors.form ? <span className="field-error form-error">{errors.form}</span> : null}
        </form>
      </section>
    </main>
  );
}
