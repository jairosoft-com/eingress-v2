import { Check, Fingerprint, IdCard, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type KioskBioState = 'idle' | 'processing' | 'recognized';
type KioskBioTerminalInput = {
  fingerprintId: string | null;
  nonce: number;
};
type KioskFingerprintScanResponse = {
  department?: string | null;
  employeeId?: string;
  result?: 'Granted' | 'Denied';
  role?: string | null;
  timeType?: 'in' | 'out' | null;
  userName?: string;
};
type RecognizedUser = {
  department: string;
  employeeId: string;
  name: string;
  role: string;
  timeType: 'in' | 'out';
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';
const kioskTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});
const kioskDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function KioskBioPage() {
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [kioskState, setKioskState] = useState<KioskBioState>('idle');
  const [recognizedUser, setRecognizedUser] = useState<RecognizedUser | null>(null);
  const [recognizedCountdown, setRecognizedCountdown] = useState(5);
  const [notFoundMessage, setNotFoundMessage] = useState('');
  const lastProcessedNonce = useRef(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (kioskState !== 'idle') {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetch(`/kioskbio-input.json?t=${Date.now()}`, { cache: 'no-store' })
        .then((response) =>
          response.ok ? (response.json() as Promise<KioskBioTerminalInput>) : null,
        )
        .then((input) => {
          const fingerprintId = input?.fingerprintId?.trim();

          if (!input || !fingerprintId || input.nonce <= lastProcessedNonce.current) {
            return;
          }

          lastProcessedNonce.current = input.nonce;
          setNotFoundMessage('');
          setKioskState('processing');

          window.setTimeout(() => {
            void fetch(`${API_BASE_URL}/kiosk/fingerprint-scan`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fingerprintId }),
            })
              .then(async (response) => {
                const data = (await response
                  .json()
                  .catch(() => null)) as KioskFingerprintScanResponse | null;

                if (!response.ok || data?.result !== 'Granted') {
                  setNotFoundMessage('Fingerprint not recognized.');
                  setKioskState('idle');
                  return;
                }

                setRecognizedUser({
                  department: data.department ?? 'Unassigned',
                  employeeId: data.employeeId ?? 'Unknown',
                  name: data.userName ?? 'Recognized User',
                  role: data.role ?? 'Employee',
                  timeType: data.timeType === 'out' ? 'out' : 'in',
                });
                setRecognizedCountdown(5);
                setKioskState('recognized');
              })
              .catch(() => {
                setNotFoundMessage('Unable to verify fingerprint.');
                setKioskState('idle');
              });
          }, 1200);
        })
        .catch(() => {
          // The terminal bridge is optional while no scan is in progress.
        });
    }, 600);

    return () => window.clearInterval(intervalId);
  }, [kioskState]);

  useEffect(() => {
    if (kioskState !== 'recognized') {
      return;
    }

    const intervalId = window.setInterval(() => {
      setRecognizedCountdown((current) => Math.max(current - 1, 0));
    }, 1000);

    const timeoutId = window.setTimeout(() => {
      setRecognizedUser(null);
      setKioskState('idle');
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [kioskState]);

  useEffect(() => {
    if (!notFoundMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setNotFoundMessage('');
    }, 3500);

    return () => window.clearTimeout(timeoutId);
  }, [notFoundMessage]);

  return (
    <main className="kiosk-screen" aria-label="Kiosk Frontend System">
      <section className={`kiosk-stage kiosk-${kioskState}`}>
        <header className="kiosk-header">
          <div className="kiosk-brand">
            <span className="kiosk-logo" aria-hidden="true">
              <IdCard size={20} />
            </span>
            <span>
              <strong>EINGRESS</strong>
              <small>ATTENDANCE KIOSK</small>
            </span>
          </div>

          <div className="kiosk-clock" aria-label="Current kiosk time">
            <strong>{kioskTimeFormatter.format(currentDateTime)}</strong>
            <small>{kioskDateFormatter.format(currentDateTime)}</small>
          </div>
        </header>

        <div className="kiosk-body">
          {kioskState === 'recognized' && recognizedUser ? (
            <RecognizedState countdown={recognizedCountdown} user={recognizedUser} />
          ) : (
            <FingerprintPrompt isProcessing={kioskState === 'processing'} />
          )}
        </div>

        <div className="kiosk-dot-grid" aria-hidden="true" />
      </section>

      {notFoundMessage ? (
        <div className="kiosk-door-alert" role="alert">
          {notFoundMessage}
        </div>
      ) : null}
    </main>
  );
}

function FingerprintPrompt({ isProcessing }: { isProcessing: boolean }) {
  return (
    <section className="fingerprint-prompt" aria-live="polite">
      <div className={isProcessing ? 'fingerprint-orb processing' : 'fingerprint-orb'}>
        <span className="id-tap-symbol" aria-hidden="true">
          <Fingerprint size={58} strokeWidth={2} />
        </span>
      </div>
      <h2>{isProcessing ? 'Verifying Fingerprint' : 'Scan Your Fingerprint'}</h2>
      <p>
        {isProcessing ? 'Please keep your finger on the scanner.' : 'Place finger on the scanner.'}
      </p>
      {isProcessing ? <span className="processing-bar" aria-hidden="true" /> : null}
    </section>
  );
}

function RecognizedState({ countdown, user }: { countdown: number; user: RecognizedUser }) {
  const isTimeIn = user.timeType === 'in';

  return (
    <section className="recognized-layout" aria-live="polite">
      <div className="kiosk-portrait">
        <span className="hair" />
        <span className="face" />
        <span className="shirt" />
        <span className="success-check">
          <Check size={20} />
        </span>
      </div>

      <div className="recognized-details">
        <p>Welcome back,</p>
        <h2>{user.name}</h2>

        <dl className="user-detail-card">
          <div>
            <dt className="recognized-detail-label">
              <IdCard size={16} />
              Employee ID
            </dt>
            <dd>{user.employeeId}</dd>
          </div>
          <div>
            <dt className="recognized-detail-label">
              <Users size={16} />
              Role
            </dt>
            <dd>{user.role}</dd>
          </div>
        </dl>
        <div className="attendance-success">
          <Check size={20} />
          <span>
            <strong>
              {isTimeIn ? 'User Timed In... Welcome Back!' : 'User Timed Out... See You Tomorrow!'}
            </strong>
            <small>Don't forget to time in tomorrow~</small>
          </span>
        </div>
      </div>

      <p className="return-note">Returning to home screen in {countdown} seconds...</p>
    </section>
  );
}
