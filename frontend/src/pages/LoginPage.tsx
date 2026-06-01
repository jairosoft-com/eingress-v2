import {
  BarChart3,
  ChevronDown,
  CircleHelp,
  Eye,
  Fingerprint,
  Globe2,
  IdCard,
  LockKeyhole,
  RadioTower,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';

type LoginErrors = {
  email?: string;
  form?: string;
  password?: string;
  rfidCode?: string;
};

const loginFeatures = [
  { label: 'Secure Authentication', Icon: ShieldCheck },
  { label: 'Biometric Technology', Icon: Fingerprint },
  { label: 'RFID Integration', Icon: RadioTower },
  { label: 'Real-time Monitoring', Icon: BarChart3 },
];

function validateLoginForm(email: string, password: string, rfidCode: string): LoginErrors {
  const errors: LoginErrors = {};

  if (!email.trim()) {
    errors.email = 'Email or username is required.';
  }

  if (!password.trim()) {
    errors.password = 'Password is required.';
  }

  if (!rfidCode.trim()) {
    errors.rfidCode = 'RFID verification is required.';
  }

  return errors;
}

export function LoginPage() {
  const { isAuthenticated, signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rfidCode, setRfidCode] = useState('');
  const [errors, setErrors] = useState<LoginErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const redirectTo =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationErrors = validateLoginForm(email, password, rfidCode);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      await signIn({ email, password, rfidCode });
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setErrors({
        form: error instanceof Error ? error.message : 'Authentication failed.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isAuthenticated) {
    return <Navigate replace to="/dashboard" />;
  }

  return (
    <main className="auth-screen" aria-labelledby="login-title">
      <section className="auth-card">
        <header className="auth-topbar">
          <div className="auth-brand">
            <span className="logo-mark" aria-hidden="true">
              <Fingerprint size={25} strokeWidth={2.4} />
            </span>
            <strong>EINGRESS</strong>
          </div>

          <div className="auth-actions">
            <button className="language-button" type="button">
              <Globe2 size={18} />
              English
              <ChevronDown size={16} />
            </button>
            <a className="help-link" href="mailto:support@eingress.local">
              <CircleHelp size={18} />
              Need help?
            </a>
          </div>
        </header>

        <div className="auth-layout">
          <section className="auth-hero" aria-label="EIngress security overview">
            <div className="hero-copy">
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

            <ul className="feature-list">
              {loginFeatures.map(({ Icon, label }) => (
                <li key={label}>
                  <Icon size={24} />
                  <span>{label}</span>
                </li>
              ))}
            </ul>

            <div className="shield-visual hero-shield" aria-hidden="true">
              <ShieldCheck size={150} strokeWidth={1.6} />
              <Fingerprint size={82} strokeWidth={2} />
            </div>
          </section>

          <section className="login-card" aria-label="Login form">
            <div className="login-heading">
              <h2 id="login-title">Welcome Back!</h2>
              <p>Sign in to continue to your account</p>
            </div>

            <form className="login-form" noValidate onSubmit={handleSubmit}>
              <div className="form-field">
                <label htmlFor="email">Email or Username</label>
                <div className="input-shell">
                  <UserRound size={22} aria-hidden="true" />
                  <input
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    aria-invalid={Boolean(errors.email)}
                    autoComplete="username"
                    id="email"
                    name="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Enter your email or username"
                    type="text"
                    value={email}
                  />
                </div>
                {errors.email ? (
                  <span className="field-error" id="email-error">
                    {errors.email}
                  </span>
                ) : null}
              </div>

              <div className="form-field">
                <label htmlFor="password">Password</label>
                <div className="input-shell">
                  <LockKeyhole size={22} aria-hidden="true" />
                  <input
                    aria-describedby={errors.password ? 'password-error' : undefined}
                    aria-invalid={Boolean(errors.password)}
                    autoComplete="current-password"
                    id="password"
                    name="password"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                  />
                  <button
                    className="input-icon-button"
                    onClick={() => setShowPassword((current) => !current)}
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Eye size={22} />
                  </button>
                </div>
                {errors.password ? (
                  <span className="field-error" id="password-error">
                    {errors.password}
                  </span>
                ) : null}
              </div>

              <div className="form-field">
                <label htmlFor="rfidCode">RFID Verification</label>
                <div className="input-shell">
                  <IdCard size={22} aria-hidden="true" />
                  <input
                    aria-describedby={errors.rfidCode ? 'rfid-error' : undefined}
                    aria-invalid={Boolean(errors.rfidCode)}
                    autoComplete="one-time-code"
                    id="rfidCode"
                    name="rfidCode"
                    onChange={(event) => setRfidCode(event.target.value)}
                    placeholder="Scan or enter RFID code"
                    type="text"
                    value={rfidCode}
                  />
                </div>
                {errors.rfidCode ? (
                  <span className="field-error" id="rfid-error">
                    {errors.rfidCode}
                  </span>
                ) : null}
              </div>

              <div className="form-row">
                <label className="checkbox-label">
                  <input type="checkbox" defaultChecked />
                  <span>Remember me</span>
                </label>
                <a href="/login">Forgot Password?</a>
              </div>

              <button className="gradient-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? (
                  <>
                    <span className="button-spinner" aria-hidden="true" />
                    Verifying session
                  </>
                ) : (
                  <>
                    <LockKeyhole size={21} />
                    Sign In
                  </>
                )}
              </button>

              {errors.form ? <span className="field-error form-error">{errors.form}</span> : null}
            </form>

            <div className="divider"></div>

            <div className="social-grid"></div>
          </section>
        </div>
      </section>

      <footer className="auth-footer">(c) 2025 Eingress. All rights reserved.</footer>
    </main>
  );
}
