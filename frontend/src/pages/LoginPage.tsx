import { FormEvent, useState } from 'react';

type LoginErrors = {
  email?: string;
  password?: string;
};

const initialErrors: LoginErrors = {};

function validateLoginForm(email: string, password: string): LoginErrors {
  const errors: LoginErrors = {};

  if (!email.trim()) {
    errors.email = 'Email is required.';
  }

  if (!password.trim()) {
    errors.password = 'Password is required.';
  }

  return errors;
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<LoginErrors>(initialErrors);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationErrors = validateLoginForm(email, password);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    await new Promise((resolve) => {
      window.setTimeout(resolve, 900);
    });

    setIsSubmitting(false);
  }

  return (
    <section className="login-page" aria-labelledby="login-title">
      <div className="login-panel">
        <div className="login-copy">
          <p className="eyebrow">Secure Access</p>
          <h1 id="login-title">Sign in to EIngress</h1>
          <p>Access the entry monitoring dashboard with your authorized account.</p>
        </div>

        <form className="login-form" noValidate onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              aria-describedby={errors.email ? 'email-error' : undefined}
              aria-invalid={Boolean(errors.email)}
              autoComplete="email"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
            {errors.email ? (
              <span className="field-error" id="email-error">
                {errors.email}
              </span>
            ) : null}
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              aria-describedby={errors.password ? 'password-error' : undefined}
              aria-invalid={Boolean(errors.password)}
              autoComplete="current-password"
              id="password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
            {errors.password ? (
              <span className="field-error" id="password-error">
                {errors.password}
              </span>
            ) : null}
          </div>

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <>
                <span className="button-spinner" aria-hidden="true" />
                Signing in
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>
      </div>
    </section>
  );
}
