import { Check, CircleUserRound, Fingerprint, IdCard, Info, Plus, QrCode, X } from 'lucide-react';
import { useEffect, useState } from 'react';

type KioskState = 'idle' | 'processing' | 'recognized' | 'unregistered' | 'enrollment';

const recognizedUser = {
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

  function simulateFingerprintScan(result: 'recognized' | 'unregistered') {
    setKioskState('processing');

    window.setTimeout(() => {
      setKioskState(result);
    }, 1200);
  }

  useEffect(() => {
    if (kioskState !== 'recognized') {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setKioskState('idle');
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [kioskState]);

  return (
    <main className="kiosk-screen" aria-labelledby="kiosk-title">
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
            <RecognizedState />
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

      <aside className="kiosk-controls" aria-label="Kiosk frontend test controls">
        <div>
          <p>{modeCopy[kioskState].eyebrow}</p>
          <h1 id="kiosk-title">Kiosk Frontend System</h1>
        </div>

        <button type="button" onClick={() => simulateFingerprintScan('recognized')}>
          Simulate recognized scan
        </button>
        <button type="button" onClick={() => simulateFingerprintScan('unregistered')}>
          Simulate unregistered scan
        </button>
        <button type="button" onClick={() => setKioskState('enrollment')}>
          Show enrollment mode
        </button>
        <button type="button" onClick={() => setKioskState('idle')}>
          Reset idle prompt
        </button>
      </aside>
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

function RecognizedState() {
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
        <h2>{recognizedUser.name}</h2>

        <dl className="user-detail-card">
          <div>
            <dt>Employee ID</dt>
            <dd>{recognizedUser.employeeId}</dd>
          </div>
          <div>
            <dt>Department</dt>
            <dd>{recognizedUser.department}</dd>
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
