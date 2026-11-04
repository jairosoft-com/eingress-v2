import {
  Check,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  Home,
  Lock,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { API_BASE_URL } from '../lib/api';
import { getPasswordRequirementResults, getPasswordStrength } from '../lib/passwordPolicy';

const infoFeatures = [
  {
    Icon: ShieldCheck,
    label: 'Strengthen your account security',
    tone: 'red',
  },
  {
    Icon: Lock,
    label: 'Protect your personal information',
    tone: 'dark',
  },
  {
    Icon: Clock3,
    label: 'Ensure only you have access',
    tone: 'red',
  },
  {
    Icon: ShieldCheck,
    label: 'Recommended to change password regularly',
    tone: 'dark',
  },
] as const;

type ChangePasswordErrors = {
  confirmPassword?: string;
  currentPassword?: string;
  form?: string;
  newPassword?: string;
};

export function ChangePasswordPage() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<ChangePasswordErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [hasValidatedNewPassword, setHasValidatedNewPassword] = useState(false);
  const [hasValidatedConfirmPassword, setHasValidatedConfirmPassword] = useState(false);
  const currentPasswordValidationRequest = useRef(0);

  const requirementResults = useMemo(
    () => getPasswordRequirementResults(newPassword),
    [newPassword],
  );
  const passedCount = requirementResults.filter((requirement) => requirement.passed).length;
  const strength = getPasswordStrength(newPassword ? passedCount : 0);
  const newPasswordError = (password: string) => {
    if (!password) {
      return 'New password is required.';
    }

    const unmetRequirements = getPasswordRequirementResults(password)
      .filter((requirement) => !requirement.passed)
      .map((requirement) => requirement.label);

    return unmetRequirements.length > 0
      ? `Password must meet these requirements: ${unmetRequirements.join(', ')}.`
      : undefined;
  };

  async function validateCurrentPassword(password: string) {
    const requestId = ++currentPasswordValidationRequest.current;

    if (!password) {
      setErrors((current) => ({
        ...current,
        currentPassword: 'Current password is required.',
      }));
      return;
    }

    if (!session?.accessToken) {
      setErrors((current) => ({
        ...current,
        form: 'Unable to validate current password. Please sign in again.',
      }));
      return;
    }

    setErrors((current) => {
      const next = { ...current };
      delete next.currentPassword;
      return next;
    });

    try {
      const response = await fetch(`${API_BASE_URL}/auth/validate-current-password`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentPassword: password }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        errors?: ChangePasswordErrors;
      } | null;

      if (requestId !== currentPasswordValidationRequest.current) {
        return;
      }

      if (!response.ok) {
        setErrors((current) => ({
          ...current,
          ...(data?.errors ?? { form: data?.error || 'Unable to validate current password.' }),
        }));
      }
    } catch {
      if (requestId === currentPasswordValidationRequest.current) {
        setErrors((current) => ({
          ...current,
          form: 'Unable to validate current password. Please try again.',
        }));
      }
    }
  }

  function validateNewPassword(password: string) {
    setErrors((current) => ({
      ...current,
      newPassword: newPasswordError(password),
    }));
  }

  function validateConfirmPassword(password: string, confirmation: string) {
    setErrors((current) => ({
      ...current,
      confirmPassword: !confirmation
        ? 'Please confirm your new password.'
        : password !== confirmation
          ? 'Passwords do not match.'
          : undefined,
    }));
  }

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      signOut();
      navigate('/login', { replace: true });
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [navigate, signOut, successMessage]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationErrors: ChangePasswordErrors = {};

    if (!currentPassword) {
      validationErrors.currentPassword = 'Current password is required.';
    }

    const passwordError = newPasswordError(newPassword);
    if (passwordError) {
      validationErrors.newPassword = passwordError;
    }

    if (!confirmPassword) {
      validationErrors.confirmPassword = 'Please confirm your new password.';
    } else if (newPassword !== confirmPassword) {
      validationErrors.confirmPassword = 'Passwords do not match.';
    }

    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      if (currentPassword && session?.accessToken) {
        await validateCurrentPassword(currentPassword);
      }
      return;
    }

    if (!session?.accessToken) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
        errors?: ChangePasswordErrors;
        message?: string;
      } | null;

      if (!response.ok) {
        const message = data?.error || 'Unable to update password.';

        setErrors(data?.errors ?? { form: message });
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMessage(data?.message || 'Password updated successfully.');
    } catch {
      setErrors({ form: 'Unable to update password. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="module-page change-password-page">
      <nav aria-label="Breadcrumb" className="page-breadcrumb">
        <Link to="/dashboard">
          <Home size={14} />
          Home
        </Link>
        <ChevronRight size={14} />
        <Link to="/settings">Settings</Link>
        <ChevronRight size={14} />
        <span>Change Password</span>
      </nav>

      <header className="module-header">
        <h1>Change Password</h1>
      </header>

      <div className="change-password-grid">
        <section className="module-panel password-info-card">
          <h2>
            Keep Your Account <span>Secure</span>
          </h2>
          <p>Update your password regularly to protect your account from unauthorized access.</p>

          <ul className="password-info-features">
            {infoFeatures.map(({ Icon, label, tone }) => (
              <li key={label}>
                <span className={`password-info-icon ${tone}`} aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="module-panel password-form-card">
          <h2>Update Your Password</h2>
          <p>Enter your current password and choose a new one.</p>

          <form className="login-form" noValidate onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="currentPassword">Current Password</label>
              <div className="input-shell compact-input">
                <LockKeyhole size={18} aria-hidden="true" />
                <input
                  aria-describedby={errors.currentPassword ? 'current-password-error' : undefined}
                  aria-invalid={Boolean(errors.currentPassword)}
                  autoComplete="current-password"
                  id="currentPassword"
                  name="currentPassword"
                  onBlur={(event) => void validateCurrentPassword(event.target.value)}
                  onChange={(event) => {
                    currentPasswordValidationRequest.current += 1;
                    setCurrentPassword(event.target.value);
                    setErrors((current) => {
                      const next = { ...current };
                      delete next.currentPassword;
                      delete next.form;
                      return next;
                    });
                  }}
                  placeholder="Enter your current password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                />
                <button
                  aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
                  className="input-icon-button"
                  onClick={() => setShowCurrentPassword((current) => !current)}
                  type="button"
                >
                  {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.currentPassword ? (
                <span className="field-error" id="current-password-error">
                  {errors.currentPassword}
                </span>
              ) : null}
            </div>

            <div className="form-field">
              <label htmlFor="newPassword">New Password</label>
              <div className="input-shell compact-input">
                <LockKeyhole size={18} aria-hidden="true" />
                <input
                  aria-describedby={errors.newPassword ? 'new-password-error' : undefined}
                  aria-invalid={Boolean(errors.newPassword)}
                  autoComplete="new-password"
                  id="newPassword"
                  name="newPassword"
                  onBlur={(event) => {
                    setHasValidatedNewPassword(true);
                    validateNewPassword(event.target.value);
                  }}
                  onChange={(event) => {
                    const value = event.target.value;
                    setNewPassword(value);
                    if (hasValidatedNewPassword) {
                      validateNewPassword(value);
                    }
                    if (hasValidatedConfirmPassword) {
                      validateConfirmPassword(value, confirmPassword);
                    }
                  }}
                  placeholder="Enter your new password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                />
                <button
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  className="input-icon-button"
                  onClick={() => setShowNewPassword((current) => !current)}
                  type="button"
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="password-strength-meter" aria-hidden={!newPassword}>
                <div className="password-strength-bar">
                  {[0, 1, 2, 3].map((segment) => (
                    <span
                      className={
                        newPassword && segment < strength.filled ? `filled ${strength.tone}` : ''
                      }
                      key={segment}
                    />
                  ))}
                </div>
                {newPassword ? (
                  <span className="password-strength-label">
                    Password strength: <strong className={strength.tone}>{strength.label}</strong>
                  </span>
                ) : null}
              </div>

              {errors.newPassword ? (
                <span className="field-error" id="new-password-error">
                  {errors.newPassword}
                </span>
              ) : null}
            </div>

            <div className="form-field">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <div className="input-shell compact-input">
                <LockKeyhole size={18} aria-hidden="true" />
                <input
                  aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
                  aria-invalid={Boolean(errors.confirmPassword)}
                  autoComplete="new-password"
                  id="confirmPassword"
                  name="confirmPassword"
                  onBlur={(event) => {
                    setHasValidatedConfirmPassword(true);
                    validateConfirmPassword(newPassword, event.target.value);
                  }}
                  onChange={(event) => {
                    const value = event.target.value;
                    setConfirmPassword(value);
                    if (hasValidatedConfirmPassword) {
                      validateConfirmPassword(newPassword, value);
                    }
                  }}
                  placeholder="Confirm your new password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                />
                <button
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  className="input-icon-button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  type="button"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.confirmPassword ? (
                <span className="field-error" id="confirm-password-error">
                  {errors.confirmPassword}
                </span>
              ) : null}
            </div>

            <div className="password-requirements">
              <strong>Password must contain:</strong>
              <ul>
                {requirementResults.map((requirement) => (
                  <li className={requirement.passed ? 'met' : ''} key={requirement.key}>
                    <Check size={14} />
                    {requirement.label}
                  </li>
                ))}
              </ul>
            </div>

            {errors.form ? <span className="field-error form-error">{errors.form}</span> : null}

            {successMessage ? (
              <span className="success-message">
                {successMessage} Redirecting to sign in&hellip;
              </span>
            ) : null}

            <div className="change-password-actions">
              <button
                className="outline-reset-button"
                onClick={() => navigate('/settings')}
                type="button"
              >
                Cancel
              </button>
              <button className="gradient-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? (
                  <>
                    <span className="button-spinner" aria-hidden="true" />
                    Updating password
                  </>
                ) : (
                  <>
                    <LockKeyhole size={16} />
                    Update Password
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}
