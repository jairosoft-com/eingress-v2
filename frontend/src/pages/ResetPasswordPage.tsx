import {
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  Eye,
  EyeOff,
  Fingerprint,
  Globe2,
  KeyRound,
  LockKeyhole,
  RadioTower,
  ShieldCheck,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import authShieldIcon from '../assets/icons/auth-shield.png';
import eingressIcon from '../assets/icons/eingress-icon.png';
import { useAuth } from '../auth/useAuth';
import { API_BASE_URL } from '../lib/api';
import {
  getPasswordRequirementResults,
  getPasswordStrength,
  meetsPasswordPolicy,
} from '../lib/passwordPolicy';

const resetFeatures = [
  { label: 'Secure Authentication', Icon: ShieldCheck },
  { label: 'Biometric Technology', Icon: Fingerprint },
  { label: 'RFID Integration', Icon: RadioTower },
  { label: 'Real-time Monitoring', Icon: BarChart3 },
];

type ResetErrors = {
  confirmPassword?: string;
  form?: string;
  password?: string;
};

function validateResetForm(password: string, confirmPassword: string): ResetErrors {
  const errors: ResetErrors = {};

  if (!password) {
    errors.password = 'New password is required.';
  } else if (!meetsPasswordPolicy(password)) {
    errors.password = 'Password does not meet all requirements.';
  }

  if (!confirmPassword) {
    errors.confirmPassword = 'Please confirm your new password.';
  } else if (password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  return errors;
}

export function ResetPasswordPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? params.token ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<ResetErrors>({});
  const [isCheckingToken, setIsCheckingToken] = useState(true);
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const requirementResults = useMemo(() => getPasswordRequirementResults(password), [password]);
  const passedCount = requirementResults.filter((requirement) => requirement.passed).length;
  const strength = getPasswordStrength(password ? passedCount : 0);

  useEffect(() => {
    let isMounted = true;

    async function verifyToken() {
      if (!token) {
        setIsCheckingToken(false);
        setIsTokenValid(false);
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/auth/reset-password/${encodeURIComponent(token)}`,
        );
        const data = (await response.json().catch(() => null)) as { valid?: boolean } | null;

        if (isMounted) {
          setIsTokenValid(Boolean(response.ok && data?.valid));
        }
      } catch {
        if (isMounted) {
          setIsTokenValid(false);
        }
      } finally {
        if (isMounted) {
          setIsCheckingToken(false);
        }
      }
    }

    void verifyToken();

    return () => {
      isMounted = false;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationErrors = validateResetForm(password, confirmPassword);
    setErrors(validationErrors);
    setSuccessMessage('');

    if (Object.keys(validationErrors).length > 0 || !isTokenValid) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, password }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error || 'Unable to reset password.');
      }

      signOut();
      setPassword('');
      setConfirmPassword('');
      setIsTokenValid(false);
      setSuccessMessage(data?.message || 'Password has been reset. You can now sign in.');
      navigate('/login', { replace: true });
    } catch (error) {
      setErrors({
        form: error instanceof Error ? error.message : 'Unable to reset password.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const resetUnavailable = !isCheckingToken && !isTokenValid && !successMessage;

  return (
    <main className="auth-screen" aria-labelledby="reset-password-title">
      <section className="auth-card forgot-auth-card">
        <header className="auth-topbar">
          <div className="auth-brand">
            <span className="logo-mark logo-mark-image" aria-hidden="true">
              <img src={eingressIcon} alt="" />
            </span>
            <strong>EINGRESS</strong>
          </div>

          <div className="auth-actions">
            <button className="language-button" type="button">
              <Globe2 size={18} />
              English
              <ChevronDown size={16} />
            </button>
            <a className="help-link" href="/login">
              <CircleHelp size={18} />
              Need help?
            </a>
          </div>
        </header>

        <div className="auth-layout forgot-layout">
          <section className="auth-hero forgot-hero" aria-label="EIngress security overview">
            <div className="hero-copy compact-copy">
              <h1>
                Secure Access.
                <span>Smart Identity.</span>
                <em>Seamless Experience.</em>
              </h1>
              <p>
                Advanced biometric identification and RFID technology for a safer and smarter
                tomorrow.
              </p>
            </div>

            <ul className="feature-list compact-feature-list">
              {resetFeatures.map(({ Icon, label }) => (
                <li key={label}>
                  <Icon size={20} />
                  <span>{label}</span>
                </li>
              ))}
            </ul>

            <div className="shield-visual shield-visual-image forgot-shield" aria-hidden="true">
              <img src={authShieldIcon} alt="" />
            </div>
          </section>

          <section className="forgot-card" aria-label="Reset password form">
            <div className="reset-icon" aria-hidden="true">
              <KeyRound size={34} />
            </div>

            <div className="forgot-heading">
              <h2 id="reset-password-title">Reset Password</h2>
              <p>Enter a new password for your EINGRESS admin account.</p>
            </div>

            {isCheckingToken ? (
              <div className="reset-status">
                <span className="button-spinner dark-spinner" aria-hidden="true" />
                Checking reset link
              </div>
            ) : null}

            {resetUnavailable ? (
              <div className="reset-status error-status">
                Reset link is invalid or has expired.
                <Link to="/forgot-password">Request a new link</Link>
              </div>
            ) : null}

            {!isCheckingToken && isTokenValid ? (
              <form className="login-form" noValidate onSubmit={handleSubmit}>
                <div className="form-field">
                  <label htmlFor="newPassword">New Password</label>
                  <div className="input-shell compact-input">
                    <LockKeyhole size={18} aria-hidden="true" />
                    <input
                      aria-describedby={errors.password ? 'new-password-error' : undefined}
                      aria-invalid={Boolean(errors.password)}
                      autoComplete="new-password"
                      id="newPassword"
                      name="newPassword"
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter new password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                    />
                    <button
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="input-icon-button"
                      onClick={() => setShowPassword((current) => !current)}
                      type="button"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  <div className="password-strength-meter" aria-hidden={!password}>
                    <div className="password-strength-bar">
                      {[0, 1, 2, 3].map((segment) => (
                        <span
                          className={
                            password && segment < strength.filled ? `filled ${strength.tone}` : ''
                          }
                          key={segment}
                        />
                      ))}
                    </div>
                    {password ? (
                      <span className="password-strength-label">
                        Password strength:{' '}
                        <strong className={strength.tone}>{strength.label}</strong>
                      </span>
                    ) : null}
                  </div>

                  {errors.password ? (
                    <span className="field-error" id="new-password-error">
                      {errors.password}
                    </span>
                  ) : null}
                </div>

                <div className="form-field">
                  <label htmlFor="confirmPassword">Confirm New Password</label>
                  <div className="input-shell compact-input">
                    <ShieldCheck size={18} aria-hidden="true" />
                    <input
                      aria-describedby={
                        errors.confirmPassword ? 'confirm-password-error' : undefined
                      }
                      aria-invalid={Boolean(errors.confirmPassword)}
                      autoComplete="new-password"
                      id="confirmPassword"
                      name="confirmPassword"
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Confirm new password"
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

                <button
                  className="gradient-button reset-button"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? (
                    <>
                      <span className="button-spinner" aria-hidden="true" />
                      Resetting password
                    </>
                  ) : (
                    <>
                      <KeyRound size={16} />
                      Reset Password
                    </>
                  )}
                </button>

                {errors.form ? <span className="field-error form-error">{errors.form}</span> : null}
              </form>
            ) : null}

            {successMessage ? (
              <div className="reset-status success-status">
                {successMessage}
                <Link to="/login">Back to Login</Link>
              </div>
            ) : null}

            {!successMessage && !resetUnavailable ? (
              <p className="remember-login">
                Remember your password? <Link to="/login">Back to Login</Link>
              </p>
            ) : null}
          </section>
        </div>
      </section>

      <footer className="auth-footer">(c) 2025 Eingress. All rights reserved.</footer>
    </main>
  );
}
