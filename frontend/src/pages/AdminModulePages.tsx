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

import { useAuth } from '../auth/useAuth';

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

const reportRows = [
  ['Attendance Summary', 'Attendance Summary', 'Admin', 'May 20', 'Download'],
  ['Late Arrival Report', 'Late Arrival', 'Admin', 'May 20', 'Download'],
  ['Absenteeism Report', 'Absenteeism', 'Admin', 'May 20', 'Download'],
];

const auditRows = [
  ['May 20 11:45 AM', 'Admin', 'Login', 'Authentication', 'Admin logged in', '192.168.1.100'],
  [
    'May 20 11:30 AM',
    'Admin',
    'Approved Enrollment',
    'Enrollment',
    'Approved REQ-0107',
    '192.168.1.100',
  ],
  ['May 20 11:25 AM', 'Admin', 'Added Device', 'Device Mgmt', 'Added DEV-006', '192.168.1.100'],
  [
    'May 20 11:15 AM',
    'Admin',
    'Generated Report',
    'Reports',
    'Attendance Summary',
    '192.168.1.100',
  ],
  ['May 20 11:05 AM', 'Admin', 'Updated User', 'User Mgmt', 'Updated EMP003', '192.168.1.100'],
  [
    'May 20 10:50 AM',
    'Admin',
    'Rejected Enrollment',
    'Enrollment',
    'Rejected REQ-0108',
    '192.168.1.100',
  ],
  ['May 20 10:35 AM', 'Admin', 'Login', 'Authentication', 'Admin logged in', '192.168.1.100'],
];

type EnrollmentRequest = {
  department: string;
  employee_id: string;
  email?: string | null;
  full_name: string;
  id: number;
  rfid_uid: string | null;
  request_code: string;
  request_type: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  submitted_at: string;
};

type EnrollmentStatusFilter = EnrollmentRequest['status'] | 'All';

type UserRecord = {
  created_at: string;
  department: string | null;
  email: string | null;
  employee_id: string;
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
  employeeId: string;
  id: number;
  name: string;
  online: boolean;
  rfidUid: string;
  role: string;
};

type UserEditForm = {
  fullName: string;
  rfidUid: string;
  role: string;
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

function FilterRow({ showGenerate = false }: { showGenerate?: boolean }) {
  return (
    <div className="module-filter-row">
      <input defaultValue="May 20, 2025" aria-label="Date" />
      <input defaultValue="All Departments" aria-label="Department" />
      <input defaultValue="All Status" aria-label="Status" />
      <input placeholder="Search by name or ID..." aria-label="Search" />
      {showGenerate ? <button className="dark-action-button">Generate Report</button> : null}
      <button className="filter-button" type="button">
        Filter
        <Filter size={16} />
      </button>
    </div>
  );
}

function EnrollmentFilterRow({
  departmentFilter,
  departments,
  endDateFilter,
  nameFilter,
  onClear,
  onDepartmentChange,
  onEndDateChange,
  onNameChange,
  onStatusChange,
  onStartDateChange,
  resultCount,
  startDateFilter,
  statusFilter,
}: {
  departmentFilter: string;
  departments: string[];
  endDateFilter: string;
  nameFilter: string;
  onClear: () => void;
  onDepartmentChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onStatusChange: (value: EnrollmentStatusFilter) => void;
  onStartDateChange: (value: string) => void;
  resultCount: number;
  startDateFilter: string;
  statusFilter: EnrollmentStatusFilter;
}) {
  return (
    <div className="module-filter-row enrollment-filter-row">
      <input
        aria-label="Filter by name"
        onChange={(event) => onNameChange(event.target.value)}
        placeholder="Filter by name..."
        type="search"
        value={nameFilter}
      />
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
      <input
        aria-label="Filter start date"
        onChange={(event) => onStartDateChange(event.target.value)}
        type="date"
        value={startDateFilter}
      />
      <input
        aria-label="Filter end date"
        onChange={(event) => onEndDateChange(event.target.value)}
        type="date"
        value={endDateFilter}
      />
      <button className="filter-button" onClick={onClear} type="button">
        Clear
        <Filter size={16} />
      </button>
      <span className="filter-result-count" aria-live="polite">
        {resultCount} shown
      </span>
    </div>
  );
}

function ModuleTable({
  actionRenderer,
  columns,
  emptyMessage = 'No records found.',
  errorMessage,
  isLoading = false,
  rows,
  title,
  withActions = false,
}: {
  actionRenderer?: (rowIndex: number) => ReactNode;
  columns: string[];
  emptyMessage?: string;
  errorMessage?: string;
  isLoading?: boolean;
  rows: string[][];
  title: string;
  withActions?: boolean;
}) {
  return (
    <section className="module-panel" aria-labelledby={`${title.replaceAll(' ', '-')}-title`}>
      <h2 id={`${title.replaceAll(' ', '-')}-title`}>{title}</h2>
      <div className="module-table-wrap">
        <table className="module-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
              {withActions ? <th>Actions</th> : null}
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
                        <strong>{cell}</strong>
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                  {withActions ? (
                    <td>
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
          </tbody>
        </table>
      </div>
      <div className="module-pagination">
        <span>Showing 1 to {rows.length} entries</span>
        <span>
          <button className="active">1</button>
          <button>2</button>
          <button>3</button>
          <button>&gt;</button>
        </span>
      </div>
    </section>
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

function formatSubmittedDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
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

  return {
    accessStatus: user.is_active ? 'Active' : 'Disabled',
    accessTone: user.is_active ? 'success' : 'danger',
    avatar: getInitials(user.full_name),
    avatarTone: getAvatarTone(index),
    biometricStatus: hasBiometric ? 'Registered' : 'Missing',
    biometricTone: hasBiometric ? 'success' : 'danger',
    employeeId: user.employee_id,
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

export function AttendanceManagementPage() {
  const { session } = useAuth();
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
  });
  const [editFormError, setEditFormError] = useState('');
  const [isRfidScannerOpen, setIsRfidScannerOpen] = useState(false);
  const [isFingerprintScannerOpen, setIsFingerprintScannerOpen] = useState(false);
  const [rfidScanInput, setRfidScanInput] = useState('');
  const [rfidScanBaselineNonce, setRfidScanBaselineNonce] = useState(0);
  const [visibleRfidUserIds, setVisibleRfidUserIds] = useState<Set<number>>(() => new Set());

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
          setEditForm((currentForm) => ({ ...currentForm, rfidUid }));
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
  }, [isRfidScannerOpen, rfidScanBaselineNonce]);

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

    setEditForm((currentForm) => ({ ...currentForm, rfidUid }));
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
  }

  async function saveUserDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
        body: JSON.stringify({ fullName, role, rfidUid: rfidUid || null }),
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
          <table className="user-management-table">
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
                visibleUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <span className="managed-user-cell">
                        <span className={`managed-avatar ${user.avatarTone}`}>
                          {user.avatar}
                          {user.online ? <i aria-hidden="true" /> : null}
                        </span>
                        <span>
                          <strong>{user.name}</strong>
                          <small>{user.employeeId}</small>
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
                          {visibleRfidUserIds.has(user.id) ? user.rfidUid : maskRfid(user.rfidUid)}
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
                ))
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

      {editingUser && isRfidScannerOpen ? (
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

      {editingUser && isFingerprintScannerOpen ? (
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
            <p>Place finger on the scanner.</p>
            <div className="rfid-scan-dots" aria-hidden="true" />
          </section>
        </div>
      ) : null}
    </section>
  );
}

export function EnrollmentRequestsPage() {
  const { session } = useAuth();
  const [requests, setRequests] = useState<EnrollmentRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [updatingRequestId, setUpdatingRequestId] = useState<number | null>(null);
  const [nameFilter, setNameFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<EnrollmentStatusFilter>('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

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
      const matchesStartDate = !startDateFilter || submittedDate >= startDateFilter;
      const matchesEndDate = !endDateFilter || submittedDate <= endDateFilter;

      return (
        matchesName && matchesStatus && matchesDepartment && matchesStartDate && matchesEndDate
      );
    });
  }, [departmentFilter, endDateFilter, nameFilter, requests, startDateFilter, statusFilter]);

  const enrollmentRows = useMemo(
    () =>
      filteredRequests.map((request) => [
        request.request_code,
        request.full_name,
        request.employee_id,
        request.department,
        request.rfid_uid || '-',
        request.request_type,
        formatSubmittedDate(request.submitted_at),
        request.status,
      ]),
    [filteredRequests],
  );

  function clearEnrollmentFilters() {
    setNameFilter('');
    setStatusFilter('All');
    setDepartmentFilter('All');
    setStartDateFilter('');
    setEndDateFilter('');
  }

  return (
    <section className="module-page">
      <PageHeader
        title="Enrollment Requests"
        description="Review and manage biometric and RFID enrollment requests."
      />
      <EnrollmentFilterRow
        departmentFilter={departmentFilter}
        departments={departmentOptions}
        endDateFilter={endDateFilter}
        nameFilter={nameFilter}
        onClear={clearEnrollmentFilters}
        onDepartmentChange={setDepartmentFilter}
        onEndDateChange={setEndDateFilter}
        onNameChange={setNameFilter}
        onStartDateChange={setStartDateFilter}
        onStatusChange={setStatusFilter}
        resultCount={filteredRequests.length}
        startDateFilter={startDateFilter}
        statusFilter={statusFilter}
      />
      <ModuleTable
        title="Enrollment Requests"
        columns={[
          'Request ID',
          'Name',
          'Employee ID',
          'Department',
          'RFID UID',
          'Request Type',
          'Submitted',
          'Status',
        ]}
        rows={enrollmentRows}
        isLoading={isLoading}
        errorMessage={errorMessage}
        emptyMessage="No enrollment requests found."
        withActions
        actionRenderer={(rowIndex) => {
          const request = filteredRequests[rowIndex];
          const isUpdating = updatingRequestId === request.id;
          const isPending = request.status === 'Pending';

          return (
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
              <button className="tiny-view" type="button">
                View
              </button>
            </span>
          );
        }}
      />
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

export function ReportsPage() {
  return (
    <section className="module-page">
      <PageHeader title="Reports" description="Generate and download system reports." />
      <FilterRow showGenerate />
      <div className="report-summary-grid">
        <section className="module-panel">
          <h2>Attendance Summary</h2>
          <div className="report-bars">
            <span style={{ width: '74%' }} />
            <span style={{ width: '82%' }} />
            <span className="green" style={{ width: '68%' }} />
            <span className="red" style={{ width: '55%' }} />
            <span className="yellow" style={{ width: '63%' }} />
          </div>
        </section>
        <section className="module-panel department-summary">
          <h2>Department Summary</h2>
          <div className="donut-summary">Total 528</div>
          <ul>
            <li>
              IT Department <strong>42%</strong>
            </li>
            <li>
              HR Department <strong>25%</strong>
            </li>
            <li>
              Operations <strong>20%</strong>
            </li>
            <li>
              Finance <strong>13%</strong>
            </li>
          </ul>
        </section>
      </div>
      <ModuleTable
        title="Recent Reports"
        columns={['Report Name', 'Report Type', 'Generated By', 'Generated On', 'Actions']}
        rows={reportRows}
        withActions
      />
    </section>
  );
}

export function AuditLogsPage() {
  return (
    <section className="module-page">
      <PageHeader title="Audit Logs" description="Track all system activities and changes." />
      <FilterRow />
      <ModuleTable
        title="Audit Logs"
        columns={['Date & Time', 'User', 'Action', 'Module', 'Details', 'IP Address']}
        rows={auditRows}
      />
    </section>
  );
}

export function SettingsPage() {
  return (
    <section className="module-page">
      <PageHeader title="Settings" description="Configure system preferences and parameters." />
      <div className="settings-layout">
        <nav className="settings-menu" aria-label="Settings sections">
          {[
            'General Settings',
            'System Preferences',
            'Security Settings',
            'Backup & Restore',
            'System Information',
          ].map((item, index) => (
            <button className={index === 0 ? 'active' : ''} key={item} type="button">
              {item}
            </button>
          ))}
        </nav>

        <section className="module-panel settings-form-panel">
          <h2>General Settings</h2>
          <div className="settings-form-grid">
            <label>
              Company Name
              <input defaultValue="EINGRESS Corporation" />
            </label>
            <label>
              Time Zone
              <input defaultValue="(UTC+08:00) Asia/Manila" />
            </label>
            <label>
              Date Format
              <input defaultValue="MM/DD/YYYY" />
            </label>
            <label>
              Time Format
              <input defaultValue="12-Hour (hh:mm AM/PM)" />
            </label>
            <label>
              System Language
              <input defaultValue="English" />
            </label>
            <label>
              Session Timeout
              <input defaultValue="30 minutes" />
            </label>
          </div>
          <button className="save-settings-button" type="button">
            Save Changes
          </button>
        </section>

        <section className="module-panel system-info-panel">
          <h2>System Information</h2>
          {[
            ['System Version', 'v2.1.0'],
            ['Database Status', 'Healthy'],
            ['Last Backup', 'May 20, 2025 02:00 AM'],
            ['Total Users', '528'],
            ['Total Devices', '24'],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong className={value === 'Healthy' ? 'healthy' : ''}>{value}</strong>
            </div>
          ))}
        </section>
      </div>
    </section>
  );
}
