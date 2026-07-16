import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  EyeOff,
  Filter,
  Fingerprint,
  HardDrive,
  Monitor,
  Pencil,
  Power,
  Search,
  TrendingUp,
  UsersRound,
  X,
} from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { formatDate, formatDateTime, formatTime } from '../lib/dateTimeFormat';
import { setSecuritySettings } from '../lib/securitySettingsStore';
import {
  DateTimeSettings,
  setDateTimeSettings,
  useDateTimeSettings,
} from '../lib/systemSettingsStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api$/, '/ws');

const deviceRows = [
  ['DEV-001', 'Main Entrance', 'RFID Reader', 'Office', '192.168.1.10', 'Online', 'May 20'],
  ['DEV-002', 'HR Office Bio', 'Biometric', 'HR Office', '192.168.1.11', 'Online', 'May 20'],
  ['DEV-003', 'Production Door', 'RFID Reader', 'Production', '192.168.1.12', 'Offline', 'May 20'],
  ['DEV-004', 'Finance Bio', 'Biometric', 'Finance', '192.168.1.13', 'Online', 'May 20'],
  [
    'DEV-005',
    'Warehouse Reader',
    'RFID Reader',
    'Warehouse',
    '192.168.1.14',
    'Maintenance',
    'May 20',
  ],
  ['DEV-006', 'IT Room Bio', 'Biometric', 'IT Room', '192.168.1.15', 'Online', 'May 20'],
];

type EnrollmentRequest = {
  department: string;
  employee_id: string;
  email?: string | null;
  fingerprint_template?: string | null;
  full_name: string;
  id: number;
  phone?: string | null;
  rejection_reason?: string | null;
  rfid_uid: string | null;
  request_code: string;
  request_type: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  submitted_at: string;
};

type EnrollmentStatusFilter = EnrollmentRequest['status'] | 'All';

type AttendanceRecord = {
  attendance_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  department: string | null;
  employee_id: string;
  full_name: string;
  id: number;
  location: string | null;
  role: string | null;
  status: string;
};

type AttendanceSummary = {
  absent: number;
  late: number;
  present: number;
  total_records: number;
};

type UserRecord = {
  created_at: string;
  department: string | null;
  email: string | null;
  employee_id: string;
  expiration_date?: string | null;
  fingerprint_id: string | null;
  full_name: string;
  id: number;
  is_active: boolean;
  is_archived?: boolean;
  phone: string | null;
  rfid_uid: string | null;
  role: string | null;
  updated_at: string;
};

type UserDisplayRow = {
  accessStatus: 'Active' | 'Disabled';
  accessTone: 'success' | 'danger';
  avatar: string;
  avatarTone: string;
  biometricStatus: 'Registered' | 'Missing';
  biometricTone: 'success' | 'danger';
  department: string;
  employeeId: string;
  expirationDate: string | null;
  id: number;
  name: string;
  online: boolean;
  rfidUid: string;
  role: string;
};

type AuditLogRecord = {
  action: string;
  admin_name: string | null;
  created_at: string;
  details: string | null;
  id: number | string;
  ip_address: string | null;
  module: string;
};

type AuditLogPagination = {
  page: number;
  pageSize: number;
  totalPages: number;
  totalRecords: number;
};

const AUDIT_LOGS_PAGE_SIZE = 10;

type SystemSettings = {
  admin_rfid_enabled: boolean;
  auto_logout_enabled: boolean;
  database_status: string;
  date_format: string;
  first_day_of_week: string;
  idle_timeout_warning_minutes: number;
  keep_me_logged_in: boolean;
  last_backup_at: string | null;
  lockout_duration_minutes: number;
  lockout_enabled: boolean;
  max_failed_attempts: number;
  reset_failed_attempts_after_minutes: number;
  session_timeout_minutes: number;
  system_language: string;
  system_version: string;
  time_format: string;
  time_zone: string;
};

type AdminSettingsProfile = {
  email: string;
  name: string;
  rfidUid: string;
  role: string;
};

function isAdminSettingsProfile(value: unknown): value is AdminSettingsProfile {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<AdminSettingsProfile>;
  return (
    typeof candidate.email === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.rfidUid === 'string' &&
    typeof candidate.role === 'string'
  );
}

const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  admin_rfid_enabled: true,
  auto_logout_enabled: true,
  database_status: 'Healthy',
  date_format: 'MM/DD/YYYY',
  first_day_of_week: 'Monday',
  idle_timeout_warning_minutes: 5,
  keep_me_logged_in: false,
  last_backup_at: null,
  lockout_duration_minutes: 30,
  lockout_enabled: false,
  max_failed_attempts: 5,
  reset_failed_attempts_after_minutes: 15,
  session_timeout_minutes: 30,
  system_language: 'English',
  system_version: 'v2.1.0',
  time_format: '12-Hour (hh:mm AM/PM)',
  time_zone: '(UTC+08:00) Asia/Manila',
};

const DATE_FORMAT_OPTIONS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'];

const TIME_FORMAT_OPTIONS = ['12-Hour (hh:mm AM/PM)', '24-Hour (HH:mm)'];

const FIRST_DAY_OF_WEEK_OPTIONS = ['Monday', 'Sunday'];

const TIME_ZONE_OPTIONS = [
  '(UTC-08:00) America/Los_Angeles',
  '(UTC-05:00) America/New_York',
  '(UTC+00:00) UTC',
  '(UTC+00:00) Europe/London',
  '(UTC+08:00) Asia/Manila',
  '(UTC+08:00) Asia/Singapore',
  '(UTC+08:00) Asia/Hong_Kong',
  '(UTC+08:00) Asia/Shanghai',
  '(UTC+09:00) Asia/Tokyo',
  '(UTC+10:00) Australia/Sydney',
];

function withCurrentOption(options: string[], current: string): string[] {
  return options.includes(current) ? options : [current, ...options];
}

type UserEditForm = {
  fullName: string;
  rfidUid: string;
  role: string;
  fingerprintId: string;
};

type CreateUserForm = {
  employeeId: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  role: string;
  rfidUid: string;
  fingerprintId: string;
  scanBiometrics: boolean;
};

type KioskInput = {
  nonce?: number;
  rfidUid?: string;
};

type RfidRealtimeMessage = {
  payload?: {
    rfidUid?: string;
  };
  type?: string;
};

function isEnrollmentRequest(value: unknown): value is EnrollmentRequest {
  return typeof value === 'object' && value !== null && 'id' in value && 'status' in value;
}

function PageHeader({ description, title }: { description: string; title: string }) {
  return (
    <header className="module-header">
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

function EnrollmentFilterRow({
  dateFilter,
  departmentFilter,
  departments,
  nameFilter,
  onClear,
  onDateChange,
  onDepartmentChange,
  onNameChange,
  onStatusChange,
  statusFilter,
}: {
  dateFilter: string;
  departmentFilter: string;
  departments: string[];
  nameFilter: string;
  onClear: () => void;
  onDateChange: (value: string) => void;
  onDepartmentChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onStatusChange: (value: EnrollmentStatusFilter) => void;
  statusFilter: EnrollmentStatusFilter;
}) {
  return (
    <div className="enrollment-search-row">
      <input
        aria-label="Filter by date"
        onChange={(event) => onDateChange(event.target.value)}
        type="date"
        value={dateFilter}
      />
      <select
        aria-label="Filter by department"
        onChange={(event) => onDepartmentChange(event.target.value)}
        value={departmentFilter}
      >
        <option value="All">All Departments</option>
        {departments.map((department) => (
          <option key={department} value={department}>
            {department}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by status"
        onChange={(event) => onStatusChange(event.target.value as EnrollmentStatusFilter)}
        value={statusFilter}
      >
        <option value="All">All Status</option>
        <option value="Pending">Pending</option>
        <option value="Approved">Approved</option>
        <option value="Rejected">Rejected</option>
      </select>
      <input
        aria-label="Search by name or ID"
        onChange={(event) => onNameChange(event.target.value)}
        placeholder="Search by name or ID..."
        type="search"
        value={nameFilter}
      />
      <button className="filter-button" onClick={onClear} type="button">
        Filter
        <Filter size={16} />
      </button>
    </div>
  );
}

function ModuleTable({
  actionRenderer,
  actionsWidth = 182,
  columns,
  emptyMessage = 'No records found.',
  errorMessage,
  isLoading = false,
  onPageChange,
  pagination,
  rows,
  title,
  withActions = false,
}: {
  actionRenderer?: (rowIndex: number) => ReactNode;
  actionsWidth?: number;
  columns: string[];
  emptyMessage?: string;
  errorMessage?: string;
  isLoading?: boolean;
  onPageChange?: (page: number) => void;
  pagination?: { page: number; pageSize: number; totalPages: number; totalRecords: number };
  rows: string[][];
  title: string;
  withActions?: boolean;
}) {
  const fillerRowCount =
    pagination && rows.length > 0 && rows.length < pagination.pageSize
      ? pagination.pageSize - rows.length
      : 0;

  const tableMinWidth = Math.max(900, columns.length * 130 + (withActions ? actionsWidth : 0));

  return (
    <section className="module-panel" aria-labelledby={`${title.replaceAll(' ', '-')}-title`}>
      <h2 id={`${title.replaceAll(' ', '-')}-title`}>{title}</h2>
      <div className="module-table-wrap">
        <table
          className={withActions ? 'module-table has-actions' : 'module-table'}
          style={{ minWidth: tableMinWidth }}
        >
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
              {withActions ? <th style={{ width: actionsWidth }}>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  className="module-table-message"
                  colSpan={columns.length + (withActions ? 1 : 0)}
                >
                  Loading {title.toLowerCase()}...
                </td>
              </tr>
            ) : errorMessage ? (
              <tr>
                <td
                  className="module-table-message error"
                  colSpan={columns.length + (withActions ? 1 : 0)}
                >
                  {errorMessage}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  className="module-table-message"
                  colSpan={columns.length + (withActions ? 1 : 0)}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr key={row.join('-')}>
                  {row.map((cell, index) => (
                    <td key={`${cell}-${index}`}>
                      {isStatusColumn(columns[index]) ? (
                        <span className={`module-status ${statusTone(cell)}`}>{cell}</span>
                      ) : index === 1 ? (
                        <strong className="module-cell-text">{cell}</strong>
                      ) : (
                        <span className="module-cell-text">{cell}</span>
                      )}
                    </td>
                  ))}
                  {withActions ? (
                    <td style={{ width: actionsWidth }}>
                      {actionRenderer ? (
                        actionRenderer(rowIndex)
                      ) : (
                        <span className="table-actions">
                          <button
                            className="tiny-action approve"
                            type="button"
                            aria-label="Approve"
                          >
                            <Check size={14} />
                          </button>
                          <button className="tiny-action reject" type="button" aria-label="Reject">
                            <X size={14} />
                          </button>
                          <button className="tiny-view" type="button">
                            View
                          </button>
                        </span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))
            )}
            {Array.from({ length: fillerRowCount }, (_, fillerIndex) => (
              <tr
                key={`filler-${fillerIndex}`}
                className="module-table-filler-row"
                aria-hidden="true"
              >
                {Array.from({ length: columns.length + (withActions ? 1 : 0) }, (_, cellIndex) => (
                  <td key={cellIndex}>&nbsp;</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && onPageChange ? (
        <ModuleTablePagination pagination={pagination} onPageChange={onPageChange} />
      ) : (
        <div className="module-pagination">
          <span>Showing 1 to {rows.length} entries</span>
          <span>
            <button className="active">1</button>
            <button>2</button>
            <button>3</button>
            <button>&gt;</button>
          </span>
        </div>
      )}
    </section>
  );
}

function ModuleTablePagination({
  onPageChange,
  pagination,
}: {
  onPageChange: (page: number) => void;
  pagination: { page: number; totalPages: number; totalRecords: number };
}) {
  const { page, totalPages, totalRecords } = pagination;
  const pageSize = totalRecords > 0 && totalPages > 0 ? Math.ceil(totalRecords / totalPages) : 0;
  const rangeStart = totalRecords === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalRecords);

  const pageNumbers: number[] = [];
  const windowStart = Math.max(1, Math.min(page - 1, totalPages - 2));
  const windowEnd = Math.min(totalPages, windowStart + 2);
  for (let pageNumber = windowStart; pageNumber <= windowEnd; pageNumber += 1) {
    pageNumbers.push(pageNumber);
  }

  return (
    <div className="module-pagination">
      <span>
        Showing {rangeStart} to {rangeEnd} of {totalRecords} entries
      </span>
      <span>
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          type="button"
          aria-label="Previous page"
        >
          &lt;
        </button>
        {pageNumbers.map((pageNumber) => (
          <button
            key={pageNumber}
            className={pageNumber === page ? 'active' : ''}
            onClick={() => onPageChange(pageNumber)}
            type="button"
          >
            {pageNumber}
          </button>
        ))}
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          type="button"
          aria-label="Next page"
        >
          &gt;
        </button>
      </span>
    </div>
  );
}

function isStatusColumn(column: string) {
  return column === 'Status';
}

function statusTone(status: string) {
  if (status === 'Present' || status === 'Online' || status === 'Approved') {
    return 'success';
  }

  if (status === 'Late' || status === 'Pending' || status === 'Maintenance') {
    return 'warning';
  }

  return 'danger';
}

function formatSubmittedDate(value: string, settings: DateTimeSettings) {
  return formatDate(value, settings);
}

function formatExpiryCountdown(
  expirationDate: string,
  now: number,
): { isExpired: boolean; label: string } {
  const remainingMs = new Date(expirationDate).getTime() - now;

  if (Number.isNaN(remainingMs) || remainingMs <= 0) {
    return { isExpired: true, label: 'Expired' };
  }

  const days = Math.floor(remainingMs / 86_400_000);
  const hours = Math.floor((remainingMs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remainingMs % 3_600_000) / 60_000);

  if (days > 0) {
    return { isExpired: false, label: `${days}d ${hours}h` };
  }

  if (hours > 0) {
    return { isExpired: false, label: `${hours}h ${minutes}m` };
  }

  return { isExpired: false, label: `${minutes}m` };
}

function formatClockTime(value: string | null, settings: DateTimeSettings) {
  if (!value) {
    return '-';
  }

  return formatTime(value, settings) || '-';
}

function hasCheckedOut(checkInAt: string | null, checkOutAt: string | null) {
  if (!checkInAt || !checkOutAt) {
    return false;
  }

  const checkInTime = new Date(checkInAt).getTime();
  const checkOutTime = new Date(checkOutAt).getTime();

  return !Number.isNaN(checkInTime) && !Number.isNaN(checkOutTime) && checkOutTime !== checkInTime;
}

function formatTotalHours(checkInAt: string | null, checkOutAt: string | null) {
  if (!hasCheckedOut(checkInAt, checkOutAt)) {
    return '-';
  }

  const checkInTime = new Date(checkInAt as string).getTime();
  const checkOutTime = new Date(checkOutAt as string).getTime();

  if (checkOutTime < checkInTime) {
    return '-';
  }

  const totalMinutes = Math.round((checkOutTime - checkInTime) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours} hrs ${minutes} mins`;
}

function toDateInputValue(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '--';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function getAvatarTone(index: number) {
  const tones = ['violet', 'lavender', 'sky', 'mint', 'gold', 'rose', 'teal'];
  return tones[index % tones.length];
}

const USER_ROLE_OPTIONS = ['Employee', 'Student', 'Staff', 'Intern'];

function maskRfid(value: string) {
  if (!value || value === '-') {
    return '-';
  }

  return '••••••••';
}

function toUserDisplayRow(user: UserRecord, index: number): UserDisplayRow {
  const hasBiometric = Boolean(user.fingerprint_id);
  const isStudent = (user.role || '').trim().toLowerCase() === 'student';
  const expirationDate = isStudent ? (user.expiration_date ?? null) : null;

  return {
    accessStatus: user.is_active ? 'Active' : 'Disabled',
    accessTone: user.is_active ? 'success' : 'danger',
    avatar: getInitials(user.full_name),
    avatarTone: getAvatarTone(index),
    biometricStatus: hasBiometric ? 'Registered' : 'Missing',
    biometricTone: hasBiometric ? 'success' : 'danger',
    department: user.department || '-',
    employeeId: user.employee_id,
    expirationDate,
    id: user.id,
    name: user.full_name,
    online: user.is_active,
    rfidUid: user.rfid_uid || '-',
    role: user.role || 'Employee',
  };
}

function MetricCards({
  cards,
}: {
  cards: Array<{ Icon: typeof UsersRound; label: string; tone: string; value: string }>;
}) {
  return (
    <div className="module-stats-grid">
      {cards.map(({ Icon, label, tone, value }) => (
        <article className="module-stat-card" key={label}>
          <span className={`stat-icon ${tone}`}>
            <Icon size={30} />
          </span>
          <div>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>vs yesterday</small>
          </div>
          <em>+ 12.5%</em>
        </article>
      ))}
    </div>
  );
}

function attendanceStatusIcon(status: string) {
  if (status === 'Registered') {
    return <Fingerprint size={14} />;
  }

  if (status === 'Active') {
    return <CheckCircle2 size={14} />;
  }

  if (status === 'Pending' || status === 'Restricted') {
    return <Clock3 size={14} />;
  }

  return <AlertTriangle size={14} />;
}

export function UserManagementPage() {
  const { session } = useAuth();
  const dateTimeSettings = useDateTimeSettings();
  const [now, setNow] = useState(() => Date.now());
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [usersErrorMessage, setUsersErrorMessage] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All Roles');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [editForm, setEditForm] = useState<UserEditForm>({
    fullName: '',
    rfidUid: '',
    role: 'Employee',
    fingerprintId: '',
  });
  const [editFormError, setEditFormError] = useState('');
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    employeeId: '',
    fullName: '',
    email: '',
    phone: '',
    department: '',
    role: 'Employee',
    rfidUid: '',
    fingerprintId: '',
    scanBiometrics: false,
  });
  const [createFormError, setCreateFormError] = useState('');
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isRfidScannerOpen, setIsRfidScannerOpen] = useState(false);
  const [isFingerprintScannerOpen, setIsFingerprintScannerOpen] = useState(false);
  const [rfidScanInput, setRfidScanInput] = useState('');
  const [fingerprintScanInput, setFingerprintScanInput] = useState('');
  const [rfidScanBaselineNonce, setRfidScanBaselineNonce] = useState(0);
  const [visibleRfidUserIds, setVisibleRfidUserIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadUsers() {
      if (!session?.accessToken) {
        setUsersErrorMessage('Please sign in again to view users.');
        setIsLoadingUsers(false);
        return;
      }

      try {
        setIsLoadingUsers(true);
        setUsersErrorMessage('');

        const response = await fetch(`${API_BASE_URL}/users`, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
          signal: controller.signal,
        });

        const data = (await response.json().catch(() => null)) as
          | UserRecord[]
          | { error?: string }
          | null;

        if (!response.ok || !Array.isArray(data)) {
          throw new Error(
            !Array.isArray(data) && data?.error ? data.error : 'Unable to load users.',
          );
        }

        setUsers(data);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setUsersErrorMessage(error instanceof Error ? error.message : 'Unable to load users.');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingUsers(false);
        }
      }
    }

    void loadUsers();

    return () => {
      controller.abort();
    };
  }, [session?.accessToken]);

  useEffect(() => {
    if (!isRfidScannerOpen) {
      return;
    }

    let isCancelled = false;

    async function readKioskInput() {
      try {
        const response = await fetch(`/kiosk-input.json?t=${Date.now()}`, { cache: 'no-store' });
        const input = (await response.json().catch(() => null)) as KioskInput | null;
        const rfidUid = input?.rfidUid?.trim();
        const nonce = Number(input?.nonce ?? 0);

        if (!isCancelled && rfidUid && nonce > rfidScanBaselineNonce) {
          if (editingUser) {
            setEditForm((currentForm) => ({ ...currentForm, rfidUid }));
          } else if (isCreateUserOpen) {
            setCreateForm((currentForm) => ({ ...currentForm, rfidUid }));
          }
          setRfidScanInput('');
          setIsRfidScannerOpen(false);
        }
      } catch {
        // The scanner bridge may be unavailable while no hardware tap is present.
      }
    }

    const intervalId = window.setInterval(() => {
      void readKioskInput();
    }, 650);

    void readKioskInput();

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [editingUser, isCreateUserOpen, isRfidScannerOpen, rfidScanBaselineNonce]);

  useEffect(() => {
    if (!isRfidScannerOpen) {
      return;
    }

    let socket: WebSocket | null = null;
    let shouldReconnect = true;
    let reconnectTimeoutId: number | null = null;

    function captureRfidUid(rfidUid: string) {
      setEditForm((currentForm) => ({ ...currentForm, rfidUid }));
      setRfidScanInput('');
      setIsRfidScannerOpen(false);
    }

    function connectRealtimeSocket() {
      socket = new WebSocket(WS_BASE_URL);

      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data as string) as RfidRealtimeMessage;
          const rfidUid = message.payload?.rfidUid?.trim();

          if (
            (message.type === 'rfid:scanned' || message.type === 'enrollment:rfid-captured') &&
            rfidUid
          ) {
            captureRfidUid(rfidUid);
          }
        } catch {
          // Ignore realtime messages that are not RFID scan payloads.
        }
      });

      socket.addEventListener('close', () => {
        if (!shouldReconnect) {
          return;
        }

        reconnectTimeoutId = window.setTimeout(connectRealtimeSocket, 1200);
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
  }, [isRfidScannerOpen]);

  async function updateUserStatus(id: number, isActive: boolean) {
    if (!session?.accessToken) {
      setUsersErrorMessage('Please sign in again to update users.');
      return;
    }

    try {
      setUpdatingUserId(id);
      setUsersErrorMessage('');

      const response = await fetch(`${API_BASE_URL}/users/${id}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive }),
      });

      const data = (await response.json().catch(() => null)) as
        | UserRecord
        | { error?: string }
        | null;

      if (!response.ok || !('id' in (data ?? {}))) {
        throw new Error(
          data && typeof data === 'object' && 'error' in data
            ? data.error
            : 'Unable to update user.',
        );
      }

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === id ? { ...user, is_active: isActive, is_archived: false } : user,
        ),
      );
      window.alert(isActive ? 'User reactivated successfully.' : 'User deactivated successfully.');
    } catch (error) {
      setUsersErrorMessage(error instanceof Error ? error.message : 'Unable to update user.');
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function archiveUser(id: number) {
    if (!session?.accessToken) {
      setUsersErrorMessage('Please sign in again to update users.');
      return;
    }

    try {
      setUpdatingUserId(id);
      setUsersErrorMessage('');

      const response = await fetch(`${API_BASE_URL}/users/${id}/archive`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isArchived: true }),
      });

      const data = (await response.json().catch(() => null)) as
        | UserRecord
        | { error?: string }
        | null;

      if (!response.ok || !('id' in (data ?? {}))) {
        throw new Error(
          data && typeof data === 'object' && 'error' in data
            ? data.error
            : 'Unable to archive user.',
        );
      }

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === id ? { ...user, is_active: false, is_archived: true } : user,
        ),
      );
      window.alert('User archived successfully.');
    } catch (error) {
      setUsersErrorMessage(error instanceof Error ? error.message : 'Unable to archive user.');
    } finally {
      setUpdatingUserId(null);
    }
  }

  function openUserEditor(userId: number) {
    const user = users.find((currentUser) => currentUser.id === userId);

    if (!user) {
      return;
    }

    setEditingUser(user);
    setEditForm({
      fullName: user.full_name,
      rfidUid: user.rfid_uid || '',
      role: user.role || 'Employee',
      fingerprintId: user.fingerprint_id || '',
    });
    setEditFormError('');
    setIsRfidScannerOpen(false);
    setIsFingerprintScannerOpen(false);
    setUsersErrorMessage('');
  }

  function closeUserEditor() {
    if (updatingUserId !== null) {
      return;
    }

    setEditingUser(null);
    setEditFormError('');
    setRfidScanInput('');
    setIsRfidScannerOpen(false);
    setIsFingerprintScannerOpen(false);
  }

  function captureTypedRfid() {
    const rfidUid = rfidScanInput.trim();

    if (!rfidUid) {
      return;
    }

    if (editingUser) {
      setEditForm((currentForm) => ({ ...currentForm, rfidUid }));
    } else if (isCreateUserOpen) {
      setCreateForm((currentForm) => ({ ...currentForm, rfidUid }));
    }

    setRfidScanInput('');
    setIsRfidScannerOpen(false);
  }

  async function openRfidScanner() {
    try {
      const response = await fetch(`/kiosk-input.json?t=${Date.now()}`, { cache: 'no-store' });
      const input = (await response.json().catch(() => null)) as KioskInput | null;

      setRfidScanBaselineNonce(Number(input?.nonce ?? 0));
    } catch {
      setRfidScanBaselineNonce(Date.now());
    }

    setIsRfidScannerOpen(true);
    setIsFingerprintScannerOpen(false);
    setRfidScanInput('');
  }

  function openFingerprintScanner() {
    setIsRfidScannerOpen(false);
    setIsFingerprintScannerOpen(true);
    setFingerprintScanInput('');
  }

  function captureTypedFingerprint() {
    const fingerprintId = fingerprintScanInput.trim();

    if (!fingerprintId) {
      return;
    }

    if (editingUser) {
      setEditForm((currentForm) => ({ ...currentForm, fingerprintId }));
    } else if (isCreateUserOpen) {
      setCreateForm((currentForm) => ({ ...currentForm, fingerprintId }));
    }

    setFingerprintScanInput('');
    setIsFingerprintScannerOpen(false);
  }

  async function submitEditUserDetails() {
    if (!editingUser) {
      return;
    }

    if (!session?.accessToken) {
      setEditFormError('Please sign in again to update users.');
      return;
    }

    const fullName = editForm.fullName.trim();
    const rfidUid = editForm.rfidUid.trim();
    const role = editForm.role.trim();
    const fingerprintId = editForm.fingerprintId.trim();

    if (!fullName) {
      setEditFormError('User name is required.');
      return;
    }

    try {
      setUpdatingUserId(editingUser.id);
      setEditFormError('');
      setUsersErrorMessage('');

      const response = await fetch(`${API_BASE_URL}/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName,
          role,
          rfidUid: rfidUid || null,
          fingerprintId: fingerprintId || null,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | UserRecord
        | { error?: string }
        | null;

      if (!response.ok || !('id' in (data ?? {}))) {
        throw new Error(
          data && typeof data === 'object' && 'error' in data
            ? data.error
            : 'Unable to save user details.',
        );
      }

      setUsers((currentUsers) =>
        currentUsers.map((user) => (user.id === editingUser.id ? (data as UserRecord) : user)),
      );
      setEditingUser(null);
      window.alert('User details saved successfully.');
    } catch (error) {
      setEditFormError(error instanceof Error ? error.message : 'Unable to save user details.');
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function submitCreateUserDetails() {
    if (!session?.accessToken) {
      setCreateFormError('Please sign in again to create users.');
      return;
    }

    const employeeId = createForm.employeeId.trim();
    const fullName = createForm.fullName.trim();
    const email = createForm.email.trim();
    const phone = createForm.phone.trim();
    const department = createForm.department.trim();
    const role = createForm.role.trim();
    const rfidUid = createForm.rfidUid.trim();
    const fingerprintId = createForm.fingerprintId.trim();

    if (!employeeId || !fullName) {
      setCreateFormError('Employee ID and user name are required.');
      return;
    }

    try {
      setIsCreatingUser(true);
      setCreateFormError('');
      setUsersErrorMessage('');

      const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeId,
          fullName,
          email: email || null,
          phone: phone || null,
          department: department || null,
          role: role || 'Employee',
          rfidUid: rfidUid || null,
          fingerprintId: fingerprintId || null,
          isActive: true,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | UserRecord
        | { error?: string }
        | null;

      if (!response.ok || !('id' in (data ?? {}))) {
        throw new Error(
          data && typeof data === 'object' && 'error' in data
            ? data.error
            : 'Unable to create user.',
        );
      }

      setUsers((currentUsers) => [data as UserRecord, ...currentUsers]);
      setIsCreateUserOpen(false);
      setCreateForm({
        employeeId: '',
        fullName: '',
        email: '',
        phone: '',
        department: '',
        role: 'Employee',
        rfidUid: '',
        fingerprintId: '',
        scanBiometrics: false,
      });
      window.alert('User created successfully.');
    } catch (error) {
      setCreateFormError(error instanceof Error ? error.message : 'Unable to create user.');
    } finally {
      setIsCreatingUser(false);
    }
  }

  async function saveUserDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isCreateUserOpen) {
      await submitCreateUserDetails();
      return;
    }

    await submitEditUserDetails();
  }

  const roleOptions = USER_ROLE_OPTIONS;

  const filteredUsers = useMemo(() => {
    const normalizedSearch = userSearch.trim().toLowerCase();

    return users.filter((user) => {
      if (user.is_archived) {
        return false;
      }

      const matchesSearch =
        !normalizedSearch ||
        user.full_name.toLowerCase().includes(normalizedSearch) ||
        user.employee_id.toLowerCase().includes(normalizedSearch) ||
        (user.role || '').toLowerCase().includes(normalizedSearch);
      const matchesDepartment = departmentFilter === 'All Roles' || user.role === departmentFilter;
      const matchesStatus =
        statusFilter === 'All Status' ||
        (statusFilter === 'Active' ? user.is_active : !user.is_active);

      return matchesSearch && matchesDepartment && matchesStatus;
    });
  }, [departmentFilter, statusFilter, userSearch, users]);

  const visibleUsers = useMemo(
    () => filteredUsers.slice(0, rowsPerPage).map(toUserDisplayRow),
    [filteredUsers, rowsPerPage],
  );

  const registeredBiometricCount = users.filter((user) => user.fingerprint_id).length;
  const missingBiometricCount = users.length - registeredBiometricCount;
  const inactiveUserCount = users.filter((user) => !user.is_active).length;
  const attendanceMetrics = [
    {
      label: 'Total Users',
      value: users.length.toLocaleString(),
      delta: 'Live',
      Icon: UsersRound,
      tone: 'green',
    },
    {
      label: 'Registered Biometrics',
      value: registeredBiometricCount.toLocaleString(),
      delta: 'Live',
      Icon: Fingerprint,
      tone: 'blue',
    },
    {
      label: 'Missing Biometrics',
      value: missingBiometricCount.toLocaleString(),
      delta: 'Live',
      Icon: AlertTriangle,
      tone: 'amber',
    },
    {
      label: 'Inactive / Disabled',
      value: inactiveUserCount.toLocaleString(),
      delta: 'Live',
      Icon: HardDrive,
      tone: 'red',
    },
  ];

  function clearUserFilters() {
    setUserSearch('');
    setDepartmentFilter('All Roles');
    setStatusFilter('All Status');
  }

  function toggleRfidVisibility(userId: number) {
    setVisibleRfidUserIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(userId)) {
        nextIds.delete(userId);
      } else {
        nextIds.add(userId);
      }

      return nextIds;
    });
  }

  return (
    <section className="dashboard-page user-management-page" aria-labelledby="attendance-title">
      <div className="dashboard-hero">
        <header className="dashboard-header user-management-header">
          <div>
            <h1 id="attendance-title">User Management</h1>
            <p>Manage employee attendance, biometric status, and access settings.</p>
          </div>

          <div className="dashboard-actions">
            <button
              className="primary-action-button"
              type="button"
              onClick={() => window.alert('Save Changes functionality is not available yet.')}
            >
              Save Changes
            </button>
            <button
              className="primary-action-button"
              type="button"
              onClick={() => {
                setIsCreateUserOpen(true);
                setCreateFormError('');
                setCreateForm({
                  employeeId: '',
                  fullName: '',
                  email: '',
                  phone: '',
                  department: '',
                  role: 'Employee',
                  rfidUid: '',
                  fingerprintId: '',
                  scanBiometrics: false,
                });
              }}
            >
              + Add New User
            </button>
            <button className="soft-action-button" type="button">
              <Download size={16} />
              Export
            </button>
            <button className="soft-action-button" type="button">
              <Filter size={16} />
              Filter
            </button>
          </div>
        </header>

        <div className="stats-grid user-metrics-grid">
          {attendanceMetrics.map(({ Icon, delta, label, tone, value }) => (
            <article className="stat-card user-metric-card" key={label}>
              <span className={`stat-icon ${tone}`}>
                <Icon size={34} />
              </span>
              <div>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>vs yesterday</small>
              </div>
              <span className="stat-delta up">
                <TrendingUp size={15} />
                {delta}
              </span>
            </article>
          ))}
        </div>
      </div>

      <section className="user-table-panel" aria-labelledby="attendance-table-title">
        <h2 id="attendance-table-title">Attendance Users</h2>
        <div className="user-filter-row">
          <label className="user-search-field">
            <Search size={19} aria-hidden="true" />
            <input
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Search by name, ID, role..."
              type="search"
              value={userSearch}
            />
          </label>

          <select
            aria-label="Filter by user status"
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            <option>All Status</option>
            <option>Active</option>
            <option>Disabled</option>
          </select>

          <select
            aria-label="Filter by role"
            onChange={(event) => setDepartmentFilter(event.target.value)}
            value={departmentFilter}
          >
            <option>All Roles</option>
            {roleOptions.map((role) => (
              <option key={role}>{role}</option>
            ))}
          </select>

          <button
            className="soft-action-button clear-filter-button"
            onClick={clearUserFilters}
            type="button"
          >
            Clear Filter
          </button>
        </div>

        <div className="user-table-wrap">
          <table className="managed-table user-management-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Biometric Status</th>
                <th>Access Status</th>
                <th>RFID</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingUsers ? (
                <tr>
                  <td className="module-table-message" colSpan={6}>
                    Loading users...
                  </td>
                </tr>
              ) : usersErrorMessage ? (
                <tr>
                  <td className="module-table-message error" colSpan={6}>
                    {usersErrorMessage}
                  </td>
                </tr>
              ) : visibleUsers.length === 0 ? (
                <tr>
                  <td className="module-table-message" colSpan={6}>
                    No users found.
                  </td>
                </tr>
              ) : (
                visibleUsers.map((user) => {
                  const countdown = user.expirationDate
                    ? formatExpiryCountdown(user.expirationDate, now)
                    : null;

                  return (
                    <tr key={user.id}>
                      <td>
                        <span className="managed-user-cell">
                          <span className={`managed-avatar ${user.avatarTone}`}>
                            {user.avatar}
                            {user.online ? <i aria-hidden="true" /> : null}
                          </span>
                          <span>
                            <strong>{user.name}</strong>
                            <small>
                              {user.employeeId}
                              {countdown ? (
                                <span
                                  className={`expiry-badge${countdown.isExpired ? ' expired' : ''}`}
                                  title={formatSubmittedDate(
                                    user.expirationDate as string,
                                    dateTimeSettings,
                                  )}
                                >
                                  {' · '}
                                  {countdown.isExpired
                                    ? 'Expired'
                                    : `Expires in ${countdown.label}`}
                                </span>
                              ) : null}
                            </small>
                          </span>
                        </span>
                      </td>
                      <td>{user.role}</td>
                      <td>
                        <span className={`user-status-pill ${user.biometricTone}`}>
                          {attendanceStatusIcon(user.biometricStatus)}
                          {user.biometricStatus}
                        </span>
                      </td>
                      <td>
                        <span className={`user-status-pill ${user.accessTone}`}>
                          {attendanceStatusIcon(user.accessStatus)}
                          {user.accessStatus}
                        </span>
                      </td>
                      <td>
                        <span className="rfid-mask-cell">
                          <span>
                            {visibleRfidUserIds.has(user.id)
                              ? user.rfidUid
                              : maskRfid(user.rfidUid)}
                          </span>
                          {user.rfidUid !== '-' ? (
                            <button
                              aria-label={
                                visibleRfidUserIds.has(user.id)
                                  ? `Hide RFID for ${user.name}`
                                  : `Show RFID for ${user.name}`
                              }
                              onClick={() => toggleRfidVisibility(user.id)}
                              type="button"
                            >
                              {visibleRfidUserIds.has(user.id) ? (
                                <EyeOff size={13} />
                              ) : (
                                <Eye size={13} />
                              )}
                            </button>
                          ) : null}
                        </span>
                      </td>
                      <td>
                        <span className="user-row-actions">
                          <button
                            className={user.accessStatus === 'Active' ? 'activate' : 'deactivate'}
                            type="button"
                            aria-label={
                              user.accessStatus === 'Disabled'
                                ? `Activate ${user.name}`
                                : `Deactivate ${user.name}`
                            }
                            disabled={updatingUserId === user.id}
                            onClick={() =>
                              void updateUserStatus(user.id, user.accessStatus === 'Disabled')
                            }
                          >
                            <Power size={15} />
                          </button>
                          <button
                            className="archive"
                            type="button"
                            aria-label={`Archive ${user.name}`}
                            disabled={updatingUserId === user.id}
                            onClick={() => void archiveUser(user.id)}
                          >
                            <Archive size={15} />
                          </button>
                          <button
                            className="edit"
                            type="button"
                            aria-label={`Edit ${user.name}`}
                            disabled={updatingUserId === user.id}
                            onClick={() => openUserEditor(user.id)}
                          >
                            <Pencil size={15} />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <footer className="user-table-footer">
          <span>
            Showing {visibleUsers.length === 0 ? 0 : 1} to {visibleUsers.length} of{' '}
            {filteredUsers.length.toLocaleString()} entries
          </span>
          <div className="user-pagination" aria-label="Pagination">
            <button type="button" aria-label="Previous page">
              <ChevronLeft size={15} />
            </button>
            <button className="active" type="button">
              1
            </button>
            <button type="button">2</button>
            <button type="button">3</button>
            <button type="button">...</button>
            <button type="button">156</button>
            <button type="button" aria-label="Next page">
              <ChevronRight size={15} />
            </button>
          </div>
          <label className="rows-per-page">
            Rows per page:
            <select
              aria-label="Rows per page"
              onChange={(event) => setRowsPerPage(Number(event.target.value))}
              value={String(rowsPerPage)}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </label>
        </footer>
      </section>

      {editingUser ? (
        <div className="user-edit-backdrop" role="presentation" onMouseDown={closeUserEditor}>
          <form
            aria-labelledby="user-edit-title"
            className="user-edit-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => void saveUserDetails(event)}
          >
            <header>
              <div>
                <h2 id="user-edit-title">Edit User</h2>
                <p>Update user credentials, RFID details, and biometric summary.</p>
              </div>
              <button
                aria-label="Close edit user form"
                className="user-edit-close"
                disabled={updatingUserId === editingUser.id}
                onClick={closeUserEditor}
                type="button"
              >
                <X size={18} />
              </button>
            </header>

            <section className="user-edit-section" aria-labelledby="user-edit-credentials-title">
              <h3 id="user-edit-credentials-title">
                <span>1</span>
                User Credentials
              </h3>
              <div className="user-edit-grid two-columns">
                <label className="user-edit-field">
                  <span>Employee / User ID *</span>
                  <input readOnly value={editingUser.employee_id} />
                </label>

                <label className="user-edit-field">
                  <span>Full Name *</span>
                  <input
                    autoFocus
                    onChange={(event) =>
                      setEditForm((currentForm) => ({
                        ...currentForm,
                        fullName: event.target.value,
                      }))
                    }
                    value={editForm.fullName}
                  />
                </label>

                <label className="user-edit-field">
                  <span>Role *</span>
                  <select
                    onChange={(event) =>
                      setEditForm((currentForm) => ({ ...currentForm, role: event.target.value }))
                    }
                    value={editForm.role}
                  >
                    {roleOptions.map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="user-edit-grid three-columns">
                <label className="user-edit-field">
                  <span>RFID UID</span>
                  <input readOnly value={editForm.rfidUid} placeholder="Enter RFID UID" />
                </label>

                <button
                  className="user-edit-scan-button"
                  onClick={() => void openRfidScanner()}
                  type="button"
                >
                  R<span>Scan RFID</span>
                </button>

                <label className="user-edit-field">
                  <span>Account Status *</span>
                  <select disabled value={editingUser.is_active ? 'Active' : 'Disabled'}>
                    <option>Active</option>
                    <option>Disabled</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="user-edit-section" aria-labelledby="user-edit-fingerprint-title">
              <h3 id="user-edit-fingerprint-title">
                <span>2</span>
                Fingerprint Registration
              </h3>
              <p>Scan the user's fingerprint to complete biometric setup.</p>
              <div className="user-edit-fingerprint-row">
                <div>
                  <strong>Fingerprint Status:</strong>
                  <span
                    className={`user-status-pill ${
                      editingUser.fingerprint_id ? 'success' : 'danger'
                    }`}
                  >
                    {editingUser.fingerprint_id ? 'Registered' : 'Missing'}
                  </span>
                </div>
                <button
                  className="primary-action-button user-edit-scan-fingerprint"
                  onClick={openFingerprintScanner}
                  type="button"
                >
                  <Fingerprint size={18} />
                  <span>Scan Fingerprint</span>
                </button>
              </div>
            </section>

            <section className="user-edit-section" aria-labelledby="user-edit-summary-title">
              <h3 id="user-edit-summary-title">
                <span>3</span>
                Registration Summary
              </h3>
              <div className="user-edit-summary">
                <div>
                  <strong>D</strong>
                  <span>
                    Device
                    <small>-</small>
                  </span>
                </div>
                <div>
                  <strong>U</strong>
                  <span>
                    Assigned User
                    <small>{editForm.fullName || '-'}</small>
                  </span>
                </div>
                <div>
                  <strong>B</strong>
                  <span>
                    Department
                    <small>{editingUser.department || '-'}</small>
                  </span>
                </div>
                <div>
                  <strong>R</strong>
                  <span>
                    RFID Status
                    <small>{editForm.rfidUid ? 'Registered' : 'Pending'}</small>
                  </span>
                </div>
                <div>
                  <strong>F</strong>
                  <span>
                    Biometric Status
                    <small>{editingUser.fingerprint_id ? 'Registered' : 'Missing'}</small>
                  </span>
                </div>
                <div>
                  <strong>S</strong>
                  <span>
                    Device Status
                    <small>Pending Setup</small>
                  </span>
                </div>
              </div>
            </section>

            {editFormError ? (
              <p className="module-table-message error" role="alert">
                {editFormError}
              </p>
            ) : null}

            <footer>
              <button
                className="soft-action-button"
                disabled={updatingUserId === editingUser.id}
                onClick={closeUserEditor}
                type="button"
              >
                Cancel
              </button>
              <button
                className="primary-action-button"
                disabled={updatingUserId === editingUser.id}
                type="submit"
              >
                {updatingUserId === editingUser.id ? 'Saving...' : 'Save'}
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      {isCreateUserOpen ? (
        <div
          className="user-edit-backdrop"
          role="presentation"
          onMouseDown={() => setIsCreateUserOpen(false)}
        >
          <form
            aria-labelledby="create-user-title"
            className="user-edit-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => void saveUserDetails(event)}
          >
            <header>
              <div>
                <h2 id="create-user-title">Add New User</h2>
                <p>Enter user credentials, RFID UID, and fingerprint tracking details.</p>
              </div>
              <button
                aria-label="Close add user form"
                className="user-edit-close"
                disabled={isCreatingUser}
                onClick={() => setIsCreateUserOpen(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </header>

            <section className="user-edit-section" aria-labelledby="create-user-credentials-title">
              <h3 id="create-user-credentials-title">
                <span>1</span>
                User Credentials
              </h3>
              <div className="user-edit-grid two-columns">
                <label className="user-edit-field">
                  <span>Employee / User ID *</span>
                  <input
                    autoFocus
                    onChange={(event) =>
                      setCreateForm((currentForm) => ({
                        ...currentForm,
                        employeeId: event.target.value,
                      }))
                    }
                    value={createForm.employeeId}
                  />
                </label>

                <label className="user-edit-field">
                  <span>Full Name *</span>
                  <input
                    onChange={(event) =>
                      setCreateForm((currentForm) => ({
                        ...currentForm,
                        fullName: event.target.value,
                      }))
                    }
                    value={createForm.fullName}
                  />
                </label>

                <label className="user-edit-field">
                  <span>Email</span>
                  <input
                    onChange={(event) =>
                      setCreateForm((currentForm) => ({
                        ...currentForm,
                        email: event.target.value,
                      }))
                    }
                    value={createForm.email}
                    type="email"
                  />
                </label>

                <label className="user-edit-field">
                  <span>Phone</span>
                  <input
                    onChange={(event) =>
                      setCreateForm((currentForm) => ({
                        ...currentForm,
                        phone: event.target.value,
                      }))
                    }
                    value={createForm.phone}
                    type="tel"
                  />
                </label>

                <label className="user-edit-field">
                  <span>Role *</span>
                  <select
                    onChange={(event) =>
                      setCreateForm((currentForm) => ({
                        ...currentForm,
                        role: event.target.value,
                      }))
                    }
                    value={createForm.role}
                  >
                    {roleOptions.map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                </label>

                <label className="user-edit-field">
                  <span>Department</span>
                  <input
                    onChange={(event) =>
                      setCreateForm((currentForm) => ({
                        ...currentForm,
                        department: event.target.value,
                      }))
                    }
                    value={createForm.department}
                  />
                </label>
              </div>
            </section>

            <section className="user-edit-section" aria-labelledby="create-user-peripherals-title">
              <h3 id="create-user-peripherals-title">
                <span>2</span>
                Hardware Enrollment
              </h3>
              <div className="user-edit-grid three-columns">
                <label className="user-edit-field">
                  <span>RFID UID</span>
                  <input readOnly value={createForm.rfidUid} placeholder="Scan or enter RFID UID" />
                </label>

                <button
                  className="user-edit-scan-button"
                  onClick={() => {
                    void openRfidScanner();
                  }}
                  type="button"
                >
                  R<span>Scan RFID</span>
                </button>

                <label className="user-edit-field">
                  <span>Fingerprint ID</span>
                  <input
                    readOnly
                    value={createForm.fingerprintId}
                    placeholder="Scan or enter fingerprint"
                  />
                </label>
              </div>
              <div className="user-edit-grid two-columns" style={{ marginTop: '16px' }}>
                <label
                  className="user-edit-field"
                  style={{ alignItems: 'center', gridTemplateColumns: 'auto 1fr' }}
                >
                  <input
                    type="checkbox"
                    checked={createForm.scanBiometrics}
                    onChange={(event) =>
                      setCreateForm((currentForm) => ({
                        ...currentForm,
                        scanBiometrics: event.target.checked,
                      }))
                    }
                  />
                  <span style={{ marginLeft: '12px' }}>
                    Scan Biometrics
                    <small
                      style={{
                        display: 'block',
                        marginTop: '4px',
                        color: '#667089',
                        fontWeight: 400,
                      }}
                    >
                      Biometrics scanning is not available yet; status will remain Missing.
                    </small>
                  </span>
                </label>
              </div>
            </section>

            <section className="user-edit-section" aria-labelledby="create-user-summary-title">
              <h3 id="create-user-summary-title">
                <span>3</span>
                Registration Summary
              </h3>
              <div className="user-edit-summary">
                <div>
                  <strong>D</strong>
                  <span>
                    Device
                    <small>-</small>
                  </span>
                </div>
                <div>
                  <strong>U</strong>
                  <span>
                    Assigned User
                    <small>{createForm.fullName || '-'}</small>
                  </span>
                </div>
                <div>
                  <strong>B</strong>
                  <span>
                    Department
                    <small>{createForm.department || '-'}</small>
                  </span>
                </div>
                <div>
                  <strong>R</strong>
                  <span>
                    RFID Status
                    <small>{createForm.rfidUid ? 'Registered' : 'Pending'}</small>
                  </span>
                </div>
                <div>
                  <strong>F</strong>
                  <span>
                    Biometric Status
                    <small>{createForm.fingerprintId ? 'Registered' : 'Missing'}</small>
                  </span>
                </div>
                <div>
                  <strong>S</strong>
                  <span>
                    Device Status
                    <small>Pending Setup</small>
                  </span>
                </div>
              </div>
            </section>

            {createFormError ? (
              <p className="module-table-message error" role="alert">
                {createFormError}
              </p>
            ) : null}

            <footer>
              <button
                className="soft-action-button"
                disabled={isCreatingUser}
                onClick={() => setIsCreateUserOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button className="primary-action-button" disabled={isCreatingUser} type="submit">
                {isCreatingUser ? 'Saving...' : 'Save'}
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      {(editingUser || isCreateUserOpen) && isRfidScannerOpen ? (
        <div className="rfid-scan-backdrop" role="presentation">
          <section className="rfid-scan-modal" aria-labelledby="rfid-scan-title" role="dialog">
            <header>
              <div className="rfid-scan-brand">
                <span aria-hidden="true">ID</span>
                <div>
                  <strong>EINGRESS</strong>
                  <small>ATTENDANCE KIOSK</small>
                </div>
              </div>
              <button
                aria-label="Close RFID scanner"
                onClick={() => setIsRfidScannerOpen(false)}
                type="button"
              >
                X
              </button>
            </header>

            <div className="rfid-scan-visual" aria-hidden="true">
              <span className="rfid-id-card-symbol">
                <i />
                <span>
                  <b />
                  <b />
                  <b />
                </span>
              </span>
            </div>

            <h2 id="rfid-scan-title">Place new ID</h2>
            <p>Your ID is being registered... Please wait.</p>
            <label className="rfid-scan-input">
              <span>RFID Number</span>
              <input
                autoFocus
                inputMode="numeric"
                onChange={(event) => setRfidScanInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    captureTypedRfid();
                  }
                }}
                placeholder="Tap card or enter RFID"
                value={rfidScanInput}
              />
            </label>
            <button className="rfid-scan-capture-button" onClick={captureTypedRfid} type="button">
              Use RFID
            </button>
            <div className="rfid-scan-dots" aria-hidden="true" />
          </section>
        </div>
      ) : null}

      {(editingUser || isCreateUserOpen) && isFingerprintScannerOpen ? (
        <div className="rfid-scan-backdrop" role="presentation">
          <section
            aria-labelledby="fingerprint-scan-title"
            className="rfid-scan-modal fingerprint-scan-modal"
            role="dialog"
          >
            <header>
              <div className="rfid-scan-brand">
                <span aria-hidden="true">ID</span>
                <div>
                  <strong>EINGRESS</strong>
                  <small>ATTENDANCE KIOSK</small>
                </div>
              </div>
              <button
                aria-label="Close fingerprint scanner"
                onClick={() => setIsFingerprintScannerOpen(false)}
                type="button"
              >
                X
              </button>
            </header>

            <div className="rfid-scan-visual fingerprint-scan-visual" aria-hidden="true">
              <Fingerprint size={76} strokeWidth={2.2} />
            </div>

            <h2 id="fingerprint-scan-title">Scan Your Fingerprint</h2>
            <p>Place finger on the scanner or enter fingerprint ID.</p>
            <label className="rfid-scan-input">
              <span>Fingerprint ID</span>
              <input
                autoFocus
                onChange={(event) => setFingerprintScanInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    captureTypedFingerprint();
                  }
                }}
                placeholder="Enter fingerprint ID"
                value={fingerprintScanInput}
              />
            </label>
            <button
              className="rfid-scan-capture-button"
              onClick={captureTypedFingerprint}
              type="button"
            >
              Use Fingerprint ID
            </button>
            <div className="rfid-scan-dots" aria-hidden="true" />
          </section>
        </div>
      ) : null}
    </section>
  );
}

export function AttendanceManagementPage() {
  const { session } = useAuth();
  const dateTimeSettings = useDateTimeSettings();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadAttendance() {
      if (!session?.accessToken) {
        setErrorMessage('Please sign in again to view attendance records.');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setErrorMessage('');

        const headers = { Authorization: `Bearer ${session.accessToken}` };
        const [recordsResponse, summaryResponse, usersResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/attendance`, { headers, signal: controller.signal }),
          fetch(`${API_BASE_URL}/attendance/summary`, { headers, signal: controller.signal }),
          fetch(`${API_BASE_URL}/users`, { headers, signal: controller.signal }),
        ]);

        const recordsData = (await recordsResponse.json().catch(() => null)) as
          | AttendanceRecord[]
          | { error?: string }
          | null;

        if (!recordsResponse.ok || !Array.isArray(recordsData)) {
          throw new Error(
            !Array.isArray(recordsData) && recordsData?.error
              ? recordsData.error
              : 'Unable to load attendance records.',
          );
        }

        const summaryData = (await summaryResponse
          .json()
          .catch(() => null)) as AttendanceSummary | null;
        const usersData = (await usersResponse.json().catch(() => null)) as UserRecord[] | null;

        setRecords(recordsData);
        setSummary(summaryResponse.ok ? summaryData : null);
        setTotalUsers(
          Array.isArray(usersData) ? usersData.filter((user) => !user.is_archived).length : null,
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load attendance records.',
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadAttendance();

    return () => {
      controller.abort();
    };
  }, [session?.accessToken]);

  const attendanceRows = useMemo(
    () =>
      records.map((record) => [
        record.employee_id,
        record.full_name,
        record.role || '-',
        formatClockTime(record.check_in_at, dateTimeSettings),
        hasCheckedOut(record.check_in_at, record.check_out_at)
          ? formatClockTime(record.check_out_at, dateTimeSettings)
          : '-',
        record.status,
        formatTotalHours(record.check_in_at, record.check_out_at),
      ]),
    [records, dateTimeSettings],
  );

  const attendanceMetrics = [
    {
      label: 'Total Users',
      value: totalUsers,
      Icon: UsersRound,
      tone: 'green',
    },
    {
      label: "Today's Attendance",
      value: summary ? summary.present + summary.late : null,
      Icon: Fingerprint,
      tone: 'blue',
    },
    {
      label: 'Late',
      value: summary?.late ?? null,
      Icon: AlertTriangle,
      tone: 'amber',
    },
    {
      label: 'Absent',
      value: summary?.absent ?? null,
      Icon: Archive,
      tone: 'red',
    },
  ];

  return (
    <section className="module-page">
      <PageHeader
        title="Attendance Management"
        description="Monitor and manage attendance records in real-time."
      />

      <div className="module-stats-grid">
        {attendanceMetrics.map(({ Icon, label, tone, value }) => (
          <article className="module-stat-card" key={label}>
            <span className={`stat-icon ${tone}`}>
              <Icon size={30} />
            </span>
            <div>
              <span>{label}</span>
              <strong>{value === null ? '-' : value.toLocaleString()}</strong>
              <small>Today</small>
            </div>
          </article>
        ))}
      </div>

      <ModuleTable
        title="Today's Attendance"
        columns={['Employee ID', 'Name', 'Role', 'Time In', 'Time Out', 'Status', 'Total Hours']}
        rows={attendanceRows}
        isLoading={isLoading}
        errorMessage={errorMessage}
        emptyMessage="No attendance records found for today."
      />
    </section>
  );
}

export function EnrollmentRequestsPage() {
  const { session } = useAuth();
  const dateTimeSettings = useDateTimeSettings();
  const [requests, setRequests] = useState<EnrollmentRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<EnrollmentRequest | null>(null);
  const [updatingRequestId, setUpdatingRequestId] = useState<number | null>(null);
  const [nameFilter, setNameFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<EnrollmentStatusFilter>('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadEnrollmentRequests() {
      if (!session?.accessToken) {
        setErrorMessage('Please sign in again to view enrollment requests.');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setErrorMessage('');

        const response = await fetch(`${API_BASE_URL}/enrollment-requests`, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
          signal: controller.signal,
        });

        const data = (await response.json().catch(() => null)) as
          | EnrollmentRequest[]
          | { error?: string }
          | null;

        if (!response.ok || !Array.isArray(data)) {
          throw new Error(
            !Array.isArray(data) && data?.error
              ? data.error
              : 'Unable to load enrollment requests.',
          );
        }

        setRequests(data);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load enrollment requests.',
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadEnrollmentRequests();
    return () => {
      controller.abort();
    };
  }, [session?.accessToken]);

  async function updateEnrollmentStatus(id: number, status: 'Approved' | 'Rejected') {
    if (!session?.accessToken) {
      setErrorMessage('Please sign in again to update enrollment requests.');
      return;
    }

    try {
      setUpdatingRequestId(id);
      setErrorMessage('');

      const response = await fetch(`${API_BASE_URL}/enrollment-requests/${id}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      const data = (await response.json().catch(() => null)) as
        | EnrollmentRequest
        | { error?: string }
        | null;

      if (!response.ok || !isEnrollmentRequest(data)) {
        const responseError =
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Unable to update enrollment request.';

        throw new Error(responseError);
      }

      setRequests((currentRequests) =>
        currentRequests.map((request) => (request.id === id ? data : request)),
      );
      setSelectedRequest((currentRequest) => (currentRequest?.id === id ? data : currentRequest));
      window.dispatchEvent(new Event('enrollment-requests:changed'));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to update enrollment request.',
      );
    } finally {
      setUpdatingRequestId(null);
    }
  }

  const departmentOptions = useMemo(
    () =>
      Array.from(new Set(requests.map((request) => request.department).filter(Boolean))).sort(
        (departmentA, departmentB) => departmentA.localeCompare(departmentB),
      ),
    [requests],
  );

  const filteredRequests = useMemo(() => {
    const normalizedNameFilter = nameFilter.trim().toLowerCase();

    return requests.filter((request) => {
      const submittedDate = toDateInputValue(request.submitted_at);
      const matchesName =
        !normalizedNameFilter ||
        request.full_name.toLowerCase().includes(normalizedNameFilter) ||
        request.employee_id.toLowerCase().includes(normalizedNameFilter) ||
        request.request_code.toLowerCase().includes(normalizedNameFilter);
      const matchesStatus = statusFilter === 'All' || request.status === statusFilter;
      const matchesDepartment =
        departmentFilter === 'All' || request.department === departmentFilter;
      const matchesDate = !dateFilter || submittedDate === dateFilter;

      return matchesName && matchesStatus && matchesDepartment && matchesDate;
    });
  }, [dateFilter, departmentFilter, nameFilter, requests, statusFilter]);

  function clearEnrollmentFilters() {
    setNameFilter('');
    setStatusFilter('All');
    setDepartmentFilter('All');
    setDateFilter('');
  }

  return (
    <section className="module-page">
      <PageHeader
        title="Enrollment Requests"
        description="Review and manage biometric and RFID enrollment requests."
      />
      <EnrollmentFilterRow
        dateFilter={dateFilter}
        departmentFilter={departmentFilter}
        departments={departmentOptions}
        nameFilter={nameFilter}
        onClear={clearEnrollmentFilters}
        onDateChange={setDateFilter}
        onDepartmentChange={setDepartmentFilter}
        onNameChange={setNameFilter}
        onStatusChange={setStatusFilter}
        statusFilter={statusFilter}
      />
      <section className="module-panel" aria-labelledby="enrollment-table-title">
        <h2 id="enrollment-table-title">Enrollment Requests</h2>
        <div className="module-table-wrap">
          <table className="module-table has-actions enrollment-requests-table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Name</th>
                <th>Employee ID</th>
                <th>Department</th>
                <th>Request Type</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="module-table-message" colSpan={8}>
                    Loading enrollment requests...
                  </td>
                </tr>
              ) : errorMessage ? (
                <tr>
                  <td className="module-table-message error" colSpan={8}>
                    {errorMessage}
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td className="module-table-message" colSpan={8}>
                    No enrollment requests found.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((request) => {
                  const isUpdating = updatingRequestId === request.id;
                  const isPending = request.status === 'Pending';

                  return (
                    <tr key={request.id}>
                      <td>{request.request_code}</td>
                      <td>
                        <strong className="module-cell-text">{request.full_name}</strong>
                      </td>
                      <td>{request.employee_id}</td>
                      <td>{request.department}</td>
                      <td>{request.request_type}</td>
                      <td>{formatSubmittedDate(request.submitted_at, dateTimeSettings)}</td>
                      <td>
                        <span className={`module-status ${statusTone(request.status)}`}>
                          {request.status}
                        </span>
                      </td>
                      <td>
                        <span className="table-actions">
                          <button
                            className="tiny-action approve"
                            type="button"
                            aria-label="Approve"
                            disabled={!isPending || isUpdating}
                            onClick={() => void updateEnrollmentStatus(request.id, 'Approved')}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            className="tiny-action reject"
                            type="button"
                            aria-label="Reject"
                            disabled={!isPending || isUpdating}
                            onClick={() => void updateEnrollmentStatus(request.id, 'Rejected')}
                          >
                            <X size={14} />
                          </button>
                          <button
                            className="tiny-view"
                            onClick={() => setSelectedRequest(request)}
                            type="button"
                          >
                            View
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="enrollment-pagination-row">
          <span>
            Showing {filteredRequests.length === 0 ? 0 : 1} to {filteredRequests.length} entries
          </span>
          <span className="module-pagination-controls">
            <button className="active" type="button">
              1
            </button>
            <button type="button">2</button>
            <button type="button">3</button>
            <button type="button">&gt;</button>
          </span>
        </div>
      </section>

      {selectedRequest ? (
        <div className="request-drawer-backdrop" onMouseDown={() => setSelectedRequest(null)}>
          <aside
            aria-labelledby="request-drawer-title"
            aria-modal="true"
            className="request-drawer"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="request-drawer-header">
              <div>
                <h2 id="request-drawer-title">View User Request</h2>
                <p>Review the details of the selected user request.</p>
              </div>
              <button
                aria-label="Close request details"
                onClick={() => setSelectedRequest(null)}
                type="button"
              >
                <X size={22} />
              </button>
            </header>

            <section className="request-drawer-section">
              <h3>
                <span>1</span> Request Details
              </h3>
              <dl className="request-detail-list">
                <div>
                  <dt>Request ID</dt>
                  <dd>{selectedRequest.request_code}</dd>
                </div>
                <div>
                  <dt>Request Type</dt>
                  <dd>{selectedRequest.request_type}</dd>
                </div>
                <div>
                  <dt>Submitted On</dt>
                  <dd>{formatSubmittedDate(selectedRequest.submitted_at, dateTimeSettings)}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={`request-status ${statusTone(selectedRequest.status)}`}>
                      {selectedRequest.status}
                    </span>
                  </dd>
                </div>
              </dl>
            </section>

            <section className="request-drawer-section">
              <h3>
                <span>2</span> User Information
              </h3>
              <div className="request-user-summary">
                <div className="request-user-avatar" aria-hidden="true">
                  {getInitials(selectedRequest.full_name)}
                </div>
                <dl className="request-detail-list">
                  <div>
                    <dt>Name</dt>
                    <dd>{selectedRequest.full_name}</dd>
                  </div>
                  <div>
                    <dt>Employee ID</dt>
                    <dd>{selectedRequest.employee_id}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{selectedRequest.email || 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt>Department</dt>
                    <dd>{selectedRequest.department}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{selectedRequest.phone || 'Not provided'}</dd>
                  </div>
                </dl>
              </div>
            </section>

            <section className="request-drawer-section">
              <h3>
                <span>3</span> Access &amp; Device Details
              </h3>
              <dl className="request-detail-list">
                <div>
                  <dt>RFID Number</dt>
                  <dd>{selectedRequest.rfid_uid || 'Pending capture'}</dd>
                </div>
                <div>
                  <dt>Biometric Status</dt>
                  <dd>{selectedRequest.fingerprint_template ? 'Submitted' : 'Pending'}</dd>
                </div>
                <div>
                  <dt>Access Status</dt>
                  <dd>{selectedRequest.status === 'Approved' ? 'Active' : 'Pending approval'}</dd>
                </div>
              </dl>
            </section>

            <section className="request-drawer-section">
              <h3>
                <span>4</span> Registration Summary
              </h3>
              <div className="request-registration-grid">
                <div>
                  <strong>Biometric</strong>
                  <small>{selectedRequest.fingerprint_template ? 'Submitted' : 'Pending'}</small>
                </div>
                <div>
                  <strong>RFID</strong>
                  <small>{selectedRequest.rfid_uid ? 'Captured' : 'Pending'}</small>
                </div>
                <div>
                  <strong>Request</strong>
                  <small>{selectedRequest.request_type}</small>
                </div>
                <div>
                  <strong>Account</strong>
                  <small>{selectedRequest.status}</small>
                </div>
              </div>
              {selectedRequest.rejection_reason ? (
                <p className="request-rejection-reason">
                  Rejection reason: {selectedRequest.rejection_reason}
                </p>
              ) : null}
            </section>

            <footer className="request-drawer-actions">
              <button onClick={() => setSelectedRequest(null)} type="button">
                Close
              </button>
              <button
                className="reject-request-button"
                disabled={
                  selectedRequest.status !== 'Pending' || updatingRequestId === selectedRequest.id
                }
                onClick={() => void updateEnrollmentStatus(selectedRequest.id, 'Rejected')}
                type="button"
              >
                Reject Request
              </button>
              <button
                className="approve-request-button"
                disabled={
                  selectedRequest.status !== 'Pending' || updatingRequestId === selectedRequest.id
                }
                onClick={() => void updateEnrollmentStatus(selectedRequest.id, 'Approved')}
                type="button"
              >
                Approve Request
              </button>
            </footer>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

export function DeviceManagementPage() {
  return (
    <section className="module-page">
      <div className="module-header-row">
        <PageHeader
          title="Device Management"
          description="Monitor and manage all RFID and biometric devices."
        />
        <button className="dark-action-button">+ Add New User</button>
      </div>
      <MetricCards
        cards={[
          { label: 'Total Devices', value: '24', tone: 'purple', Icon: Monitor },
          { label: 'Online', value: '18', tone: 'green', Icon: UsersRound },
          { label: 'Offline', value: '4', tone: 'red', Icon: Archive },
          { label: 'Maintenance', value: '2', tone: 'amber', Icon: AlertTriangle },
        ]}
      />
      <ModuleTable
        title="Device List"
        columns={[
          'Device ID',
          'Device Name',
          'Type',
          'Location',
          'IP Address',
          'Status',
          'Last Sync',
        ]}
        rows={deviceRows}
        withActions
      />
    </section>
  );
}

const REPORT_TYPES = [
  'Attendance Summary',
  'Access Request Summary',
  'User Summary',
  'Auto-Deactivated Accounts',
] as const;

type ReportType = (typeof REPORT_TYPES)[number];

const REPORT_STATUS_OPTIONS: Record<ReportType, string[]> = {
  'Attendance Summary': ['Present', 'Late', 'Absent'],
  'Access Request Summary': ['Pending', 'Approved', 'Rejected'],
  'User Summary': ['Active', 'Disabled'],
  'Auto-Deactivated Accounts': [],
};

type GeneratedReport = {
  created_at: string;
  generated_by: string | null;
  id: number;
  report_name: string;
  report_type: string;
};

type ReportData = {
  columns: string[];
  rows: string[][];
};

const REPORTS_PAGE_SIZE = 10;

type DepartmentSummaryRow = {
  department: string | null;
  total: number;
};

type AttendanceTrendPoint = {
  absent: number;
  date: string;
  late: number;
  present: number;
};

function formatTrendDayLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

function niceMax(value: number) {
  if (value <= 0) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function AttendanceTrendChart({ trend }: { trend: AttendanceTrendPoint[] }) {
  const width = 640;
  const height = 220;
  const paddingLeft = 36;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 28;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const maxValue = niceMax(
    Math.max(1, ...trend.flatMap((point) => [point.present, point.late, point.absent])),
  );
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(maxValue * fraction));

  const xFor = (index: number) =>
    trend.length > 1 ? paddingLeft + (plotWidth * index) / (trend.length - 1) : paddingLeft;
  const yFor = (value: number) => paddingTop + plotHeight - (plotHeight * value) / maxValue;

  const buildPath = (key: 'present' | 'late' | 'absent') =>
    trend
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(point[key])}`)
      .join(' ');

  return (
    <div className="attendance-trend-chart">
      <svg
        role="img"
        aria-label="Attendance trend over the last 7 days"
        viewBox={`0 0 ${width} ${height}`}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={paddingLeft}
              x2={width - paddingRight}
              y1={yFor(tick)}
              y2={yFor(tick)}
              className="attendance-trend-gridline"
            />
            <text
              x={paddingLeft - 8}
              y={yFor(tick)}
              className="attendance-trend-axis-label"
              textAnchor="end"
            >
              {tick}
            </text>
          </g>
        ))}
        {trend.map((point, index) => (
          <text
            key={point.date}
            x={xFor(index)}
            y={height - 6}
            className="attendance-trend-axis-label"
            textAnchor="middle"
          >
            {formatTrendDayLabel(point.date)}
          </text>
        ))}
        <path d={buildPath('present')} className="attendance-trend-line present" fill="none" />
        <path d={buildPath('late')} className="attendance-trend-line late" fill="none" />
        <path d={buildPath('absent')} className="attendance-trend-line absent" fill="none" />
      </svg>
      <ul className="attendance-trend-legend">
        <li className="present">Present</li>
        <li className="late">Late</li>
        <li className="absent">Absent</li>
      </ul>
    </div>
  );
}

function ReportPreviewModal({
  data,
  onClose,
  reportName,
}: {
  data: ReportData;
  onClose: () => void;
  reportName: string;
}) {
  return (
    <div className="report-preview-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-labelledby="report-preview-title"
        className="report-preview-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="report-preview-title">{reportName}</h2>
          <button aria-label="Close preview" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </header>
        <div className="report-preview-table-wrap">
          <table className="module-table">
            <thead>
              <tr>
                {data.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td className="module-table-message" colSpan={data.columns.length}>
                    No records match this report.
                  </td>
                </tr>
              ) : (
                data.rows.map((row) => (
                  <tr key={row.join('-')}>
                    {row.map((cell, index) => (
                      <td key={`${cell}-${index}`}>{cell}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function ReportsPage() {
  const { session } = useAuth();
  const dateTimeSettings = useDateTimeSettings();
  const [activeTab, setActiveTab] = useState<'reports' | 'audit'>('reports');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [reportType, setReportType] = useState<ReportType>('Attendance Summary');
  const [dateFilter, setDateFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [previewReport, setPreviewReport] = useState<{ data: ReportData; name: string } | null>(
    null,
  );
  const [busyReportId, setBusyReportId] = useState<number | null>(null);
  const [reportsCurrentPage, setReportsCurrentPage] = useState(1);
  const [reportsPagination, setReportsPagination] = useState<AuditLogPagination>({
    page: 1,
    pageSize: REPORTS_PAGE_SIZE,
    totalPages: 1,
    totalRecords: 0,
  });
  const [departmentSummary, setDepartmentSummary] = useState<DepartmentSummaryRow[]>([]);
  const [attendanceTrend, setAttendanceTrend] = useState<AttendanceTrendPoint[]>([]);

  useEffect(() => {
    if (!session?.accessToken) return;

    const controller = new AbortController();
    void fetch(`${API_BASE_URL}/users`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as UserRecord[] | null;
        if (response.ok && Array.isArray(data)) setUsers(data.filter((user) => !user.is_archived));
      })
      .catch(() => {
        // The report remains available if the role summary cannot be refreshed.
      });

    return () => controller.abort();
  }, [session?.accessToken]);

  const departmentOptions = useMemo(() => {
    const departments = new Set<string>();
    users.forEach((user) => {
      if (user.department) departments.add(user.department);
    });
    return Array.from(departments).sort();
  }, [users]);

  const fetchGeneratedReports = async (page: number) => {
    if (!session?.accessToken) return;

    setIsLoadingReports(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(REPORTS_PAGE_SIZE),
      });
      const response = await fetch(`${API_BASE_URL}/reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      const data = (await response.json().catch(() => null)) as {
        data: GeneratedReport[];
        pagination: AuditLogPagination;
      } | null;
      if (response.ok && data) {
        setGeneratedReports(data.data);
        setReportsPagination(data.pagination);
      }
    } catch {
      // The Recent Reports table remains empty if it cannot be refreshed.
    } finally {
      setIsLoadingReports(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => fetchGeneratedReports(reportsCurrentPage));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken, reportsCurrentPage]);

  const reportRows = useMemo(
    () =>
      generatedReports.map((report) => [
        report.report_name,
        report.report_type,
        report.generated_by || 'System',
        formatAuditTimestamp(report.created_at, dateTimeSettings),
      ]),
    [generatedReports, dateTimeSettings],
  );

  const onGenerateReport = async () => {
    if (!session?.accessToken) return;

    setIsGenerating(true);
    setGenerateError('');
    try {
      const reportName = `${reportType} – ${dateFilter || 'All Dates'}`;
      const response = await fetch(`${API_BASE_URL}/reports`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reportName,
          reportType,
          parameters: {
            date: dateFilter,
            department: departmentFilter,
            status: statusFilter,
            search: searchFilter,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Unable to generate report.');
      }

      if (reportsCurrentPage === 1) {
        await fetchGeneratedReports(1);
      } else {
        setReportsCurrentPage(1);
      }
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : 'Unable to generate report.');
    } finally {
      setIsGenerating(false);
    }
  };

  const fetchReportData = async (reportId: number) => {
    if (!session?.accessToken) return null;

    const response = await fetch(`${API_BASE_URL}/reports/${reportId}/data`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    const data = (await response.json().catch(() => null)) as
      | (ReportData & { reportName: string })
      | null;

    if (!response.ok || !data) return null;
    return data;
  };

  const onView = async (report: GeneratedReport) => {
    setBusyReportId(report.id);
    try {
      const data = await fetchReportData(report.id);
      if (data) setPreviewReport({ data, name: data.reportName });
    } finally {
      setBusyReportId(null);
    }
  };

  const onDownload = async (report: GeneratedReport, format: 'csv' | 'pdf') => {
    setBusyReportId(report.id);
    try {
      const data = await fetchReportData(report.id);
      if (!data) return;

      const blob = new Blob(
        [
          format === 'csv'
            ? buildCsv(data.columns, data.rows)
            : buildPdf(data.reportName, data.columns, data.rows, dateTimeSettings),
        ],
        { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/pdf' },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${data.reportName.replace(/[^\w-]+/g, '_')}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusyReportId(null);
    }
  };

  useEffect(() => {
    if (!session?.accessToken) return;

    const controller = new AbortController();
    const params = dateFilter ? `?date=${dateFilter}` : '';

    void fetch(`${API_BASE_URL}/reports/summary${params}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as {
          departments: DepartmentSummaryRow[];
          trend: AttendanceTrendPoint[];
        } | null;

        if (response.ok && data) {
          setDepartmentSummary(data.departments);
          setAttendanceTrend(data.trend);
        }
      })
      .catch(() => {
        // The summary panels remain empty if they cannot be refreshed.
      });

    return () => controller.abort();
  }, [session?.accessToken, dateFilter]);

  const departmentTotal = useMemo(
    () => departmentSummary.reduce((sum, row) => sum + row.total, 0),
    [departmentSummary],
  );

  return (
    <section className="module-page">
      <PageHeader
        title={activeTab === 'reports' ? 'Reports' : 'Audit Logs'}
        description={
          activeTab === 'reports'
            ? 'View attendance reports, access logs, and system audit records.'
            : 'Track all system activities and changes.'
        }
      />
      <div className="reports-tabs" role="tablist" aria-label="Reports and audit sections">
        <button
          aria-selected={activeTab === 'reports'}
          className={activeTab === 'reports' ? 'active' : ''}
          onClick={() => setActiveTab('reports')}
          role="tab"
          type="button"
        >
          Reports
        </button>
        <button
          aria-selected={activeTab === 'audit'}
          className={activeTab === 'audit' ? 'active' : ''}
          onClick={() => setActiveTab('audit')}
          role="tab"
          type="button"
        >
          Audit
        </button>
      </div>
      {activeTab === 'reports' ? (
        <>
          <div className="module-filter-row report-filter-row">
            <select
              aria-label="Report Type"
              onChange={(event) => {
                setReportType(event.target.value as ReportType);
                setStatusFilter('');
              }}
              value={reportType}
            >
              {REPORT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              aria-label="Date"
              onChange={(event) => setDateFilter(event.target.value)}
              type="date"
              value={dateFilter}
            />
            <select
              aria-label="Department"
              onChange={(event) => setDepartmentFilter(event.target.value)}
              value={departmentFilter}
            >
              <option value="">All Departments</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
            <select
              aria-label="Status"
              disabled={REPORT_STATUS_OPTIONS[reportType].length === 0}
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="">All Status</option>
              {REPORT_STATUS_OPTIONS[reportType].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <input
              aria-label="Search"
              onChange={(event) => setSearchFilter(event.target.value)}
              placeholder="Search by name or ID..."
              value={searchFilter}
            />
            <button
              className="dark-action-button"
              disabled={isGenerating}
              onClick={() => void onGenerateReport()}
              type="button"
            >
              {isGenerating ? 'Generating…' : 'Generate Report'}
            </button>
          </div>
          {generateError ? <p className="form-error">{generateError}</p> : null}
          <div className="report-summary-grid">
            <section className="module-panel">
              <h2>
                Attendance Summary — Last 7 Days{dateFilter ? ` (through ${dateFilter})` : ''}
              </h2>
              {attendanceTrend.some((point) => point.present || point.late || point.absent) ? (
                <AttendanceTrendChart trend={attendanceTrend} />
              ) : (
                <p className="report-panel-empty">No attendance records in this range yet.</p>
              )}
            </section>
            <section className="module-panel role-summary">
              <h2>Department Summary</h2>
              <div className="donut-summary">Total {departmentTotal}</div>
              <ul>
                {departmentSummary.length > 0 ? (
                  departmentSummary.map((row) => (
                    <li key={row.department || 'Unassigned'}>
                      <span>{row.department || 'Unassigned'}</span>
                      <strong>
                        {departmentTotal
                          ? `${Math.round((row.total / departmentTotal) * 100)}%`
                          : '0%'}
                      </strong>
                    </li>
                  ))
                ) : (
                  <li>
                    <span>No department data available</span>
                    <strong>—</strong>
                  </li>
                )}
              </ul>
            </section>
          </div>
          <ModuleTable
            title="Recent Reports"
            columns={['Report Name', 'Report Type', 'Generated By', 'Generated On']}
            rows={reportRows}
            isLoading={isLoadingReports}
            emptyMessage="No reports have been generated yet."
            pagination={reportsPagination}
            onPageChange={setReportsCurrentPage}
            withActions
            actionsWidth={270}
            actionRenderer={(rowIndex) => {
              const report = generatedReports[rowIndex];
              if (!report) return null;
              const isBusy = busyReportId === report.id;

              return (
                <span className="table-actions">
                  <button
                    className="tiny-view report-action-button"
                    disabled={isBusy}
                    onClick={() => void onView(report)}
                    type="button"
                  >
                    <Eye size={14} />
                    View
                  </button>
                  <button
                    className="tiny-view report-action-button"
                    disabled={isBusy}
                    onClick={() => void onDownload(report, 'csv')}
                    type="button"
                  >
                    <Download size={14} />
                    CSV
                  </button>
                  <button
                    className="tiny-view report-action-button"
                    disabled={isBusy}
                    onClick={() => void onDownload(report, 'pdf')}
                    type="button"
                  >
                    <Download size={14} />
                    PDF
                  </button>
                </span>
              );
            }}
          />
          {previewReport ? (
            <ReportPreviewModal
              data={previewReport.data}
              onClose={() => setPreviewReport(null)}
              reportName={previewReport.name}
            />
          ) : null}
        </>
      ) : (
        <AuditLogsPage embedded />
      )}
    </section>
  );
}

function formatAuditTimestamp(value: string, settings: DateTimeSettings) {
  return formatDateTime(value, settings);
}

function escapeCsvValue(value: string) {
  const normalized = value.replace(/"/g, '""');
  return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
}

function buildCsv(header: string[], rows: string[][]) {
  const content = [header.join(','), ...rows.map((row) => row.map(escapeCsvValue).join(','))].join(
    '\n',
  );
  return content;
}

function buildPdf(title: string, header: string[], rows: string[][], settings: DateTimeSettings) {
  const lines = [
    title,
    `Generated ${formatDateTime(new Date(), settings)}`,
    '',
    header.join(' | '),
    ...rows.map((row) => row.join(' | ')),
  ];

  const escapePdfText = (value: string) => value.replace(/([\\()])/g, '\\$1');
  const content = lines
    .map((line, index) => `BT /F1 10 Tf 50 ${760 - index * 12} Td (${escapePdfText(line)}) Tj ET`)
    .join('\n');

  const contentBytes = new TextEncoder().encode(content).length;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${contentBytes} >>\nstream\n${content}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return pdf;
}

export function AuditLogsPage({ embedded = false }: { embedded?: boolean }) {
  const { session } = useAuth();
  const dateTimeSettings = useDateTimeSettings();
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(session?.accessToken));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draftSearch, setDraftSearch] = useState('');
  const [draftModule, setDraftModule] = useState('');
  const [draftAction, setDraftAction] = useState('');
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({
    action: '',
    dateFrom: '',
    dateTo: '',
    module: '',
    search: '',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<AuditLogPagination>({
    page: 1,
    pageSize: AUDIT_LOGS_PAGE_SIZE,
    totalPages: 1,
    totalRecords: 0,
  });

  useEffect(() => {
    const accessToken = session?.accessToken;

    if (!accessToken) {
      return;
    }

    const controller = new AbortController();

    async function loadAuditLogs() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const params = new URLSearchParams();

        if (appliedFilters.search) {
          params.set('search', appliedFilters.search);
        }

        if (appliedFilters.module) {
          params.set('module', appliedFilters.module);
        }

        if (appliedFilters.action) {
          params.set('action', appliedFilters.action);
        }

        if (appliedFilters.dateFrom) {
          params.set('dateFrom', appliedFilters.dateFrom);
        }

        if (appliedFilters.dateTo) {
          params.set('dateTo', appliedFilters.dateTo);
        }

        params.set('page', String(currentPage));
        params.set('pageSize', String(AUDIT_LOGS_PAGE_SIZE));

        const response = await fetch(`${API_BASE_URL}/audit-logs?${params.toString()}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Unable to load audit logs.');
        }

        const data = (await response.json()) as {
          data: AuditLogRecord[];
          pagination: AuditLogPagination;
        };
        setAuditLogs(data.data);
        setPagination(data.pagination);
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }

        setErrorMessage('Unable to load audit logs right now.');
      } finally {
        setIsLoading(false);
      }
    }

    void loadAuditLogs();

    return () => controller.abort();
  }, [appliedFilters, currentPage, session?.accessToken]);

  const [moduleOptions, setModuleOptions] = useState<string[]>([]);
  const [actionOptions, setActionOptions] = useState<string[]>([]);

  useEffect(() => {
    const accessToken = session?.accessToken;

    if (!accessToken) {
      return;
    }

    const controller = new AbortController();

    void fetch(`${API_BASE_URL}/audit-logs/options`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as {
          actions: string[];
          modules: string[];
        } | null;

        if (response.ok && data) {
          setModuleOptions(data.modules);
          setActionOptions(data.actions);
        }
      })
      .catch(() => {
        // Filter dropdowns remain empty if options cannot be loaded.
      });

    return () => controller.abort();
  }, [session?.accessToken]);

  const tableRows = useMemo(
    () =>
      auditLogs.map((log) => [
        formatAuditTimestamp(log.created_at, dateTimeSettings),
        log.admin_name || 'System',
        log.action,
        log.module,
        log.details || '—',
      ]),
    [auditLogs, dateTimeSettings],
  );

  const onApplyFilters = () => {
    setCurrentPage(1);
    setAppliedFilters({
      action: draftAction,
      dateFrom: draftDateFrom,
      dateTo: draftDateTo,
      module: draftModule,
      search: draftSearch,
    });
  };

  const onClearFilters = () => {
    setDraftSearch('');
    setDraftModule('');
    setDraftAction('');
    setDraftDateFrom('');
    setDraftDateTo('');
    setCurrentPage(1);
    setAppliedFilters({
      action: '',
      dateFrom: '',
      dateTo: '',
      module: '',
      search: '',
    });
  };

  const auditHeader = ['Date & Time', 'User', 'Action', 'Module', 'Details', 'IP Address'];

  const onExport = (format: 'csv' | 'pdf') => {
    const blob = new Blob(
      [
        format === 'csv'
          ? buildCsv(auditHeader, tableRows)
          : buildPdf('EINGRESS Audit Logs', auditHeader, tableRows, dateTimeSettings),
      ],
      { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/pdf' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-logs.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="module-page">
      {!embedded ? (
        <PageHeader title="Audit Logs" description="Track all system activities and changes." />
      ) : null}
      <div className="module-filter-row enrollment-filter-row">
        <input
          aria-label="Search audit logs"
          onChange={(event) => setDraftSearch(event.target.value)}
          placeholder="Search by action, module, or details"
          type="search"
          value={draftSearch}
        />
        <select
          aria-label="Filter by action"
          onChange={(event) => setDraftAction(event.target.value)}
          value={draftAction}
        >
          <option value="">All Actions</option>
          {actionOptions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by module"
          onChange={(event) => setDraftModule(event.target.value)}
          value={draftModule}
        >
          <option value="">All Modules</option>
          {moduleOptions.map((module) => (
            <option key={module} value={module}>
              {module}
            </option>
          ))}
        </select>
        <input
          aria-label="Filter start date"
          onChange={(event) => setDraftDateFrom(event.target.value)}
          type="date"
          value={draftDateFrom}
        />
        <input
          aria-label="Filter end date"
          onChange={(event) => setDraftDateTo(event.target.value)}
          type="date"
          value={draftDateTo}
        />
        <button className="filter-button" onClick={onApplyFilters} type="button">
          Filter
          <Filter size={16} />
        </button>
        <button className="filter-button" onClick={onClearFilters} type="button">
          Clear
        </button>
      </div>
      <div
        className="module-filter-row"
        style={{ marginTop: '12px', gridTemplateColumns: 'repeat(2, max-content)' }}
      >
        <button className="dark-action-button" onClick={() => onExport('csv')} type="button">
          Export CSV
          <Download size={16} />
        </button>
        <button className="dark-action-button" onClick={() => onExport('pdf')} type="button">
          Export PDF
          <Download size={16} />
        </button>
      </div>
      <ModuleTable
        emptyMessage="No audit logs match the selected criteria."
        errorMessage={errorMessage ?? undefined}
        isLoading={isLoading}
        title="Audit Logs"
        columns={['Date & Time', 'User', 'Action', 'Module', 'Details']}
        rows={tableRows}
        pagination={pagination}
        onPageChange={setCurrentPage}
      />
    </section>
  );
}

export function SettingsPage() {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<'general' | 'security'>('general');
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SYSTEM_SETTINGS);
  const [lastSavedSettings, setLastSavedSettings] =
    useState<SystemSettings>(DEFAULT_SYSTEM_SETTINGS);
  const [profile, setProfile] = useState<AdminSettingsProfile | null>(null);
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [isVerifyRfidOpen, setIsVerifyRfidOpen] = useState(false);
  const [verifyRfidInput, setVerifyRfidInput] = useState('');
  const [verifyRfidError, setVerifyRfidError] = useState('');
  const [verifyRfidStep, setVerifyRfidStep] = useState<'idle' | 'saving' | 'success' | 'error'>(
    'idle',
  );
  const [verifySuccessCountdown, setVerifySuccessCountdown] = useState(5);
  const isSavingProfile = verifyRfidStep === 'saving';
  const [isChangeRfidOpen, setIsChangeRfidOpen] = useState(false);
  const [changeRfidInput, setChangeRfidInput] = useState('');
  const [changeRfidError, setChangeRfidError] = useState('');
  const [isChangingRfid, setIsChangingRfid] = useState(false);

  useEffect(() => {
    if (verifyRfidStep !== 'success') return;

    const intervalId = window.setInterval(() => {
      setVerifySuccessCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(intervalId);
          setIsVerifyRfidOpen(false);
          setVerifyRfidStep('idle');
          return 5;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [verifyRfidStep]);

  useEffect(() => {
    if (!session?.accessToken) return;

    const controller = new AbortController();
    const headers = { Authorization: `Bearer ${session.accessToken}` };

    void Promise.all([
      fetch(`${API_BASE_URL}/settings`, { headers, signal: controller.signal }),
      fetch(`${API_BASE_URL}/auth/me`, { headers, signal: controller.signal }),
      fetch(`${API_BASE_URL}/users`, { headers, signal: controller.signal }),
    ])
      .then(async ([settingsResponse, profileResponse, usersResponse]) => {
        const settingsData = (await settingsResponse
          .json()
          .catch(() => null)) as SystemSettings | null;
        const profileData = (await profileResponse
          .json()
          .catch(() => null)) as AdminSettingsProfile | null;
        const usersData = (await usersResponse.json().catch(() => null)) as UserRecord[] | null;

        if (settingsResponse.ok && settingsData) {
          const merged = { ...DEFAULT_SYSTEM_SETTINGS, ...settingsData };
          setSettings(merged);
          setLastSavedSettings(merged);
        }
        if (profileResponse.ok && profileData) setProfile(profileData);
        if (usersResponse.ok && Array.isArray(usersData)) {
          setTotalUsers(usersData.filter((user) => !user.is_archived).length);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setMessage('Unable to load all settings. Please try again.');
      });

    return () => controller.abort();
  }, [session?.accessToken]);

  const updateSetting = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const isDirty = JSON.stringify(settings) !== JSON.stringify(lastSavedSettings);

  async function saveSettings() {
    if (!session?.accessToken) return;

    if (settings.idle_timeout_warning_minutes >= settings.session_timeout_minutes) {
      setMessage('Idle Timeout Warning must be less than Session Timeout.');
      return;
    }

    try {
      setIsSaving(true);
      setMessage('');
      const response = await fetch(`${API_BASE_URL}/settings`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeZone: settings.time_zone,
          dateFormat: settings.date_format,
          timeFormat: settings.time_format,
          systemLanguage: settings.system_language,
          sessionTimeoutMinutes: settings.session_timeout_minutes,
          firstDayOfWeek: settings.first_day_of_week,
          maxFailedAttempts: settings.max_failed_attempts,
          lockoutDurationMinutes: settings.lockout_duration_minutes,
          resetFailedAttemptsAfterMinutes: settings.reset_failed_attempts_after_minutes,
          lockoutEnabled: settings.lockout_enabled,
          idleTimeoutWarningMinutes: settings.idle_timeout_warning_minutes,
          autoLogoutEnabled: settings.auto_logout_enabled,
          keepMeLoggedIn: settings.keep_me_logged_in,
          adminRfidEnabled: settings.admin_rfid_enabled,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | SystemSettings
        | { error?: string }
        | null;

      if (!response.ok || !data || 'error' in data) {
        throw new Error(data && 'error' in data ? data.error : 'Unable to save settings.');
      }

      const merged = { ...DEFAULT_SYSTEM_SETTINGS, ...data };
      setSettings(merged);
      setLastSavedSettings(merged);
      setDateTimeSettings(merged);
      setSecuritySettings(merged);
      setMessage('Settings saved successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save settings.');
    } finally {
      setIsSaving(false);
    }
  }

  function startEditingProfile() {
    setEditedName(profile?.name ?? session?.adminName ?? '');
    setProfileError('');
    setProfileMessage('');
    setIsEditingProfile(true);
  }

  function openVerifyRfidModal() {
    if (!editedName.trim()) {
      setProfileError('Admin name is required.');
      return;
    }
    setProfileError('');
    setVerifyRfidInput('');
    setVerifyRfidError('');
    setVerifyRfidStep('idle');
    setIsVerifyRfidOpen(true);
  }

  function closeVerifyRfidModal() {
    setIsVerifyRfidOpen(false);
    setVerifyRfidStep('idle');
    setVerifyRfidInput('');
    setVerifyRfidError('');
  }

  function retryVerifyRfid() {
    setVerifyRfidInput('');
    setVerifyRfidError('');
    setVerifyRfidStep('idle');
  }

  async function submitProfileNameChange() {
    if (!session?.accessToken) return;

    if (!verifyRfidInput.trim()) {
      setVerifyRfidError('Please scan or enter your RFID card.');
      return;
    }

    setVerifyRfidStep('saving');
    setVerifyRfidError('');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: editedName.trim(), rfidCode: verifyRfidInput.trim() }),
      });
      const data = (await response.json().catch(() => null)) as
        | AdminSettingsProfile
        | { error?: string }
        | null;

      if (!response.ok || !isAdminSettingsProfile(data)) {
        const errorMessage =
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Unable to update admin name.';
        throw new Error(errorMessage);
      }

      setProfile(data);
      setIsEditingProfile(false);
      setProfileMessage('Admin name updated successfully.');
      setVerifySuccessCountdown(5);
      setVerifyRfidStep('success');
    } catch (error) {
      setVerifyRfidError(error instanceof Error ? error.message : 'Unable to update admin name.');
      setVerifyRfidStep('error');
    }
  }

  function openChangeRfidModal() {
    setChangeRfidInput('');
    setChangeRfidError('');
    setIsChangeRfidOpen(true);
  }

  async function submitRfidChange() {
    if (!session?.accessToken) return;

    if (!changeRfidInput.trim()) {
      setChangeRfidError('Please scan or enter the new RFID card.');
      return;
    }

    try {
      setIsChangingRfid(true);
      setChangeRfidError('');
      const response = await fetch(`${API_BASE_URL}/auth/me/rfid`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rfidUid: changeRfidInput.trim() }),
      });
      const data = (await response.json().catch(() => null)) as
        | AdminSettingsProfile
        | { error?: string }
        | null;

      if (!response.ok || !isAdminSettingsProfile(data)) {
        const errorMessage =
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Unable to update RFID card.';
        throw new Error(errorMessage);
      }

      setProfile(data);
      setIsChangeRfidOpen(false);
      setProfileMessage('RFID card updated successfully.');
    } catch (error) {
      setChangeRfidError(error instanceof Error ? error.message : 'Unable to update RFID card.');
    } finally {
      setIsChangingRfid(false);
    }
  }

  return (
    <section className="module-page">
      <PageHeader title="Settings" description="Configure system preferences and parameters." />
      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        <button
          className={activeTab === 'general' ? 'active' : ''}
          onClick={() => setActiveTab('general')}
          role="tab"
          type="button"
        >
          General Settings
        </button>
        <button
          className={activeTab === 'security' ? 'active' : ''}
          onClick={() => setActiveTab('security')}
          role="tab"
          type="button"
        >
          System &amp; Security
        </button>
      </div>

      {activeTab === 'general' ? (
        <div className="general-settings-grid">
          <section className="module-panel settings-card admin-profile-card">
            <h2>Admin Profile</h2>
            <div className="settings-fields">
              <label>
                Admin Name
                <input
                  disabled={!isEditingProfile}
                  onChange={(event) => setEditedName(event.target.value)}
                  value={
                    isEditingProfile
                      ? editedName
                      : (profile?.name ?? session?.adminName ?? 'Administrator')
                  }
                />
              </label>
              <label>
                Email
                <input disabled value={profile?.email ?? session?.email ?? ''} />
              </label>
              <label>
                System Language
                <select
                  disabled={isEditingProfile}
                  value={settings.system_language}
                  onChange={(event) => updateSetting('system_language', event.target.value)}
                >
                  <option>English</option>
                  <option>Filipino</option>
                </select>
              </label>
              <label>
                Role
                <input disabled value={profile?.role ?? 'Administrator'} />
              </label>
              <div className="admin-profile-rfid-row">
                <label>
                  RFID Number
                  <input disabled value={profile?.rfidUid ?? '—'} />
                </label>
                <button
                  className="change-rfid-button"
                  disabled={isEditingProfile}
                  onClick={openChangeRfidModal}
                  type="button"
                >
                  Change RFID
                </button>
              </div>
            </div>
            {profileError ? (
              <p className="module-table-message error" role="alert">
                {profileError}
              </p>
            ) : null}
            {profileMessage ? <p className="module-table-message">{profileMessage}</p> : null}
            <div className="admin-profile-footer">
              <button
                className="admin-profile-edit-button"
                disabled={isSavingProfile}
                onClick={() => (isEditingProfile ? openVerifyRfidModal() : startEditingProfile())}
                type="button"
              >
                {isEditingProfile ? 'Save Changes' : 'Edit'}
              </button>
            </div>
          </section>
          <section className="module-panel settings-card system-info-card">
            <h2>System Information</h2>
            <dl>
              <div>
                <dt>System Version</dt>
                <dd>{settings.system_version}</dd>
              </div>
              <div>
                <dt>Database Status</dt>
                <dd className="healthy">{settings.database_status}</dd>
              </div>
              <div>
                <dt>Last Backup</dt>
                <dd>
                  {settings.last_backup_at
                    ? formatAuditTimestamp(settings.last_backup_at, settings)
                    : 'Not available'}
                </dd>
              </div>
              <div>
                <dt>Total Users</dt>
                <dd>{totalUsers ?? '—'}</dd>
              </div>
            </dl>
          </section>
        </div>
      ) : (
        <div className="security-settings-stack">
          <section className="module-panel settings-card">
            <h2>Date &amp; Time Settings</h2>
            <p>Configure how dates and times are displayed across the system.</p>
            <div className="security-fields four-columns">
              <label>
                Date Format
                <select
                  value={settings.date_format}
                  onChange={(event) => updateSetting('date_format', event.target.value)}
                >
                  {withCurrentOption(DATE_FORMAT_OPTIONS, settings.date_format).map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label>
                Time Format
                <select
                  value={settings.time_format}
                  onChange={(event) => updateSetting('time_format', event.target.value)}
                >
                  {withCurrentOption(TIME_FORMAT_OPTIONS, settings.time_format).map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label>
                First Day of Week
                <select
                  value={settings.first_day_of_week}
                  onChange={(event) => updateSetting('first_day_of_week', event.target.value)}
                >
                  {withCurrentOption(FIRST_DAY_OF_WEEK_OPTIONS, settings.first_day_of_week).map(
                    (option) => (
                      <option key={option}>{option}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Time Zone
                <select
                  value={settings.time_zone}
                  onChange={(event) => updateSetting('time_zone', event.target.value)}
                >
                  {withCurrentOption(TIME_ZONE_OPTIONS, settings.time_zone).map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <section className="module-panel settings-card">
            <h2>Account Lockout Policy</h2>
            <p>Define account lockout rules to prevent unauthorized access.</p>
            <div className="security-fields lockout-fields">
              <label>
                Maximum Failed Attempts
                <input
                  min="1"
                  type="number"
                  value={settings.max_failed_attempts}
                  onChange={(event) =>
                    updateSetting('max_failed_attempts', Number(event.target.value))
                  }
                />
              </label>
              <label>
                Lockout Duration (minutes)
                <input
                  min="1"
                  type="number"
                  value={settings.lockout_duration_minutes}
                  onChange={(event) =>
                    updateSetting('lockout_duration_minutes', Number(event.target.value))
                  }
                />
              </label>
              <label>
                Reset Failed Attempts After (minutes)
                <input
                  min="1"
                  type="number"
                  value={settings.reset_failed_attempts_after_minutes}
                  onChange={(event) =>
                    updateSetting('reset_failed_attempts_after_minutes', Number(event.target.value))
                  }
                />
              </label>
              <label className="toggle-setting">
                <input
                  checked={settings.lockout_enabled}
                  onChange={(event) => updateSetting('lockout_enabled', event.target.checked)}
                  type="checkbox"
                />
                <span />
                Enable lockout policy
              </label>
            </div>
          </section>
          <section className="module-panel settings-card">
            <h2>Session &amp; Timeout Settings</h2>
            <p>Configure user session and system timeout preferences.</p>
            <div className="security-fields session-fields">
              <label>
                Session Timeout (minutes)
                <input
                  min="1"
                  type="number"
                  value={settings.session_timeout_minutes}
                  onChange={(event) =>
                    updateSetting('session_timeout_minutes', Number(event.target.value))
                  }
                />
              </label>
              <label>
                Idle Timeout Warning (minutes)
                <input
                  min="1"
                  type="number"
                  value={settings.idle_timeout_warning_minutes}
                  onChange={(event) =>
                    updateSetting('idle_timeout_warning_minutes', Number(event.target.value))
                  }
                />
              </label>
              <label className="toggle-setting">
                <input
                  checked={settings.auto_logout_enabled}
                  onChange={(event) => updateSetting('auto_logout_enabled', event.target.checked)}
                  type="checkbox"
                />
                <span />
                Enable auto logout
              </label>
              <label className="toggle-setting">
                <input
                  checked={settings.keep_me_logged_in}
                  onChange={(event) => updateSetting('keep_me_logged_in', event.target.checked)}
                  type="checkbox"
                />
                <span />
                Keep me logged in
              </label>
            </div>
          </section>
          <section className="module-panel settings-card">
            <h2>RFID Authentication</h2>
            <p>Strengthen account security by requiring RFID authentication.</p>
            <label className="toggle-setting">
              <input
                checked={settings.admin_rfid_enabled}
                onChange={(event) => updateSetting('admin_rfid_enabled', event.target.checked)}
                type="checkbox"
              />
              <span />
              Administrator Enable RFID
            </label>
          </section>
          <section className="module-panel settings-card">
            <h2>Password</h2>
            <p>Update your account password regularly to keep your account secure.</p>
            <Link className="text-link change-password-link" to="/settings/change-password">
              Change Password
            </Link>
          </section>
        </div>
      )}
      <div className="settings-save-row">
        <span>{message || (isDirty && !isSaving ? 'You have unsaved changes.' : '')}</span>
        <button
          className="save-settings-button"
          disabled={isSaving || !isDirty}
          onClick={() => void saveSettings()}
          type="button"
        >
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {isVerifyRfidOpen ? (
        <div className="rfid-scan-backdrop" role="presentation">
          <section className="rfid-scan-modal" aria-labelledby="verify-rfid-title" role="dialog">
            <header>
              <div className="rfid-scan-brand">
                <span aria-hidden="true">ID</span>
                <div>
                  <strong>EINGRESS</strong>
                  <small>ATTENDANCE KIOSK</small>
                </div>
              </div>
              <button
                aria-label="Close RFID verification"
                onClick={closeVerifyRfidModal}
                type="button"
              >
                X
              </button>
            </header>

            {verifyRfidStep === 'saving' ? (
              <>
                <div className="rfid-scan-visual" aria-hidden="true">
                  <span className="rfid-id-card-symbol">
                    <i />
                    <span>
                      <b />
                      <b />
                      <b />
                    </span>
                  </span>
                </div>
                <h2 id="verify-rfid-title">Saving changes...</h2>
                <p>Please wait while we save your profile changes.</p>
              </>
            ) : verifyRfidStep === 'success' ? (
              <>
                <div className="rfid-scan-visual rfid-scan-visual-success" aria-hidden="true">
                  <Check size={64} strokeWidth={3} />
                </div>
                <h2 id="verify-rfid-title">Verification Successful</h2>
                <p>
                  Returning to home screen in {verifySuccessCountdown} second
                  {verifySuccessCountdown === 1 ? '' : 's'}...
                </p>
              </>
            ) : verifyRfidStep === 'error' ? (
              <>
                <div className="rfid-scan-visual rfid-scan-visual-error" aria-hidden="true">
                  <X size={64} strokeWidth={3} />
                </div>
                <h2 id="verify-rfid-title">Verification Failed</h2>
                <p>{verifyRfidError || 'Please try again.'}</p>
                <div className="rfid-scan-result-actions">
                  <button
                    className="rfid-scan-capture-button"
                    onClick={retryVerifyRfid}
                    type="button"
                  >
                    Scan Again
                  </button>
                  <button
                    className="rfid-scan-cancel-button"
                    onClick={closeVerifyRfidModal}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rfid-scan-visual" aria-hidden="true">
                  <span className="rfid-id-card-symbol">
                    <i />
                    <span>
                      <b />
                      <b />
                      <b />
                    </span>
                  </span>
                </div>
                <h2 id="verify-rfid-title">Verify Your Identity</h2>
                <p>Tap your admin RFID card to confirm this change.</p>
                <label className="rfid-scan-input">
                  <span>RFID Number</span>
                  <input
                    autoFocus
                    inputMode="numeric"
                    onChange={(event) => setVerifyRfidInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void submitProfileNameChange();
                      }
                    }}
                    placeholder="Tap card or enter RFID"
                    value={verifyRfidInput}
                  />
                </label>
                <button
                  className="rfid-scan-capture-button"
                  onClick={() => void submitProfileNameChange()}
                  type="button"
                >
                  Confirm Changes
                </button>
              </>
            )}
            <div className="rfid-scan-dots" aria-hidden="true" />
          </section>
        </div>
      ) : null}

      {isChangeRfidOpen ? (
        <div className="rfid-scan-backdrop" role="presentation">
          <section className="rfid-scan-modal" aria-labelledby="change-rfid-title" role="dialog">
            <header>
              <div className="rfid-scan-brand">
                <span aria-hidden="true">ID</span>
                <div>
                  <strong>EINGRESS</strong>
                  <small>ATTENDANCE KIOSK</small>
                </div>
              </div>
              <button
                aria-label="Close RFID scanner"
                onClick={() => setIsChangeRfidOpen(false)}
                type="button"
              >
                X
              </button>
            </header>

            <div className="rfid-scan-visual" aria-hidden="true">
              <span className="rfid-id-card-symbol">
                <i />
                <span>
                  <b />
                  <b />
                  <b />
                </span>
              </span>
            </div>

            <h2 id="change-rfid-title">Place New ID</h2>
            <p>Your new ID is being registered... Please wait.</p>
            <label className="rfid-scan-input">
              <span>RFID Number</span>
              <input
                autoFocus
                inputMode="numeric"
                onChange={(event) => setChangeRfidInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void submitRfidChange();
                  }
                }}
                placeholder="Tap card or enter RFID"
                value={changeRfidInput}
              />
            </label>
            <button
              className="rfid-scan-capture-button"
              disabled={isChangingRfid}
              onClick={() => void submitRfidChange()}
              type="button"
            >
              {isChangingRfid ? 'Saving...' : 'Use RFID'}
            </button>
            {changeRfidError ? (
              <p className="module-table-message error" role="alert">
                {changeRfidError}
              </p>
            ) : null}
            <div className="rfid-scan-dots" aria-hidden="true" />
          </section>
        </div>
      ) : null}
    </section>
  );
}
