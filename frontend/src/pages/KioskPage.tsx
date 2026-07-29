import { Check, CircleUserRound, IdCard, Info, Plus, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';

type KioskState =
  | 'idle'
  | 'processing'
  | 'recognized'
  | 'unregistered'
  | 'enrollmentIntro'
  | 'rfidEnrollment'
  | 'enrollment';
type RecognizedUser = {
  department: string;
  employeeId: string;
  name: string;
};
type KioskTerminalInput = {
  rfidUid: string | null;
  nonce: number;
};
type KioskScanResponse = {
  department?: string | null;
  employeeId?: string;
  failedAttempts?: number;
  result?: 'Granted' | 'Denied';
  userName?: string;
};
type AdminRfidResponse = {
  adminName: string;
  authorized: boolean;
};
type EnrollmentRfidResponse = {
  rfidUid: string;
};
type RealtimeMessage = {
  payload?: {
    fullName?: string;
    requestCode?: string;
  };
  type?: string;
};
type NetworkInfoResponse = {
  lanIp?: string | null;
};

function getApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

  if (
    typeof window === 'undefined' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  ) {
    return configuredUrl;
  }

  return configuredUrl.replace(
    /\/\/(localhost|127\.0\.0\.1)(?=:)/,
    `//${window.location.hostname}`,
  );
}

const API_BASE_URL = getApiBaseUrl();
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
const fallbackRecognizedUser = {
  name: 'Juan Dela Cruz',
  employeeId: 'EMP-000123',
  department: 'Information Technology',
};

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

const modeCopy = {
  idle: {
    eyebrow: 'Idle Prompt',
    title: 'Tap Your ID',
    description: 'Place ID on the scanner',
  },
  processing: {
    eyebrow: 'Processing',
    title: 'Verifying RFID',
    description: 'Please keep your ID on the scanner',
  },
  recognized: {
    eyebrow: 'Success',
    title: 'Attendance Recorded Successfully!',
    description: 'Thank you. Have a great day!',
  },
  unregistered: {
    eyebrow: 'Unregistered',
    title: 'Unrecognized',
    description: "We couldn't verify your RFID. Please contact an administrator.",
  },
  enrollment: {
    eyebrow: 'Enrollment Mode',
    title: 'Register New User',
    description: 'Follow the steps below to complete your registration.',
  },
  enrollmentIntro: {
    eyebrow: 'Enrollment Mode',
    title: 'Register New User',
    description: 'Follow the steps below to complete your registration.',
  },
  rfidEnrollment: {
    eyebrow: 'RFID Enrollment',
    title: 'Place the New RFID',
    description: 'Admin authorized registration. Place the new RFID on the scanner.',
  },
};

export function KioskPage() {
  const [kioskState, setKioskState] = useState<KioskState>('idle');
  const [recognizedUser, setRecognizedUser] = useState<RecognizedUser>(fallbackRecognizedUser);
  const [, setEnrollmentRfidUid] = useState('');
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [doorAlert, setDoorAlert] = useState('');
  const [recognizedCountdown, setRecognizedCountdown] = useState(5);
  const [enrollmentIntroCountdown, setEnrollmentIntroCountdown] = useState(5);
  const [unregisteredCountdown, setUnregisteredCountdown] = useState(8);
  const lastProcessedNonce = useRef(0);
  const adminRfidAcceptedNonce = useRef(0);
  const isUnrecognizedUser = kioskState === 'unregistered';
  const isEnrollmentIntro = kioskState === 'enrollmentIntro';
  const isRfidEnrollment = kioskState === 'rfidEnrollment';
  const currentTimeLabel = kioskTimeFormatter.format(currentDateTime);
  const currentDateLabel = kioskDateFormatter.format(currentDateTime);

  const enterUnregisteredState = useCallback(() => {
    setUnregisteredCountdown(8);
    setKioskState('unregistered');
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const scanRfid = useCallback(
    (rfidUid: string) => {
      setKioskState('processing');
      setDoorAlert('');

      window.setTimeout(() => {
        void fetch(`${API_BASE_URL}/kiosk/rfid-scan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ rfidUid }),
        })
          .then(async (response) => {
            const data = (await response.json().catch(() => null)) as KioskScanResponse | null;
            const isRegistered = response.ok && data?.result === 'Granted';

            if (isRegistered) {
              setRecognizedUser({
                department: data.department ?? 'Unassigned',
                employeeId: data.employeeId ?? 'Unknown',
                name: data.userName ?? 'Recognized User',
              });
              setDoorAlert('The door is unlocked!');
              setRecognizedCountdown(5);
              setKioskState('recognized');
              return;
            }

            setDoorAlert('Door locked');
            enterUnregisteredState();
          })
          .catch(() => {
            setDoorAlert('Door locked');
            enterUnregisteredState();
          });
      }, 1200);
    },
    [enterUnregisteredState],
  );

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

          setDoorAlert('');
          adminRfidAcceptedNonce.current = inputNonce;
          setEnrollmentIntroCountdown(5);
          setKioskState('enrollmentIntro');
        })
        .catch(() => {
          setDoorAlert('Unable to verify admin RFID. Registration locked.');
        });
    },
    [isUnrecognizedUser],
  );

  const registerEnrollmentRfid = useCallback(
    (rfidUid: string) => {
      if (!isRfidEnrollment) {
        return;
      }

      void fetch(`${API_BASE_URL}/kiosk/enrollment-rfid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rfidUid }),
      })
        .then(async (response) => {
          const data = (await response.json().catch(() => null)) as
            | EnrollmentRfidResponse
            | { error?: string }
            | null;
          const capturedRfidUid = data && 'rfidUid' in data ? data.rfidUid : null;

          if (!response.ok || !capturedRfidUid) {
            setDoorAlert(
              data && 'error' in data && data.error ? data.error : 'Unable to capture RFID.',
            );
            return;
          }

          setEnrollmentRfidUid(capturedRfidUid);
          setDoorAlert('');
          setKioskState('enrollment');
        })
        .catch(() => {
          setDoorAlert('Unable to capture RFID.');
        });
    },
    [isRfidEnrollment],
  );

  const captureEnrollmentRfid = useCallback(
    (rfidUid: string) => {
      registerEnrollmentRfid(rfidUid);
    },
    [registerEnrollmentRfid],
  );

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
          const rfidUid = input?.rfidUid?.trim();

          if (!input || input.nonce <= lastProcessedNonce.current) {
            return;
          }

          if (isEnrollmentIntro) {
            return;
          }

          lastProcessedNonce.current = input.nonce;

          if (isRfidEnrollment && rfidUid && input.nonce > adminRfidAcceptedNonce.current) {
            captureEnrollmentRfid(rfidUid);
            return;
          }

          if (isUnrecognizedUser) {
            if (rfidUid) {
              scanAdminRfid(rfidUid, input.nonce);
            }

            return;
          }

          if (isRfidEnrollment) {
            setDoorAlert('Place the new RFID on the scanner.');
            return;
          }

          if (rfidUid) {
            scanRfid(rfidUid);
          }
        })
        .catch(() => {
          // The terminal bridge is optional while the hardware scanner is unavailable.
        });
    }, 600);

    return () => window.clearInterval(intervalId);
  }, [
    captureEnrollmentRfid,
    isEnrollmentIntro,
    isRfidEnrollment,
    isUnrecognizedUser,
    scanAdminRfid,
    scanRfid,
  ]);

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

          setEnrollmentRfidUid('');
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
    if (kioskState !== 'recognized') {
      return;
    }

    const intervalId = window.setInterval(() => {
      setRecognizedCountdown((current) => Math.max(current - 1, 0));
    }, 1000);

    const timeoutId = window.setTimeout(() => {
      setKioskState('idle');
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [kioskState]);

  useEffect(() => {
    if (kioskState !== 'unregistered') {
      return;
    }

    const intervalId = window.setInterval(() => {
      setUnregisteredCountdown((current) => Math.max(current - 1, 0));
    }, 1000);

    const timeoutId = window.setTimeout(() => {
      setDoorAlert('');
      setKioskState('idle');
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [kioskState]);

  useEffect(() => {
    if (kioskState !== 'enrollmentIntro') {
      return;
    }

    const intervalId = window.setInterval(() => {
      setEnrollmentIntroCountdown((current) => Math.max(current - 1, 0));
    }, 1000);

    const timeoutId = window.setTimeout(() => {
      setKioskState('rfidEnrollment');
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
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
              <IdCard size={20} />
            </span>
            <span>
              <strong>EINGRESS</strong>
              <small>ATTENDANCE KIOSK</small>
            </span>
          </div>

          <div className="kiosk-clock" aria-label="Current kiosk time">
            <strong>{currentTimeLabel}</strong>
            <small>{currentDateLabel}</small>
          </div>
        </header>

        <div className="kiosk-body">
          {kioskState === 'recognized' ? (
            <RecognizedState countdown={recognizedCountdown} user={recognizedUser} />
          ) : isUnrecognizedUser ? (
            <UnregisteredState countdown={unregisteredCountdown} />
          ) : isEnrollmentIntro ? (
            <EnrollmentIntroState countdown={enrollmentIntroCountdown} />
          ) : isRfidEnrollment ? (
            <RfidEnrollmentState />
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
        <span className="id-tap-symbol" aria-hidden="true">
          <span className="rfid-id-card-symbol">
            <i />
            <span>
              <b />
              <b />
              <b />
            </span>
          </span>
        </span>
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {isProcessing ? <span className="processing-bar" aria-hidden="true" /> : null}
    </section>
  );
}

function RecognizedState({ countdown, user }: { countdown: number; user: RecognizedUser }) {
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
            <strong>Recorded! Door will open shortly.</strong>
            <small>Thank you. Have a great day!</small>
          </span>
        </div>
      </div>

      <div
        className="return-timer"
        role="timer"
        aria-label={`Returning home in ${countdown} seconds`}
      >
        <span>{countdown}</span>
        <small>Returning home screen in seconds</small>
      </div>
    </section>
  );
}

function UnregisteredState({ countdown }: { countdown: number }) {
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
        <p>We couldn't verify your RFID. Scan an admin RFID to open registration.</p>
      </div>
      <div className="admin-rfid-card">
        <IdCard size={26} />
        <span>
          <strong>Scan Admin RFID</strong>
          <small>Place admin card on the RFID reader.</small>
        </span>
      </div>

      <div
        className="return-timer"
        role="timer"
        aria-label={`Returning to idle in ${countdown} seconds`}
      >
        <span>{countdown}</span>
        <small>Returning to idle in seconds</small>
      </div>
    </section>
  );
}

function EnrollmentIntroState({ countdown }: { countdown: number }) {
  return (
    <section className="enrollment-layout enrollment-intro-layout" aria-live="polite">
      <div className="enrollment-symbol">
        <CircleUserRound size={58} />
        <Plus size={28} />
      </div>

      <div className="enrollment-copy">
        <p>Enrollment Mode</p>
        <h2>Register New User</h2>
        <span>Follow the steps below to complete your registration.</span>

        <ol>
          <li>Scan your RFID</li>
          <li>Fill out the registration form</li>
          <li>Wait for admin approval</li>
        </ol>
      </div>

      <div
        className="return-timer enrollment-intro-timer"
        role="timer"
        aria-label={`Starting RFID enrollment in ${countdown} seconds`}
      >
        <span>{countdown}</span>
        <small>Starting RFID enrollment in seconds</small>
      </div>

      <div className="enrollment-help">
        <Info size={16} />
        For assistance, please contact the administrator.
      </div>
    </section>
  );
}

function RfidEnrollmentState() {
  return (
    <section className="fingerprint-prompt" aria-live="polite">
      <div className="fingerprint-orb">
        <span className="id-tap-symbol" aria-hidden="true">
          <span className="rfid-id-card-symbol">
            <i />
            <span>
              <b />
              <b />
              <b />
            </span>
          </span>
        </span>
      </div>
      <h2>Place the New RFID</h2>
      <p>Place the new RFID on the scanner.</p>
    </section>
  );
}

function EnrollmentState() {
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

    return () => {
      controller.abort();
    };
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
          <span>Scan this QR</span>
          {qrCodeUrl ? <img alt="Enrollment form QR code" src={qrCodeUrl} /> : null}
          <small>{registrationUrl}</small>
        </div>
      </div>

      <div className="enrollment-help">
        <Info size={16} />
        For assistance, please contact the administrator.
      </div>
    </section>
  );
}
