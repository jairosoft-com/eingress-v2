import { Check, CircleUserRound, Fingerprint, IdCard, Info, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type KioskState =
  | 'idle'
  | 'processing'
  | 'recognized'
  | 'unregistered'
  | 'biometricEnrollment'
  | 'enrollment';
type RecognizedUser = {
  department: string;
  employeeId: string;
  name: string;
};
type KioskTerminalInput = {
  biometricCaptured?: boolean;
  fingerprintId: string | null;
  rfidUid?: string | null;
  nonce: number;
};
type KioskScanResponse = {
  department: string | null;
  employeeId: string;
  result: 'Granted' | 'Denied';
  userName: string;
};
type AdminRfidResponse = {
  adminName: string;
  authorized: boolean;
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
  biometricEnrollment: {
    eyebrow: 'Biometric Enrollment',
    title: 'Scan New Fingerprint',
    description: 'Admin authorized registration. Scan the user fingerprint to continue.',
  },
};

export function KioskPage() {
  const [kioskState, setKioskState] = useState<KioskState>('idle');
  const [recognizedUser, setRecognizedUser] = useState<RecognizedUser>(fallbackRecognizedUser);
  const [enrollmentFingerprintId, setEnrollmentFingerprintId] = useState('');
  const [doorAlert, setDoorAlert] = useState('');
  const lastProcessedNonce = useRef(0);
  const adminRfidAcceptedNonce = useRef(0);
  const isUnrecognizedUser = kioskState === 'unregistered';
  const isBiometricEnrollment = kioskState === 'biometricEnrollment';

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

  const scanAdminRfid = useCallback(
    (rfidUid: string, inputNonce: number) => {
      if (!isUnrecognizedUser) {
        return;
      }

      setDoorAlert('Verifying admin RFID...');

      void fetch(`${API_BASE_URL}/kiosk/admin-rfid-scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rfidUid }),
      })
        .then(async (response) => {
          const data = (await response.json().catch(() => null)) as AdminRfidResponse | null;

          if (!response.ok || !data?.authorized) {
            setDoorAlert('Invalid admin RFID. Registration locked.');
            return;
          }

          setDoorAlert(`Admin ${data.adminName} authorized registration`);
          adminRfidAcceptedNonce.current = inputNonce;
          setKioskState('biometricEnrollment');
        })
        .catch(() => {
          setDoorAlert('Unable to verify admin RFID. Registration locked.');
        });
    },
    [isUnrecognizedUser],
  );

  const registerEnrollmentFingerprint = useCallback(
    (fingerprintId: string) => {
      if (!isBiometricEnrollment) {
        return;
      }

      setEnrollmentFingerprintId(fingerprintId);
      setDoorAlert('Fingerprint captured for registration');
      setKioskState('enrollment');
    },
    [isBiometricEnrollment],
  );

  const capturePlaceholderBiometrics = useCallback(() => {
    registerEnrollmentFingerprint('Placeholder biometric #3');
  }, [registerEnrollmentFingerprint]);

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
          const rfidUid = input?.rfidUid?.trim();
          const biometricCaptured = input?.biometricCaptured === true || fingerprintId === '3';

          if (!input || input.nonce <= lastProcessedNonce.current) {
            return;
          }

          lastProcessedNonce.current = input.nonce;

          // Only treat an admin RFID when we're in the unregistered state and
          // a real RFID UID was provided. Do NOT treat a fingerprint scan as
          // an admin RFID candidate — that caused accidental enrollment flows.
          if (isUnrecognizedUser) {
            const adminRfidCandidate = rfidUid || (!biometricCaptured ? fingerprintId : null);

            if (adminRfidCandidate) {
              scanAdminRfid(adminRfidCandidate, input.nonce);
            }

            return;
          }

          if (
            isBiometricEnrollment &&
            biometricCaptured &&
            input.nonce > adminRfidAcceptedNonce.current
          ) {
            capturePlaceholderBiometrics();
            return;
          }

          if (isBiometricEnrollment) {
            setDoorAlert('Enter 3 to capture fingerprint biometrics.');
            return;
          }

          if (biometricCaptured) {
            return;
          }

          if (fingerprintId) {
            scanFingerprint(fingerprintId);
          }
        })
        .catch(() => {
          // The terminal bridge is optional while the hardware scanner is unavailable.
        });
    }, 600);

    return () => window.clearInterval(intervalId);
  }, [
    capturePlaceholderBiometrics,
    isBiometricEnrollment,
    isUnrecognizedUser,
    scanAdminRfid,
    scanFingerprint,
  ]);

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
    if (kioskState !== 'unregistered') {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDoorAlert('');
      setKioskState('idle');
    }, 8000);

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
          ) : isUnrecognizedUser ? (
            <UnregisteredState />
          ) : isBiometricEnrollment ? (
            <BiometricEnrollmentState />
          ) : kioskState === 'enrollment' ? (
            <EnrollmentState fingerprintId={enrollmentFingerprintId} />
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
        <p>We couldn't verify your fingerprint. Scan an admin RFID to open registration.</p>
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

function BiometricEnrollmentState() {
  return (
    <section className="fingerprint-prompt" aria-live="polite">
      <div className="fingerprint-orb">
        <Fingerprint size={78} strokeWidth={1.7} />
      </div>
      <h2>Scan New Fingerprint</h2>
      <p>Admin RFID accepted. Enter 3 to capture the placeholder fingerprint biometric.</p>
    </section>
  );
}

function EnrollmentState({ fingerprintId }: { fingerprintId: string }) {
  return (
    <section className="enrollment-layout" aria-live="polite">
      <div className="enrollment-symbol">
        <CircleUserRound size={58} />
        <Plus size={28} />
      </div>

      <div className="enrollment-copy">
        <p>Enrollment Mode</p>
        <h2>Register New User</h2>
        <span>
          Fingerprint biometric captured{fingerprintId ? `: ${fingerprintId}` : ''}. Continue with
          the registration form.
        </span>

        <ol>
          <li>Capture fingerprint biometric</li>
          <li>Fill out the registration form</li>
          <li>Wait for admin approval</li>
        </ol>
      </div>

      <div className="qr-panel">
        <span>Or scan this QR code to open the form</span>
        <img alt="Enrollment form QR code" src="/enrollment-qr.png" />
      </div>

      <div className="enrollment-help">
        <Info size={16} />
        For assistance, please contact the administrator.
      </div>
    </section>
  );
}
