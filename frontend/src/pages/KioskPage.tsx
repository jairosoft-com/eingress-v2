import { Check, CircleUserRound, Fingerprint, IdCard, Info, Plus, QrCode, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type KioskState = 'idle' | 'processing' | 'recognized' | 'unregistered' | 'enrollment';
type RecognizedUser = {
  department: string;
  employeeId: string;
  name: string;
};
type KioskTerminalInput = {
  fingerprintId: string | null;
  nonce: number;
};
type KioskScanResponse = {
  department: string | null;
  employeeId: string;
  result: 'Granted' | 'Denied';
  userName: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';
const fallbackRecognizedUser = {
  name: 'Juan Dela Cruz',
  employeeId: 'EMP-000123',
  department: 'Information Technology',
};

const modeCopy = {
  idle: {
    eyebrow: 'Idle Prompt',
    title: 'Scan Your Fingerprint',
    description: 'Place your finger on the scanner',
  },
  processing: {
    eyebrow: 'Processing',
    title: 'Processing Fingerprint',
    description: 'Please keep your finger on the scanner',
  },
  recognized: {
    eyebrow: 'Success',
    title: 'Attendance Recorded Successfully!',
    description: 'Thank you. Have a great day!',
  },
  unregistered: {
    eyebrow: 'Unregistered',
    title: 'Unrecognized',
    description: "We couldn't verify your fingerprint. Please contact an administrator.",
  },
  enrollment: {
    eyebrow: 'Enrollment Mode',
    title: 'Register New User',
    description: 'Follow the steps below to complete your registration.',
  },
};

export function KioskPage() {
  const [kioskState, setKioskState] = useState<KioskState>('idle');
  const [recognizedUser, setRecognizedUser] = useState<RecognizedUser>(fallbackRecognizedUser);
  const [doorAlert, setDoorAlert] = useState('');
  const lastProcessedNonce = useRef(0);

  const scanFingerprint = useCallback((fingerprintId: string) => {
    setKioskState('processing');
    setDoorAlert('');

    window.setTimeout(() => {
      void fetch(`${API_BASE_URL}/kiosk/fingerprint-scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fingerprintId }),
      })
        .then(async (response) => {
          const data = (await response.json().catch(() => null)) as KioskScanResponse | null;
          const isRegistered = response.ok && data?.result === 'Granted';

          if (isRegistered) {
            setRecognizedUser({
              department: data.department ?? 'Unassigned',
              employeeId: data.employeeId,
              name: data.userName,
            });
            setDoorAlert('The door is unlocked!');
            setKioskState('recognized');
            return;
          }

          setDoorAlert('Unrecognized user. Door Locked');
          setKioskState('unregistered');
        })
        .catch(() => {
          setDoorAlert('Unrecognized user. Door Locked');
          setKioskState('unregistered');
        });
    }, 1200);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetch(`/kiosk-input.json?t=${Date.now()}`, { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) {
            return null;
          }

          return response.json() as Promise<KioskTerminalInput>;
        })
        .then((input) => {
          const fingerprintId = input?.fingerprintId?.trim();

          if (!input || !fingerprintId || input.nonce <= lastProcessedNonce.current) {
            return;
          }

          lastProcessedNonce.current = input.nonce;
          scanFingerprint(fingerprintId);
        })
        .catch(() => {
          // The terminal bridge is optional while the hardware scanner is unavailable.
        });
    }, 600);

    return () => window.clearInterval(intervalId);
  }, [scanFingerprint]);

  useEffect(() => {
    if (kioskState !== 'recognized') {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setKioskState('idle');
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [kioskState]);

  useEffect(() => {
    if (!doorAlert) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDoorAlert('');
    }, 3500);

    return () => window.clearTimeout(timeoutId);
  }, [doorAlert]);

  return (
    <main className="kiosk-screen" aria-label="Kiosk Frontend System">
      <section className={`kiosk-stage kiosk-${kioskState}`}>
        <header className="kiosk-header">
          <div className="kiosk-brand">
            <span className="kiosk-logo" aria-hidden="true">
              <Fingerprint size={20} />
            </span>
            <span>
              <strong>EINGRESS</strong>
              <small>ATTENDANCE KIOSK</small>
            </span>
          </div>

          <div className="kiosk-clock" aria-label="Current kiosk time">
            <strong>10:30 AM</strong>
            <small>May 17, 2026</small>
          </div>
        </header>

        <div className="kiosk-body">
          {kioskState === 'recognized' ? (
            <RecognizedState user={recognizedUser} />
          ) : kioskState === 'unregistered' ? (
            <UnregisteredState />
          ) : kioskState === 'enrollment' ? (
            <EnrollmentState />
          ) : (
            <FingerprintPrompt
              description={modeCopy[kioskState].description}
              isProcessing={kioskState === 'processing'}
              title={modeCopy[kioskState].title}
            />
          )}
        </div>

        <div className="kiosk-dot-grid" aria-hidden="true" />
      </section>

      {doorAlert ? (
        <div className="kiosk-door-alert" role="alert">
          {doorAlert}
        </div>
      ) : null}
    </main>
  );
}

function FingerprintPrompt({
  description,
  isProcessing,
  title,
}: {
  description: string;
  isProcessing: boolean;
  title: string;
}) {
  return (
    <section className="fingerprint-prompt" aria-live="polite">
      <div className={isProcessing ? 'fingerprint-orb processing' : 'fingerprint-orb'}>
        <Fingerprint size={78} strokeWidth={1.7} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {isProcessing ? <span className="processing-bar" aria-hidden="true" /> : null}
    </section>
  );
}

function RecognizedState({ user }: { user: RecognizedUser }) {
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
            <dt>Employee ID</dt>
            <dd>{user.employeeId}</dd>
          </div>
          <div>
            <dt>Department</dt>
            <dd>{user.department}</dd>
          </div>
        </dl>

        <div className="attendance-success">
          <Check size={20} />
          <span>
            <strong>Attendance Recorded Successfully!</strong>
            <small>Thank you. Have a great day!</small>
          </span>
        </div>

        <small className="return-note">Returning to home screen in 5 seconds...</small>
      </div>
    </section>
  );
}

function UnregisteredState() {
  return (
    <section className="unregistered-layout" aria-live="polite">
      <div className="unregistered-symbol">
        <CircleUserRound size={56} />
        <span>
          <X size={20} />
        </span>
      </div>

      <div className="unregistered-copy">
        <h2>Unrecognized</h2>
        <p>We couldn't verify your fingerprint. Please contact an administrator.</p>
      </div>

      <div className="admin-rfid-card">
        <IdCard size={26} />
        <span>
          <strong>Scan Admin RFID</strong>
          <small>Place admin card on the RFID reader</small>
        </span>
      </div>
    </section>
  );
}

function EnrollmentState() {
  return (
    <section className="enrollment-layout" aria-live="polite">
      <div className="enrollment-symbol">
        <CircleUserRound size={58} />
        <Plus size={28} />
      </div>

      <div className="enrollment-copy">
        <p>Enrollment Mode</p>
        <h2>Register New User</h2>
        <span>Follow the steps below to complete your registration.</span>

        <ol>
          <li>Scan your fingerprint</li>
          <li>Fill out the registration form</li>
          <li>Wait for admin approval</li>
        </ol>
      </div>

      <div className="qr-panel">
        <span>Or scan this QR code to open the form</span>
        <QrCode size={126} />
      </div>

      <div className="enrollment-help">
        <Info size={16} />
        For assistance, please contact the administrator.
      </div>
    </section>
  );
}
