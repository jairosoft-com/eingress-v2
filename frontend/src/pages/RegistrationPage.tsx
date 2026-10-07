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
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';

import eingressIcon from '../assets/icons/eingress-icon.png';

import { API_BASE_URL } from '../lib/api';

type RegistrationErrors = {
  department?: string;
  email?: string;
  fullName?: string;
  phoneNumber?: string;
  form?: string;
};

const departments = ['Employee', 'Student', 'Staff', 'Intern'];

function validateSingleField(
  fieldName: keyof RegistrationErrors,
  value: string,
): string | undefined {
  if (fieldName === 'fullName') {
    if (!value.trim()) return 'Full name is required.';
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ]+(?: [A-Za-zÀ-ÖØ-öø-ÿ]+)+$/.test(value.trim()))
      return 'Enter a valid full name.';
  }

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

  if (fieldName === 'department') {
    if (!value) return 'Department is required.';
  }

  return undefined;
}

function validateRegistrationForm(
  fullName: string,
  email: string,
  phoneNumber: string,
  department: string,
): RegistrationErrors {
  const errors: RegistrationErrors = {};

  if (!fullName.trim()) {
    errors.fullName = 'Full name is required.';
  } else if (!/^[A-Za-zÀ-ÖØ-öø-ÿ]+(?: [A-Za-zÀ-ÖØ-öø-ÿ]+)+$/.test(fullName.trim())) {
    errors.fullName = 'Enter a valid full name.';
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

  if (!department) {
    errors.department = 'Department is required.';
  }

  return errors;
}

export function RegistrationPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  // Holds only the 10-digit local part (9XXXXXXXXX); +63 is a fixed prefix, prepended on submit.
  const [phoneNumber, setPhoneNumber] = useState('');
  const [department, setDepartment] = useState('');
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationErrors = validateRegistrationForm(fullName, email, phoneNumber, department);
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
          fullName,
          department,
          email,
          phone: `+63${phoneNumber}`,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
        field?: string;
        request_code?: string;
      } | null;

      if (!response.ok) {
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
            fullName: data?.error || 'Existing user. This name is already registered.',
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
      setFullName('');
      setEmail('');
      setPhoneNumber('');
      setDepartment('');
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
            <label htmlFor="fullName">
              Full name <span aria-hidden="true">*</span>
            </label>
            <div className="google-input-shell">
              <UserRound size={20} aria-hidden="true" />
              <input
                aria-describedby={errors.fullName ? 'full-name-error' : undefined}
                aria-invalid={Boolean(errors.fullName)}
                autoComplete="name"
                id="fullName"
                name="fullName"
                onBlur={() => {
                  const error = validateSingleField('fullName', fullName);
                  setErrors((prev) => ({ ...prev, fullName: error }));
                }}
                onChange={(event) => {
                  const sanitized = event.target.value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ ]/g, '');
                  setFullName(sanitized);
                  if (errors.fullName && !validateSingleField('fullName', sanitized)) {
                    setErrors((prev) => ({ ...prev, fullName: undefined }));
                  }
                }}
                placeholder="Your answer"
                type="text"
                value={fullName}
              />
            </div>
            {errors.fullName ? (
              <span className="field-error" id="full-name-error">
                {errors.fullName}
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
            <label htmlFor="department">
              Department <span aria-hidden="true">*</span>
            </label>
            <div className="google-input-shell select-shell">
              <Building2 size={20} aria-hidden="true" />
              <select
                aria-describedby={errors.department ? 'department-error' : undefined}
                aria-invalid={Boolean(errors.department)}
                id="department"
                name="department"
                onChange={(event) => {
                  setDepartment(event.target.value);
                  const error = validateSingleField('department', event.target.value);
                  setErrors((prev) => ({ ...prev, department: error }));
                }}
                value={department}
              >
                <option value="">Choose department</option>
                {departments.map((departmentName) => (
                  <option key={departmentName} value={departmentName}>
                    {departmentName}
                  </option>
                ))}
              </select>
            </div>
            {errors.department ? (
              <span className="field-error" id="department-error">
                {errors.department}
              </span>
            ) : null}
          </section>

          <div className="registration-actions">
            <button
              className="gradient-button registration-submit"
              disabled={isSubmitting}
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
                setFullName('');
                setEmail('');
                setPhoneNumber('');
                setDepartment('');
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
