import {
  BarChart3,
  ChevronDown,
  CircleHelp,
  Fingerprint,
  Globe2,
  LockKeyhole,
  Mail,
  RadioTower,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';

const resetFeatures = [
  { label: 'Secure Authentication', Icon: ShieldCheck },
  { label: 'Biometric Technology', Icon: Fingerprint },
  { label: 'RFID Integration', Icon: RadioTower },
  { label: 'Real-time Monitoring', Icon: BarChart3 },
];

function validateEmail(email: string) {
  if (!email.trim()) {
    return 'Email address is required.';
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return 'Enter a valid email address.';
  }

  return '';
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationMessage = validateEmail(email);
    setEmailError(validationMessage);
    setSuccessMessage('');

    if (validationMessage) {
      return;
    }

    setIsSubmitting(true);

    await new Promise((resolve) => {
      window.setTimeout(resolve, 900);
    });

    setIsSubmitting(false);
    setSuccessMessage(
      'Reset request submitted. Please check your email when email delivery is configured.',
    );
  }

  return (
    <main className="auth-screen" aria-labelledby="forgot-password-title">
      <section className="auth-card forgot-auth-card">
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

            <div className="shield-visual forgot-shield" aria-hidden="true">
              <ShieldCheck size={124} strokeWidth={1.6} />
              <Fingerprint size={68} strokeWidth={2} />
            </div>
          </section>

          <section className="forgot-card" aria-label="Forgot password form">
            <div className="reset-icon" aria-hidden="true">
              <LockKeyhole size={34} />
            </div>

            <div className="forgot-heading">
              <h2 id="forgot-password-title">Forgot Password?</h2>
              <p>No worries! Enter your email address to request a password reset.</p>
            </div>

            <form className="login-form" noValidate onSubmit={handleSubmit}>
              <div className="form-field">
                <label htmlFor="resetEmail">Email Address</label>
                <div className="input-shell compact-input">
                  <Mail size={18} aria-hidden="true" />
                  <input
                    aria-describedby={emailError ? 'reset-email-error' : undefined}
                    aria-invalid={Boolean(emailError)}
                    autoComplete="email"
                    id="resetEmail"
                    name="resetEmail"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Enter your email address"
                    type="email"
                    value={email}
                  />
                </div>
                {emailError ? (
                  <span className="field-error" id="reset-email-error">
                    {emailError}
                  </span>
                ) : null}
              </div>

              <button
                className="gradient-button reset-button"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? (
                  <>
                    <span className="button-spinner" aria-hidden="true" />
                    Sending link
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Send Reset Link
                  </>
                )}
              </button>

              {successMessage ? <span className="success-message">{successMessage}</span> : null}
            </form>

            <div className="divider compact-divider">
              <span>OR</span>
            </div>

            <button className="outline-reset-button" type="button">
              <ShieldCheck size={16} />
              Send Reset Link via SMS Instead
            </button>

            <p className="remember-login">
              Remember your password? <Link to="/login">Back to Login</Link>
            </p>
          </section>
        </div>
      </section>

      <footer className="auth-footer">(c) 2025 Eingress. All rights reserved.</footer>
    </main>
  );
}
