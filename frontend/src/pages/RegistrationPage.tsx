import {
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Fingerprint,
  Globe2,
  Mail,
  Phone,
  Send,
  UserRound,
} from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';

function getApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

  if (
    typeof window === 'undefined' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  ) {
    return configuredUrl;
  }

  return configuredUrl.replace(
    /\/\/(localhost|127\.0\.0\.1)(?=:)/,
    `//${window.location.hostname}`,
  );
}

const API_BASE_URL = getApiBaseUrl();

type RegistrationErrors = {
  department?: string;
  email?: string;
  fullName?: string;
  phoneNumber?: string;
  form?: string;
};

const departments = ['Employee', 'Student', 'Staff', 'Intern'];

function validateRegistrationForm(
  fullName: string,
  email: string,
  phoneNumber: string,
  department: string,
): RegistrationErrors {
  const errors: RegistrationErrors = {};

  if (!fullName.trim()) {
    errors.fullName = 'Full name is required.';
  }

  if (!email.trim()) {
    errors.email = 'Email address is required.';
  } else if (!/^\S+@\S+\.\S+$/.test(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!phoneNumber.trim()) {
    errors.phoneNumber = 'Phone number is required.';
  } else if (!/^[+\d][\d\s().-]{7,}$/.test(phoneNumber.trim())) {
    errors.phoneNumber = 'Enter a valid phone number.';
  }

  if (!department) {
    errors.department = 'Department is required.';
  }

  return errors;
}

export function RegistrationPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
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
          phone: phoneNumber,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
        request_code?: string;
      } | null;

      if (!response.ok) {
        if (response.status === 409) {
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
          <span className="logo-mark" aria-hidden="true">
            <Fingerprint size={25} strokeWidth={2.4} />
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
                onChange={(event) => setFullName(event.target.value)}
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
                onChange={(event) => setEmail(event.target.value)}
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
              <input
                aria-describedby={errors.phoneNumber ? 'phone-number-error' : undefined}
                aria-invalid={Boolean(errors.phoneNumber)}
                autoComplete="tel"
                id="phoneNumber"
                name="phoneNumber"
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="+63 912 345 6789"
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
                onChange={(event) => setDepartment(event.target.value)}
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
