CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE attendance_status AS ENUM ('Present', 'Late', 'Absent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE access_result AS ENUM ('Granted', 'Denied');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE device_status AS ENUM ('Online', 'Offline', 'Maintenance');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE enrollment_status AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rfid_uid VARCHAR(120) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  employee_id VARCHAR(50) NOT NULL UNIQUE,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(40),
  department VARCHAR(120),
  role VARCHAR(80) NOT NULL DEFAULT 'Employee',
  fingerprint_id VARCHAR(120) UNIQUE,
  rfid_uid VARCHAR(120) UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id BIGSERIAL PRIMARY KEY,
  device_code VARCHAR(50) NOT NULL UNIQUE,
  device_name VARCHAR(160) NOT NULL,
  device_type VARCHAR(80) NOT NULL,
  location VARCHAR(160),
  ip_address INET,
  status device_status NOT NULL DEFAULT 'Online',
  temperature NUMERIC(5, 2),
  cpu_usage NUMERIC(5, 2),
  memory_usage NUMERIC(5, 2),
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS access_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  device_id BIGINT REFERENCES devices(id) ON DELETE SET NULL,
  authentication_method VARCHAR(80) NOT NULL,
  result access_result NOT NULL,
  area VARCHAR(160),
  access_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  status attendance_status NOT NULL DEFAULT 'Present',
  location VARCHAR(160),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, attendance_date)
);

CREATE SEQUENCE IF NOT EXISTS enrollment_request_code_seq START WITH 101;

CREATE TABLE IF NOT EXISTS enrollment_requests (
  id BIGSERIAL PRIMARY KEY,
  request_code VARCHAR(50) NOT NULL UNIQUE DEFAULT ('REQ-' || LPAD(nextval('enrollment_request_code_seq')::TEXT, 4, '0')),
  employee_id VARCHAR(50) NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  department VARCHAR(120) NOT NULL,
  request_type VARCHAR(80) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(40),
  rfid_uid VARCHAR(120),
  fingerprint_template TEXT,
  status enrollment_status NOT NULL DEFAULT 'Pending',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generated_reports (
  id BIGSERIAL PRIMARY KEY,
  report_name VARCHAR(160) NOT NULL,
  report_type VARCHAR(100) NOT NULL,
  generated_by BIGINT REFERENCES admins(id) ON DELETE SET NULL,
  parameters JSONB NOT NULL DEFAULT '{}'::JSONB,
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_id BIGINT REFERENCES admins(id) ON DELETE SET NULL,
  action VARCHAR(120) NOT NULL,
  module VARCHAR(120) NOT NULL,
  details TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(40) NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
  id BIGSERIAL PRIMARY KEY,
  company_name VARCHAR(160) NOT NULL DEFAULT 'EINGRESS Corporation',
  time_zone VARCHAR(100) NOT NULL DEFAULT 'Asia/Manila',
  date_format VARCHAR(40) NOT NULL DEFAULT 'MM/DD/YYYY',
  time_format VARCHAR(40) NOT NULL DEFAULT '12-Hour (hh:mm AM/PM)',
  system_language VARCHAR(80) NOT NULL DEFAULT 'English',
  session_timeout_minutes INTEGER NOT NULL DEFAULT 30,
  database_status VARCHAR(40) NOT NULL DEFAULT 'Healthy',
  last_backup_at TIMESTAMPTZ,
  system_version VARCHAR(40) NOT NULL DEFAULT 'v2.1.0',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_logs_access_time ON access_logs(access_time DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_user_date ON attendance_records(user_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_enrollment_requests_status ON enrollment_requests(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

INSERT INTO system_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Password is "admin123". Change it immediately after first login.
INSERT INTO admins (username, email, password_hash, rfid_uid)
VALUES (
  'JairosoftAdmin',
  'jairosoftadmin@eingress.local',
  crypt('Eingress@2026', gen_salt('bf')),
  'admin001'
)
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (employee_id, full_name, email, department, fingerprint_id, rfid_uid)
VALUES
  ('EMP001', 'Juan Dela Cruz', 'juan@example.com', 'IT Department', 'FP-EMP001', 'RFID-EMP001'),
  ('EMP002', 'Maria Santos', 'maria@example.com', 'HR Department', 'FP-EMP002', 'RFID-EMP002'),
  ('EMP003', 'Pedro Reyes', 'pedro@example.com', 'Operations', 'FP-EMP003', 'RFID-EMP003'),
  ('EMP004', 'Ana Garcia', 'ana@example.com', 'Finance', 'FP-EMP004', 'RFID-EMP004')
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO devices (device_code, device_name, device_type, location, ip_address, status, last_seen)
VALUES
  ('DEV-001', 'Main Entrance', 'RFID Reader', 'Office', '192.168.1.10', 'Online', NOW()),
  ('DEV-002', 'HR Office Bio', 'Biometric', 'HR Office', '192.168.1.11', 'Online', NOW()),
  ('DEV-003', 'Production Door', 'RFID Reader', 'Production', '192.168.1.12', 'Offline', NOW()),
  ('DEV-004', 'Finance Bio', 'Biometric', 'Finance', '192.168.1.13', 'Online', NOW())
ON CONFLICT (device_code) DO NOTHING;
