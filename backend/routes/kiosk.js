import express from "express";
import { setPendingEnrollmentRfidUid } from "../enrollmentSession.js";
import { query } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { broadcastMessage } from "../ws.js";
import { broadcastActivityEvent } from "../activityEvents.js";
import { createNotification } from "../lib/notifications.js";
import { fullNameSql } from "../lib/personName.js";
import { getSystemTimeZone } from "../lib/timezone.js";
import {
  CLOCK_OUT_MIN_GAP_MINUTES,
  WORKDAY_END_TIME,
  ensureAttendanceStatus,
  isLateTapSql,
} from "../lib/attendance.js";
import { emitDoorUnlock } from "../socketio.js";

export const kioskRouter = express.Router();

void ensureAttendanceStatus().catch((error) => {
  console.error("Unable to ensure attendance status exists", error);
});

async function getTodaysAccessMetrics(timeZone) {
  const resolvedTimeZone = timeZone || (await getSystemTimeZone());
  const result = await query(
    `SELECT
       COUNT(*)::int AS total_access,
       COUNT(*) FILTER (WHERE result = 'Granted')::int AS successful_attempts,
       COUNT(*) FILTER (WHERE result = 'Denied')::int AS failed_attempts
     FROM access_logs
     WHERE (access_time AT TIME ZONE $1)::date = (NOW() AT TIME ZONE $1)::date`,
    [resolvedTimeZone],
  );

  return result.rows[0];
}

async function processKioskScan(req, res, next) {
  try {
    return await processKioskScanUnsafe(req, res);
  } catch (error) {
    return next(error);
  }
}

async function processKioskScanUnsafe(req, res) {
  const {
    userId,
    employeeId,
    rfidUid,
    fingerprintId,
    authenticationMethod,
    deviceId,
  } = req.body;

  if (!userId && !employeeId && !rfidUid && !fingerprintId) {
    return res
      .status(400)
      .json({
        error: "A userId, employeeId, rfidUid, or fingerprintId is required",
      });
  }

  if (rfidUid) {
    broadcastMessage({
      type: "rfid:scanned",
      payload: { rfidUid },
    });
  }

  const params = [];
  const predicates = [];

  if (userId) {
    params.push(userId);
    predicates.push(`id = $${params.length}`);
  }

  if (employeeId) {
    params.push(employeeId);
    predicates.push(`employee_id = $${params.length}`);
  }

  if (rfidUid) {
    params.push(rfidUid);
    predicates.push(`rfid_uid = $${params.length}`);
  }

  if (fingerprintId) {
    params.push(fingerprintId);
    predicates.push(`fingerprint_id = $${params.length}`);
  }

  const method = authenticationMethod || "RFID";
  const deviceLabel = "RFID Reader";
  const timeZone = await getSystemTimeZone();

  const userResult = await query(
    `SELECT id, employee_id, ${fullNameSql()} AS full_name, department, role, is_active, expiration_date FROM users WHERE (${predicates.join(" OR ")}) AND COALESCE(is_archived, FALSE) = FALSE LIMIT 1`,
    params,
  );

  if (userResult.rowCount === 0) {
    const logResult = await query(
      `INSERT INTO access_logs (device_id, authentication_method, result, area)
       VALUES ($1, $2, $3, $4)
       RETURNING id, access_time`,
      [deviceId || null, method, "Denied", "Kiosk"],
    );
    const accessMetrics = await getTodaysAccessMetrics(timeZone);

    broadcastMessage({
      type: "dashboard:metrics-changed",
      payload: accessMetrics,
    });
    broadcastActivityEvent({
      id: logResult.rows[0].id,
      user: fingerprintId ? "Unknown Fingerprint" : "Unknown RFID",
      employeeId: rfidUid || fingerprintId || "",
      event: "Access Denied",
      area: "Kiosk",
      device: deviceLabel,
      status: "Failed",
      time: logResult.rows[0].access_time,
    });
    await createNotification(
      "Access Denied",
      `An unrecognized ${method} (${rfidUid || fingerprintId}) attempted access at the Kiosk.`,
      "error",
    );
    return res.status(404).json({
      error: "User not found",
      failedAttempts: accessMetrics.failed_attempts,
      successfulAttempts: accessMetrics.successful_attempts,
      totalAccess: accessMetrics.total_access,
    });
  }

  const user = userResult.rows[0];
  const isExpiredStudent =
    (user.role || "").trim().toLowerCase() === "student" &&
    user.expiration_date &&
    new Date(user.expiration_date) < new Date();
  const result = user.is_active && !isExpiredStudent ? "Granted" : "Denied";

  const logResult = await query(
    `INSERT INTO access_logs (user_id, device_id, authentication_method, result, area)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, access_time`,
    [user.id, deviceId || null, method, result, "Kiosk"],
  );

  let timeType = null;

  if (result === "Granted" && method === "Fingerprint") {
    await ensureAttendanceStatus();
    // Where the user stands today, before this tap changes anything. prev_tap is their previous granted tap today.
    const stateResult = await query(
      `SELECT ar.status, ar.check_in_at, ar.check_out_at,
         (SELECT MAX(access_time) FROM access_logs
           WHERE user_id = $1 AND id <> $2 AND result = 'Granted' AND authentication_method = 'Fingerprint'
             AND (access_time AT TIME ZONE $3)::date = (NOW() AT TIME ZONE $3)::date) AS prev_tap,
         ((SELECT access_time FROM access_logs WHERE id = $2) AT TIME ZONE $3)::time::text AS tap_time,
         (ar.check_in_at AT TIME ZONE $3)::time::text AS check_in_time
       FROM (SELECT 1) one
       LEFT JOIN attendance_records ar
         ON ar.user_id = $1 AND ar.attendance_date = (NOW() AT TIME ZONE $3)::date`,
      [user.id, logResult.rows[0].id, timeZone],
    );
    const state = stateResult.rows[0];
    const tapAt = new Date(logResult.rows[0].access_time);
    const lastTapAt = state.prev_tap || state.check_in_at;
    const minutesSinceLastTap = lastTapAt ? (tapAt - new Date(lastTapAt)) / 60000 : Infinity;

    // in:     first tap of the day, Present or Late by the time of the tap.
    // ignore: within the minimum gap of their previous tap (accidental double tap).
    // revert: already clocked out but still before the end of the working day, so they are back in. Status goes
    //         back to Present or Late by their original clock-in and the clock-out is cleared.
    // out:    otherwise, clock out (or move the clock-out to this later tap).
    let action;
    if (!state.check_in_at) action = "in";
    else if (minutesSinceLastTap < CLOCK_OUT_MIN_GAP_MINUTES) action = "ignore";
    else if (state.status === "Clocked Out" && state.tap_time < WORKDAY_END_TIME) action = "revert";
    else action = "out";

    if (action === "in") {
      await query(
        `INSERT INTO attendance_records
           (user_id, attendance_date, check_in_at, check_out_at, status, location, employee_id, full_name, department, role)
         VALUES ($1, (NOW() AT TIME ZONE $6)::date, $7, NULL,
           (CASE WHEN ${isLateTapSql("$7::timestamptz", "$6")} THEN 'Late' ELSE 'Present' END)::attendance_status,
           'Kiosk', $2, $3, $4, $5)
         ON CONFLICT (user_id, attendance_date)
         DO UPDATE SET check_in_at = EXCLUDED.check_in_at, check_out_at = NULL, status = EXCLUDED.status, updated_at = NOW()`,
        [user.id, user.employee_id, user.full_name, user.department, user.role, timeZone, tapAt],
      );
    } else if (action === "revert") {
      await query(
        `UPDATE attendance_records
         SET check_out_at = NULL,
             status = (CASE WHEN ${isLateTapSql("check_in_at", "$2")} THEN 'Late' ELSE 'Present' END)::attendance_status,
             updated_at = NOW()
         WHERE user_id = $1 AND attendance_date = (NOW() AT TIME ZONE $2)::date`,
        [user.id, timeZone],
      );
    } else if (action === "out") {
      await query(
        `UPDATE attendance_records
         SET check_out_at = $3, status = 'Clocked Out', updated_at = NOW()
         WHERE user_id = $1 AND attendance_date = (NOW() AT TIME ZONE $2)::date`,
        [user.id, timeZone, tapAt],
      );
    }

    timeType = action === "out" || (action === "ignore" && state.check_out_at) ? "out" : "in";

    broadcastMessage({
      type: "attendance:changed",
      payload: { userId: user.id },
    });
  }

  const accessMetrics = await getTodaysAccessMetrics(timeZone);

  const log = {
    id: logResult.rows[0].id,
    userId: user.id,
    employeeId: user.employee_id,
    userName: user.full_name,
    department: user.department,
    role: user.role,
    authenticationMethod: method,
    result,
    timeType,
    accessTime: logResult.rows[0].access_time,
    failedAttempts: accessMetrics.failed_attempts,
    successfulAttempts: accessMetrics.successful_attempts,
    totalAccess: accessMetrics.total_access,
  };

  if (result === "Granted") {
    emitDoorUnlock({
      userId: user.id,
      userName: user.full_name,
      employeeId: user.employee_id,
      authenticationMethod: method,
      area: "Kiosk",
    });
  }

  broadcastMessage({
    type: "dashboard:metrics-changed",
    payload: accessMetrics,
  });
  broadcastMessage({ type: "access-log", payload: log });
  broadcastActivityEvent({
    id: log.id,
    user: log.userName,
    employeeId: log.employeeId,
    event: result === "Granted" ? "Access Granted" : "Access Denied",
    area: "Kiosk",
    device: deviceLabel,
    status: result === "Granted" ? "Success" : "Failed",
    time: log.accessTime,
  });
  await createNotification(
    result === "Granted" ? "Access Granted" : "Access Denied",
    `${user.full_name} (${user.employee_id}) ${result === "Granted" ? "was granted" : "was denied"} access at the Kiosk via ${method}.`,
    result === "Granted" ? "success" : "error",
  );
  res.json(log);
}

kioskRouter.post("/rfid-scan", async (req, res, next) => {
  req.body = {
    rfidUid: req.body.rfidUid,
    authenticationMethod: "RFID",
    deviceId: req.body.deviceId,
  };

  return processKioskScan(req, res, next);
});

kioskRouter.post("/fingerprint-scan", async (req, res, next) => {
  const fingerprintId = String(req.body.fingerprintId || "").trim();

  if (!fingerprintId) {
    return res.status(400).json({ error: "fingerprintId is required" });
  }

  req.body = {
    rfidUid: fingerprintId,
    authenticationMethod: "Fingerprint",
    deviceId: req.body.deviceId,
  };

  return processKioskScan(req, res, next);
});

kioskRouter.post("/admin-rfid-scan", async (req, res, next) => {
  try {
    const rfidUid = req.body.rfidUid?.trim();

    if (!rfidUid) {
      return res.status(400).json({ error: "rfidUid is required" });
    }

    const adminResult = await query(
      `SELECT id, username, email, is_active
       FROM admins
       WHERE rfid_uid = $1
       LIMIT 1`,
      [rfidUid],
    );

    if (adminResult.rowCount === 0 || !adminResult.rows[0].is_active) {
      return res.status(401).json({ error: "Invalid admin RFID" });
    }

    const admin = adminResult.rows[0];

    await query(
      `INSERT INTO audit_logs (admin_id, action, module, details, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        admin.id,
        "Authorize Enrollment",
        "Kiosk",
        "Admin RFID authorized kiosk enrollment",
        req.ip,
      ],
    );
    broadcastActivityEvent({
      user: admin.username,
      event: "Admin RFID Authorized Enrollment",
      area: "Kiosk",
      device: "RFID Reader",
      status: "Success",
    });

    return res.json({
      authorized: true,
      adminName: admin.username,
      email: admin.email,
    });
  } catch (error) {
    return next(error);
  }
});

kioskRouter.post("/enrollment-rfid", async (req, res, next) => {
  const rfidUid = String(req.body.rfidUid || "").trim();

  if (!rfidUid) {
    return res.status(400).json({ error: "rfidUid is required" });
  }

  try {
    const existingRfid = await query(
      `SELECT rfid_uid
       FROM (
         SELECT rfid_uid FROM users WHERE rfid_uid IS NOT NULL
         UNION ALL
         SELECT rfid_uid FROM enrollment_requests WHERE rfid_uid IS NOT NULL AND status = 'Pending'
       ) existing_rfids
       WHERE LOWER(TRIM(rfid_uid)) = LOWER(TRIM($1))
       LIMIT 1`,
      [rfidUid],
    );

    if (existingRfid.rowCount > 0) {
      return res.status(409).json({
        error: "RFID already exists. Tap a new RFID.",
        field: "rfidUid",
      });
    }

    setPendingEnrollmentRfidUid(rfidUid);

    broadcastMessage({
      type: "enrollment:rfid-captured",
      payload: { rfidUid },
    });
    broadcastActivityEvent({
      user: "Pending Enrollment",
      employeeId: rfidUid,
      event: "RFID Captured for Enrollment",
      area: "Kiosk",
      device: "RFID Reader",
      status: "Info",
    });

    return res.json({ rfidUid });
  } catch (error) {
    return next(error);
  }
});

kioskRouter.use(authMiddleware);
kioskRouter.post("/scan", processKioskScan);
