import { CircleHelp, IdCard, KeyRound, Mail, ShieldAlert, UserPlus, X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';

export function AuthHelpButton() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const handleClose = () => {
      dialog.returnValue = '';
    };
    dialog.addEventListener('close', handleClose);

    if ('closedBy' in HTMLDialogElement.prototype) {
      return () => {
        dialog.removeEventListener('close', handleClose);
      };
    }

    const isOutside = (event: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      );
    };

    let pressedOutside = false;

    const handlePointerDown = (event: PointerEvent) => {
      pressedOutside = isOutside(event);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (pressedOutside && isOutside(event)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('pointerup', handlePointerUp);

    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('pointerdown', handlePointerDown);
      dialog.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  function openHelpDialog() {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  function closeHelpDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button className="help-link" onClick={openHelpDialog} type="button">
        <CircleHelp size={18} aria-hidden="true" />
        Need help?
      </button>

      <dialog
        aria-labelledby={titleId}
        className="auth-help-dialog"
        ref={dialogRef}
        {...({ closedby: 'any' } as Record<string, string>)}
      >
        <div className="auth-help-header">
          <div>
            <h1 id={titleId}>Sign-In Help &amp; Support</h1>
            <p>Quick troubleshooting and support resources for EINGRESS access.</p>
          </div>
          <form method="dialog">
            <button
              aria-label="Close help dialog"
              className="auth-help-close"
              type="submit"
              value="close"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </form>
        </div>

        <div className="auth-help-body">
          <ul className="auth-help-list">
            <li>
              <span className="auth-help-icon" aria-hidden="true">
                <KeyRound size={18} />
              </span>
              <div>
                <strong>Forgot your password?</strong>
                <p>
                  Reset your administrator password using your registered email address.{' '}
                  <Link onClick={closeHelpDialog} to="/forgot-password">
                    Go to Forgot Password
                  </Link>
                </p>
              </div>
            </li>

            <li>
              <span className="auth-help-icon" aria-hidden="true">
                <IdCard size={18} />
              </span>
              <div>
                <strong>RFID verification issues</strong>
                <p>
                  When Admin RFID verification is enabled, scan your assigned admin RFID card or
                  enter its code. If your card is lost or unrecognized, ask a system administrator
                  to update it in Settings.
                </p>
              </div>
            </li>

            <li>
              <span className="auth-help-icon" aria-hidden="true">
                <ShieldAlert size={18} />
              </span>
              <div>
                <strong>Account locked or inactive</strong>
                <p>
                  Repeated failed sign-in attempts temporarily lock the account. Wait for the
                  lockout period to finish, or contact your system administrator to restore access.
                </p>
              </div>
            </li>

            <li>
              <span className="auth-help-icon" aria-hidden="true">
                <UserPlus size={18} />
              </span>
              <div>
                <strong>Need to register as an employee?</strong>
                <p>
                  Submit your details through the enrollment form after capturing your RFID card at
                  the kiosk.{' '}
                  <Link onClick={closeHelpDialog} to="/register">
                    Open Enrollment Form
                  </Link>
                </p>
              </div>
            </li>
          </ul>

          <div className="auth-help-contact">
            <Mail size={18} aria-hidden="true" />
            <div>
              <strong>Still need assistance?</strong>
              <p>
                Contact your EINGRESS System Administrator or IT Helpdesk at{' '}
                <a href="mailto:support@eingress.local">support@eingress.local</a>.
              </p>
            </div>
          </div>
        </div>

        <form className="auth-help-footer" method="dialog">
          <button autoFocus className="primary-action-button" type="submit" value="close">
            Close
          </button>
        </form>
      </dialog>
    </>
  );
}
