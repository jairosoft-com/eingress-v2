import { Check, CircleUserRound, IdCard, KeyRound, Plus, Users, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';

type KioskBioState = 'idle' | 'processing' | 'recognized' | 'unrecognized' | 'enrolled';
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
type NetworkInfoResponse = {
  lanIp?: string | null;
};
type RealtimeMessage = {
  type?: string;
};
type RecognizedUser = {
  department: string;
  employeeId: string;
  name: string;
  role: string;
  timeType: 'in' | 'out';
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api$/, '/ws');
const QR_CODE_SIZE = 260;
const kioskTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});
const kioskDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function getRegistrationUrl() {
  const configuredUrl = import.meta.env.VITE_REGISTRATION_URL;

  if (configuredUrl) {
    return configuredUrl;
  }

  if (typeof window === 'undefined') {
    return '/register';
  }

  return new URL('/register', window.location.origin).toString();
}

function getRegistrationUrlForHost(hostname: string) {
  if (typeof window === 'undefined') {
    return '/register';
  }

  const url = new URL('/register', window.location.origin);
  url.hostname = hostname;

  return url.toString();
}

export function KioskBioPage() {
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [kioskState, setKioskState] = useState<KioskBioState>('idle');
  const [recognizedUser, setRecognizedUser] = useState<RecognizedUser | null>(null);
  const [recognizedCountdown, setRecognizedCountdown] = useState(5);
  const [unrecognizedCountdown, setUnrecognizedCountdown] = useState(5);
  const [manualFingerprintId, setManualFingerprintId] = useState('');
  const [adminRfidInput, setAdminRfidInput] = useState('');
  const [isAwaitingNewRfid, setIsAwaitingNewRfid] = useState(false);
  const [newRfidCountdown, setNewRfidCountdown] = useState(5);
  const [enrollmentError, setEnrollmentError] = useState('');
  const [enrolledCountdown, setEnrolledCountdown] = useState(60);
  const lastProcessedNonce = useRef(0);

  function processFingerprintScan(fingerprintId: string) {
    setIsAwaitingNewRfid(false);
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
            setUnrecognizedCountdown(5);
            setKioskState('unrecognized');
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
          setUnrecognizedCountdown(5);
          setKioskState('unrecognized');
        });
    }, 1200);
  }

  function processEnrollmentRfid(rfidUid: string) {
    setEnrollmentError('');
    setKioskState('processing');

    window.setTimeout(() => {
      void fetch(`${API_BASE_URL}/kiosk/enrollment-rfid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfidUid }),
      })
        .then(async (response) => {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;

          if (!response.ok) {
            setEnrollmentError(data?.error ?? 'Unable to capture RFID. Tap a new RFID.');
            setNewRfidCountdown(5);
            setIsAwaitingNewRfid(true);
            setKioskState('idle');
            return;
          }

          setEnrolledCountdown(60);
          setKioskState('enrolled');
        })
        .catch(() => {
          setEnrollmentError('Unable to capture RFID. Tap a new RFID.');
          setNewRfidCountdown(5);
          setIsAwaitingNewRfid(true);
          setKioskState('idle');
        });
    }, 1200);
  }

  function submitManualFingerprintId() {
    const trimmed = manualFingerprintId.trim();

    if (!trimmed || kioskState !== 'idle') {
      return;
    }

    setManualFingerprintId('');

    if (isAwaitingNewRfid) {
      processEnrollmentRfid(trimmed);
    } else {
      processFingerprintScan(trimmed);
    }
  }

  function submitAdminRfid() {
    const trimmed = adminRfidInput.trim();

    if (!trimmed || kioskState !== 'unrecognized') {
      return;
    }

    setAdminRfidInput('');

    void fetch(`${API_BASE_URL}/kiosk/admin-rfid-scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rfidUid: trimmed }),
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as { authorized?: boolean } | null;

        if (response.ok && data?.authorized) {
          setNewRfidCountdown(5);
          setIsAwaitingNewRfid(true);
          setKioskState('idle');
        }
      })
      .catch(() => {
        // Ignore network errors; the admin can retry the scan.
      });
  }

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

          if (isAwaitingNewRfid) {
            processEnrollmentRfid(fingerprintId);
          } else {
            processFingerprintScan(fingerprintId);
          }
        })
        .catch(() => {
          // The terminal bridge is optional while no scan is in progress.
        });
    }, 600);

    return () => window.clearInterval(intervalId);
  }, [isAwaitingNewRfid, kioskState]);

  useEffect(() => {
    if (kioskState !== 'recognized' && kioskState !== 'unrecognized') {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (kioskState === 'recognized') {
        setRecognizedCountdown((current) => Math.max(current - 1, 0));
      } else {
        setUnrecognizedCountdown((current) => Math.max(current - 1, 0));
      }
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
    if (kioskState !== 'enrolled') {
      return;
    }

    const intervalId = window.setInterval(() => {
      setEnrolledCountdown((current) => Math.max(current - 1, 0));
    }, 1000);

    const timeoutId = window.setTimeout(() => {
      setKioskState('idle');
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [kioskState]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimeoutId: number | null = null;
    let shouldReconnect = true;

    function connectRealtimeSocket() {
      socket = new WebSocket(WS_BASE_URL);

      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data as string) as RealtimeMessage;

          if (message.type !== 'enrollment:submitted') {
            return;
          }

          setKioskState('idle');
        } catch {
          // Ignore realtime messages that are not JSON.
        }
      });

      socket.addEventListener('close', () => {
        if (!shouldReconnect) {
          return;
        }

        reconnectTimeoutId = window.setTimeout(connectRealtimeSocket, 2000);
      });
    }

    connectRealtimeSocket();

    return () => {
      shouldReconnect = false;

      if (reconnectTimeoutId) {
        window.clearTimeout(reconnectTimeoutId);
      }

      socket?.close();
    };
  }, []);

  useEffect(() => {
    if (kioskState !== 'idle' || !isAwaitingNewRfid) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNewRfidCountdown((current) => Math.max(current - 1, 0));
    }, 1000);

    const timeoutId = window.setTimeout(() => {
      setIsAwaitingNewRfid(false);
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [isAwaitingNewRfid, kioskState]);

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
          ) : kioskState === 'unrecognized' ? (
            <UnrecognizedState
              adminRfidValue={adminRfidInput}
              countdown={unrecognizedCountdown}
              onAdminRfidChange={setAdminRfidInput}
              onAdminRfidSubmit={submitAdminRfid}
            />
          ) : kioskState === 'enrolled' ? (
            <EnrolledState countdown={enrolledCountdown} />
          ) : (
            <FingerprintPrompt
              error={enrollmentError}
              isAwaitingNewRfid={isAwaitingNewRfid}
              isProcessing={kioskState === 'processing'}
              newRfidCountdown={newRfidCountdown}
              onChange={setManualFingerprintId}
              onSubmit={submitManualFingerprintId}
              value={manualFingerprintId}
            />
          )}
        </div>

        <div className="kiosk-dot-grid" aria-hidden="true" />
      </section>
    </main>
  );
}

function FingerprintPrompt({
  error,
  isAwaitingNewRfid,
  isProcessing,
  newRfidCountdown,
  onChange,
  onSubmit,
  value,
}: {
  error: string;
  isAwaitingNewRfid: boolean;
  isProcessing: boolean;
  newRfidCountdown: number;
  onChange: (value: string) => void;
  onSubmit: () => void;
  value: string;
}) {
  return (
    <section className="fingerprint-prompt" aria-live="polite">
      <div className={isProcessing ? 'fingerprint-orb processing' : 'fingerprint-orb'}>
        <span className="id-tap-symbol" aria-hidden="true">
          <IdCard size={58} strokeWidth={2} />
        </span>
      </div>
      <h2>
        {isProcessing
          ? 'Verifying RFID'
          : isAwaitingNewRfid
            ? 'Tap Your New RFID'
            : 'Tap Your RFID'}
      </h2>
      <p>{isProcessing ? 'Please keep your card on the reader.' : 'Tap your ID on the reader.'}</p>
      {isProcessing ? (
        <span className="processing-bar" aria-hidden="true" />
      ) : (
        <>
          <label className="rfid-scan-input">
            <span>RFID Number</span>
            <input
              autoFocus
              inputMode="numeric"
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onSubmit();
                }
              }}
              placeholder="Enter RFID number"
              value={value}
            />
          </label>
          {isAwaitingNewRfid ? (
            <>
              {error ? <p className="kiosk-error-note">{error}</p> : null}
              <p className="return-note">Returning to normal in {newRfidCountdown} seconds...</p>
            </>
          ) : null}
        </>
      )}
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

function EnrolledState({ countdown }: { countdown: number }) {
  const [registrationUrl, setRegistrationUrl] = useState(getRegistrationUrl);
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      import.meta.env.VITE_REGISTRATION_URL ||
      (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
    ) {
      return;
    }

    const controller = new AbortController();

    void fetch(`${API_BASE_URL}/network-info`, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as NetworkInfoResponse | null;

        if (response.ok && data?.lanIp) {
          setRegistrationUrl(getRegistrationUrlForHost(data.lanIp));
        }
      })
      .catch(() => {
        // Keep the current URL visible if network discovery is unavailable.
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    let isMounted = true;

    void QRCode.toDataURL(registrationUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: QR_CODE_SIZE,
    }).then((dataUrl) => {
      if (isMounted) {
        setQrCodeUrl(dataUrl);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [registrationUrl]);

  return (
    <section className="enrollment-layout enrollment-qr-layout" aria-live="polite">
      <div className="enrollment-symbol">
        <CircleUserRound size={58} />
        <Plus size={28} />
      </div>

      <div className="enrollment-copy enrollment-qr-copy">
        <p>Enrollment Mode</p>
        <h2>Register New User</h2>

        <div className="qr-panel">
          <span>Scan this QR to continue on your phone</span>
          {qrCodeUrl ? <img alt="Enrollment form QR code" src={qrCodeUrl} /> : null}
          <small>{registrationUrl}</small>
        </div>
      </div>

      <p className="return-note">Returning to home screen in {countdown} seconds...</p>
    </section>
  );
}

function UnrecognizedState({
  adminRfidValue,
  countdown,
  onAdminRfidChange,
  onAdminRfidSubmit,
}: {
  adminRfidValue: string;
  countdown: number;
  onAdminRfidChange: (value: string) => void;
  onAdminRfidSubmit: () => void;
}) {
  return (
    <section className="unregistered-layout kiosk-unrecognized" aria-live="assertive">
      <div className="unregistered-symbol">
        <CircleUserRound size={56} />
        <span>
          <X size={20} />
        </span>
      </div>

      <div className="unregistered-copy">
        <small>RFID tap failed.</small>
        <h2>Unrecognized</h2>
        <p>Please contact an administrator for assistance.</p>
      </div>

      <div className="admin-rfid-card">
        <KeyRound size={26} />
        <span>
          <strong>Tap Admin RFID</strong>
          <small>Place admin card on the RFID reader.</small>
        </span>
      </div>

      <label className="rfid-scan-input admin-rfid-input">
        <span>Admin RFID</span>
        <input
          autoFocus
          onChange={(event) => onAdminRfidChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onAdminRfidSubmit();
            }
          }}
          placeholder="Enter admin RFID"
          value={adminRfidValue}
        />
      </label>

      <p className="return-note">Returning to home screen in {countdown} seconds...</p>
    </section>
  );
}
