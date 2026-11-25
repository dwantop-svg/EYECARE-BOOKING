import type { PoolClient } from 'pg';
import { pool, tx, type Queryable } from './db';
import { addDays, bkkNow, diffDays, fromMin, isDateStr, isTimeStr, toMin, weekdayOf } from './time';
import { isValidPhone, normalizePhone } from './phone';

export const PDPA_VERSION = '2026-11-v1';

export const STATUSES = ['pending', 'confirmed', 'arrived', 'no_show', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_TH: Record<Status, string> = {
  pending: 'รอยืนยัน',
  confirmed: 'ยืนยันแล้ว',
  arrived: 'มาแล้ว',
  no_show: 'ไม่มา',
  cancelled: 'ยกเลิก',
};
export const MATCH_TH: Record<string, string> = {
  matched: 'ลูกค้าเดิม',
  multiple: 'เบอร์ตรงหลายคน (เลือกลูกค้า)',
  new_pending: 'ลูกค้าใหม่ (รอยืนยัน)',
  new_confirmed: 'ลูกค้าใหม่ (ยืนยันแล้ว)',
};

export class BookingError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export type Settings = {
  slot_minutes: number;
  max_per_slot: number;
  booking_window_days: number;
  min_lead_minutes: number;
  shop_name: string;
  shop_phone: string;
};
export type WeeklyHour = { weekday: number; is_open: boolean; open_time: string; close_time: string };
export type Service = { code: string; name_th: string; sort_order: number; active: boolean };
export type Holiday = { holiday_date: string; note: string };

export type Config = {
  settings: Settings;
  weekly: WeeklyHour[];
  holidays: Map<string, string>;
  services: Service[];
};

export async function loadConfig(q: Queryable = pool()): Promise<Config> {
  const [s, w, h, sv] = await Promise.all([
    q.query('SELECT slot_minutes, max_per_slot, booking_window_days, min_lead_minutes, shop_name, shop_phone FROM booking_settings WHERE id = 1'),
    q.query("SELECT weekday, is_open, to_char(open_time,'HH24:MI') open_time, to_char(close_time,'HH24:MI') close_time FROM booking_weekly_hours ORDER BY weekday"),
    q.query('SELECT holiday_date, note FROM booking_holidays WHERE holiday_date >= CURRENT_DATE - 1 ORDER BY holiday_date'),
    q.query('SELECT code, name_th, sort_order, active FROM booking_services ORDER BY sort_order, code'),
  ]);
  return {
    settings: s.rows[0],
    weekly: w.rows,
    holidays: new Map(h.rows.map((r) => [r.holiday_date, r.note])),
    services: sv.rows,
  };
}

export type DayState = 'open' | 'closed' | 'holiday' | 'past' | 'beyond';

export function dayState(cfg: Config, date: string, now: Date = new Date()): { state: DayState; note?: string } {
  const today = bkkNow(now).date;
  const d = diffDays(today, date);
  if (d < 0) return { state: 'past' };
  if (d > cfg.settings.booking_window_days) return { state: 'beyond' };
  if (cfg.holidays.has(date)) return { state: 'holiday', note: cfg.holidays.get(date) };
  const wh = cfg.weekly.find((x) => x.weekday === weekdayOf(date));
  if (!wh || !wh.is_open) return { state: 'closed' };
  return { state: 'open' };
}

/** ช่องเวลาตามเวลาเปิด-ปิดของวันนั้น (ไม่สนใจจำนวนคิว) */
export function slotGrid(cfg: Config, date: string): number[] {
  const wh = cfg.weekly.find((x) => x.weekday === weekdayOf(date));
  if (!wh || !wh.is_open) return [];
  const step = cfg.settings.slot_minutes;
  const open = toMin(wh.open_time);
  const close = toMin(wh.close_time);
  const out: number[] = [];
  for (let m = open; m + step <= close; m += step) out.push(m);
  return out;
}

export type Slot = { time: string; booked: number; remaining: number; available: boolean; reason?: 'past' | 'full' };

async function bookedCounts(q: Queryable, from: string, to: string): Promise<Map<string, number[]>> {
  // คืน map วันที่ -> รายการนาทีเริ่มต้นของคิวที่ยังนับ (ไม่รวมยกเลิก)
  const r = await q.query(
    `SELECT appt_date, to_char(start_time,'HH24:MI') t FROM appointments
     WHERE appt_date BETWEEN $1 AND $2 AND status <> 'cancelled'`,
    [from, to],
  );
  const m = new Map<string, number[]>();
  for (const row of r.rows) {
    const arr = m.get(row.appt_date) || [];
    arr.push(toMin(row.t));
    m.set(row.appt_date, arr);
  }
  return m;
}

function countInSlot(starts: number[] | undefined, slotStart: number, len: number): number {
  if (!starts) return 0;
  let n = 0;
  for (const s of starts) if (s >= slotStart && s < slotStart + len) n++;
  return n;
}

function isPastSlot(cfg: Config, date: string, startMin: number, now: Date): boolean {
  const n = bkkNow(now);
  const d = diffDays(n.date, date);
  if (d < 0) return true;
  const absSlot = d * 1440 + startMin;
  return absSlot <= n.minutes + cfg.settings.min_lead_minutes;
}

export function buildSlots(cfg: Config, date: string, starts: number[] | undefined, now: Date): Slot[] {
  const len = cfg.settings.slot_minutes;
  return slotGrid(cfg, date).map((m) => {
    const booked = countInSlot(starts, m, len);
    const remaining = Math.max(0, cfg.settings.max_per_slot - booked);
    const past = isPastSlot(cfg, date, m, now);
    return {
      time: fromMin(m),
      booked,
      remaining,
      available: !past && remaining > 0,
      reason: past ? 'past' : remaining <= 0 ? 'full' : undefined,
    };
  });
}

export async function getDaySlots(date: string, now: Date = new Date()) {
  if (!isDateStr(date)) throw new BookingError('bad_date', 'วันที่ไม่ถูกต้อง');
  const cfg = await loadConfig();
  const ds = dayState(cfg, date, now);
  if (ds.state !== 'open') return { date, ...ds, slots: [] as Slot[] };
  const counts = await bookedCounts(pool(), date, date);
  return { date, ...ds, slots: buildSlots(cfg, date, counts.get(date), now) };
}

/** รายการวันที่จองได้ (ตั้งแต่วันนี้ถึงสิ้นสุดช่วงเปิดจอง) พร้อมจำนวนช่องว่าง */
export async function getBookableDays(now: Date = new Date()) {
  const cfg = await loadConfig();
  const today = bkkNow(now).date;
  const last = addDays(today, cfg.settings.booking_window_days);
  const counts = await bookedCounts(pool(), today, last);
  const days = [];
  for (let d = today; d <= last; d = addDays(d, 1)) {
    const ds = dayState(cfg, d, now);
    const slots = ds.state === 'open' ? buildSlots(cfg, d, counts.get(d), now) : [];
    days.push({ date: d, state: ds.state, note: ds.note, available: slots.filter((s) => s.available).length });
  }
  return { days, services: cfg.services.filter((s) => s.active), settings: { slot_minutes: cfg.settings.slot_minutes, shop_name: cfg.settings.shop_name, shop_phone: cfg.settings.shop_phone } };
}

// ───────────────────────── จับคู่ลูกค้าเดิม ─────────────────────────

export async function matchCustomer(q: Queryable, phone: string): Promise<{ match_status: 'matched' | 'multiple' | 'new_pending'; customer_row: number | null; candidates: number[] }> {
  const r = await q.query('SELECT legacy_row FROM customers WHERE phone = $1 ORDER BY legacy_row', [phone]);
  const rows = r.rows.map((x) => x.legacy_row as number);
  if (rows.length === 1) return { match_status: 'matched', customer_row: rows[0], candidates: rows };
  if (rows.length > 1) return { match_status: 'multiple', customer_row: null, candidates: rows };
  return { match_status: 'new_pending', customer_row: null, candidates: [] };
}

// ───────────────────────── สร้างคิว ─────────────────────────

export type BookingInput = {
  service_code: unknown;
  date: unknown;
  time: unknown;
  full_name: unknown;
  phone: unknown;
  note?: unknown;
  pdpa_consent: unknown;
};

export type CreatedAppointment = {
  id: number;
  ref_token: string;
  queue_no: string;
  appt_date: string;
  start_time: string;
  service_name: string;
  match_status: string;
  customer_row: number | null;
};

export function queueNo(date: string, seq: number): string {
  return `${date.slice(8, 10)}${date.slice(5, 7)}-${String(seq).padStart(3, '0')}`;
}

function cleanText(v: unknown, max: number): string {
  return String(v ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

/** ตรวจว่าเวลานี้จองได้ (ใช้ทั้งตอนสร้างคิว และตอนกู้คิวที่ยกเลิกกลับมา) — ต้องเรียกภายใต้ lock ของวันนั้น */
async function assertSlotBookable(c: PoolClient, cfg: Config, date: string, startMin: number, now: Date, excludeId?: number) {
  const ds = dayState(cfg, date, now);
  if (ds.state === 'past') throw new BookingError('past', 'ไม่สามารถจองย้อนหลังได้');
  if (ds.state === 'beyond') throw new BookingError('beyond', `จองล่วงหน้าได้ไม่เกิน ${cfg.settings.booking_window_days} วัน`);
  if (ds.state === 'holiday') throw new BookingError('holiday', `วันนี้ร้านหยุด${ds.note ? ` (${ds.note})` : ''}`);
  if (ds.state === 'closed') throw new BookingError('closed', 'วันนี้เป็นวันหยุดประจำสัปดาห์ของร้าน');
  const grid = slotGrid(cfg, date);
  if (!grid.includes(startMin)) throw new BookingError('bad_slot', 'ช่วงเวลานี้ไม่อยู่ในเวลาเปิดให้จอง');
  if (isPastSlot(cfg, date, startMin, now)) throw new BookingError('past', 'ช่วงเวลานี้ผ่านไปแล้ว กรุณาเลือกเวลาใหม่');
  const len = cfg.settings.slot_minutes;
  const r = await c.query(
    `SELECT count(*)::int n FROM appointments
     WHERE appt_date = $1 AND status <> 'cancelled'
       AND start_time >= $2::time AND start_time < $3::time AND ($4::bigint IS NULL OR id <> $4)`,
    [date, fromMin(startMin), fromMin(Math.min(startMin + len, 1439)), excludeId ?? null],
  );
  if (r.rows[0].n >= cfg.settings.max_per_slot) throw new BookingError('full', 'ช่วงเวลานี้เต็มแล้ว กรุณาเลือกเวลาอื่น', 409);
}

async function lockDate(c: PoolClient, date: string) {
  await c.query("SELECT pg_advisory_xact_lock(hashtext('ec-booking:' || $1))", [date]);
}

export async function createAppointment(
  input: BookingInput,
  opts: { source: 'online' | 'staff'; staffId?: number; now?: Date },
): Promise<CreatedAppointment> {
  const now = opts.now ?? new Date();
  const service_code = cleanText(input.service_code, 40);
  const date = input.date;
  const time = input.time;
  const full_name = cleanText(input.full_name, 100).replace(/\s+/g, ' ');
  const phone = normalizePhone(input.phone);
  const note = cleanText(input.note, 500);

  if (!isDateStr(date)) throw new BookingError('bad_date', 'กรุณาเลือกวันที่');
  if (!isTimeStr(time)) throw new BookingError('bad_time', 'กรุณาเลือกช่วงเวลา');
  if (full_name.length < 2) throw new BookingError('bad_name', 'กรุณากรอกชื่อ-นามสกุล');
  if (!isValidPhone(phone)) throw new BookingError('bad_phone', 'เบอร์โทรไม่ถูกต้อง (ตัวอย่าง 081-234-5678)');
  if (input.pdpa_consent !== true) throw new BookingError('no_consent', 'กรุณาติ๊กยินยอมให้เก็บข้อมูลส่วนบุคคล (PDPA) ก่อนยืนยัน');

  return tx(async (c) => {
    await lockDate(c, date);
    const cfg = await loadConfig(c);
    const svc = cfg.services.find((s) => s.code === service_code && s.active);
    if (!svc) throw new BookingError('bad_service', 'กรุณาเลือกบริการ');
    const startMin = toMin(time);
    await assertSlotBookable(c, cfg, date, startMin, now);

    // กันจองซ้ำ: เบอร์เดียวกันจองช่วงเวลาเดียวกัน
    const dup = await c.query(
      `SELECT 1 FROM appointments WHERE phone = $1 AND appt_date = $2 AND start_time = $3::time AND status <> 'cancelled'`,
      [phone, date, time],
    );
    if (dup.rowCount) throw new BookingError('duplicate', 'เบอร์นี้จองช่วงเวลานี้ไว้แล้ว', 409);
    if (opts.source === 'online') {
      const active = await c.query(
        `SELECT count(*)::int n FROM appointments WHERE phone = $1 AND status IN ('pending','confirmed') AND appt_date >= $2`,
        [phone, bkkNow(now).date],
      );
      if (active.rows[0].n >= 3) throw new BookingError('too_many', 'เบอร์นี้มีคิวที่ยังไม่ถึงเวลา 3 คิวแล้ว หากต้องการเพิ่มกรุณาโทรหาร้าน', 429);
    }

    const m = await matchCustomer(c, phone);
    const seq = await c.query(
      `INSERT INTO booking_daily_counter (appt_date, last_seq) VALUES ($1, 1)
       ON CONFLICT (appt_date) DO UPDATE SET last_seq = booking_daily_counter.last_seq + 1
       RETURNING last_seq`,
      [date],
    );
    const queue_seq = seq.rows[0].last_seq as number;
    const ins = await c.query(
      `INSERT INTO appointments (queue_seq, appt_date, start_time, slot_minutes, service_code, full_name, phone, note,
         status, customer_row, match_status, source, pdpa_consent_at, pdpa_version, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id, ref_token`,
      [
        queue_seq, date, time, cfg.settings.slot_minutes, svc.code, full_name, phone, note,
        opts.source === 'staff' ? 'confirmed' : 'pending',
        m.customer_row, m.match_status, opts.source, now.toISOString(), PDPA_VERSION, opts.staffId ?? null,
      ],
    );
    await c.query(
      `INSERT INTO appointment_log (appointment_id, action, to_value, staff_id) VALUES ($1,'create',$2,$3)`,
      [ins.rows[0].id, `${opts.source}:${m.match_status}`, opts.staffId ?? null],
    );
    return {
      id: Number(ins.rows[0].id),
      ref_token: ins.rows[0].ref_token,
      queue_no: queueNo(date, queue_seq),
      appt_date: date,
      start_time: fromMin(startMin),
      service_name: svc.name_th,
      match_status: m.match_status,
      customer_row: m.customer_row,
    };
  });
}

// ───────────────────────── อ่านคิว ─────────────────────────

const APPT_SELECT = `
  SELECT a.id, a.ref_token, a.queue_seq, a.appt_date, to_char(a.start_time,'HH24:MI') start_time, a.slot_minutes,
         a.service_code, s.name_th service_name, a.full_name, a.phone, a.note, a.status,
         a.customer_row, a.match_status, a.source, a.created_at,
         c.customer_code, c.first_name c_first_name, c.last_name c_last_name, c.member_type c_member_type
  FROM appointments a
  JOIN booking_services s ON s.code = a.service_code
  LEFT JOIN customers c ON c.legacy_row = a.customer_row`;

export type ApptRow = Awaited<ReturnType<typeof listAppointments>>[number];

export async function listAppointments(from: string, to: string) {
  if (!isDateStr(from) || !isDateStr(to)) throw new BookingError('bad_date', 'วันที่ไม่ถูกต้อง');
  if (diffDays(from, to) > 62 || diffDays(from, to) < 0) throw new BookingError('bad_range', 'ช่วงวันที่ไม่ถูกต้อง');
  const r = await pool().query(`${APPT_SELECT} WHERE a.appt_date BETWEEN $1 AND $2 ORDER BY a.appt_date, a.start_time, a.queue_seq`, [from, to]);
  return r.rows.map((x) => ({ ...x, id: Number(x.id), queue_no: queueNo(x.appt_date, x.queue_seq) }));
}

export async function getAppointmentByToken(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const r = await pool().query(`${APPT_SELECT} WHERE a.ref_token = $1`, [token]);
  if (!r.rows[0]) return null;
  const x = r.rows[0];
  return { ...x, id: Number(x.id), queue_no: queueNo(x.appt_date, x.queue_seq) };
}

// ───────────────────────── พนักงานจัดการคิว ─────────────────────────

export async function updateStatus(id: number, status: string, staffId: number, now: Date = new Date()) {
  if (!(STATUSES as readonly string[]).includes(status)) throw new BookingError('bad_status', 'สถานะไม่ถูกต้อง');
  return tx(async (c) => {
    const cur = await c.query('SELECT appt_date, to_char(start_time,\'HH24:MI\') t, status FROM appointments WHERE id = $1', [id]);
    if (!cur.rows[0]) throw new BookingError('not_found', 'ไม่พบคิวนี้', 404);
    const { appt_date, t, status: from } = cur.rows[0];
    if (from === status) return { status };
    await lockDate(c, appt_date);
    if (from === 'cancelled') {
      // กู้คิวที่ยกเลิกกลับมา ต้องไม่ทำให้ช่วงเวลาเกินจำนวนที่ตั้งไว้ และต้องไม่ใช่เวลาที่ผ่านไปแล้ว (ยกเว้นบันทึกย้อนหลังว่า มาแล้ว/ไม่มา)
      const cfg = await loadConfig(c);
      if (status === 'pending' || status === 'confirmed') {
        await assertSlotBookable(c, cfg, appt_date, toMin(t), now, id);
      } else {
        const r = await c.query(
          `SELECT count(*)::int n FROM appointments WHERE appt_date=$1 AND start_time=$2::time AND status<>'cancelled' AND id<>$3`,
          [appt_date, t, id],
        );
        if (r.rows[0].n >= cfg.settings.max_per_slot) throw new BookingError('full', 'ช่วงเวลานี้เต็มแล้ว', 409);
      }
    }
    await c.query('UPDATE appointments SET status = $1, updated_at = now() WHERE id = $2', [status, id]);
    await c.query(
      `INSERT INTO appointment_log (appointment_id, action, from_value, to_value, staff_id) VALUES ($1,'status',$2,$3,$4)`,
      [id, from, status, staffId],
    );
    return { status };
  });
}

/** ผูกคิวกับลูกค้าเดิม (customer_row) หรือยืนยันว่าเป็นลูกค้าใหม่ (customer_row = null) — ไม่สร้างลูกค้าใหม่ในตาราง customers */
export async function setCustomerLink(id: number, customerRow: number | null, staffId: number) {
  return tx(async (c) => {
    const cur = await c.query('SELECT customer_row, match_status FROM appointments WHERE id = $1 FOR UPDATE', [id]);
    if (!cur.rows[0]) throw new BookingError('not_found', 'ไม่พบคิวนี้', 404);
    if (customerRow !== null) {
      const ex = await c.query('SELECT 1 FROM customers WHERE legacy_row = $1', [customerRow]);
      if (!ex.rowCount) throw new BookingError('no_customer', 'ไม่พบลูกค้ารายนี้', 404);
    }
    const next = customerRow === null ? 'new_confirmed' : 'matched';
    await c.query('UPDATE appointments SET customer_row = $1, match_status = $2, updated_at = now() WHERE id = $3', [customerRow, next, id]);
    await c.query(
      `INSERT INTO appointment_log (appointment_id, action, from_value, to_value, staff_id) VALUES ($1,'link',$2,$3,$4)`,
      [id, `${cur.rows[0].match_status}:${cur.rows[0].customer_row ?? ''}`, `${next}:${customerRow ?? ''}`, staffId],
    );
    return { match_status: next, customer_row: customerRow };
  });
}

export async function searchCustomers(qRaw: string, limit = 20) {
  const q = qRaw.trim();
  if (q.length < 2) return [];
  const digits = q.replace(/[\s-]/g, '');
  const r = await pool().query(
    `SELECT legacy_row, customer_code, first_name, last_name, phone, member_type, points
     FROM customers
     WHERE ($1 ~ '^[0-9]+$' AND phone LIKE '%' || $1 || '%')
        OR customer_code ILIKE $2
        OR (first_name || ' ' || last_name) ILIKE '%' || $3 || '%'
     ORDER BY legacy_row LIMIT $4`,
    [digits, q.toUpperCase(), q, limit],
  );
  return r.rows;
}

export async function getCustomer(row: number) {
  const c = await pool().query('SELECT * FROM customers WHERE legacy_row = $1', [row]);
  if (!c.rows[0]) return null;
  const a = await pool().query(`${APPT_SELECT} WHERE a.customer_row = $1 ORDER BY a.appt_date DESC, a.start_time DESC`, [row]);
  return { customer: c.rows[0], appointments: a.rows.map((x) => ({ ...x, id: Number(x.id), queue_no: queueNo(x.appt_date, x.queue_seq) })) };
}

export async function getCustomersByRows(rows: number[]) {
  if (!rows.length) return [];
  const r = await pool().query(
    'SELECT legacy_row, customer_code, first_name, last_name, phone, member_type, points FROM customers WHERE legacy_row = ANY($1) ORDER BY legacy_row',
    [rows],
  );
  return r.rows;
}

// ───────────────────────── ตั้งค่า ─────────────────────────

export type SettingsInput = {
  slot_minutes: number;
  max_per_slot: number;
  booking_window_days: number;
  min_lead_minutes: number;
  shop_phone: string;
  weekly: WeeklyHour[];
  services: { code: string; active: boolean }[];
};

function intIn(v: unknown, lo: number, hi: number, label: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new BookingError('bad_setting', `${label} ต้องอยู่ระหว่าง ${lo}–${hi}`);
  return n;
}

export async function saveSettings(input: SettingsInput) {
  const slot = intIn(input.slot_minutes, 5, 240, 'ความยาวช่องเวลา (นาที)');
  const max = intIn(input.max_per_slot, 1, 50, 'จำนวนคิวสูงสุดต่อช่วง');
  const win = intIn(input.booking_window_days, 1, 365, 'จองล่วงหน้าได้ (วัน)');
  const lead = intIn(input.min_lead_minutes, 0, 2880, 'ต้องจองก่อนเวลาอย่างน้อย (นาที)');
  const phone = cleanText(input.shop_phone, 30);
  if (!Array.isArray(input.weekly) || input.weekly.length !== 7) throw new BookingError('bad_setting', 'ข้อมูลเวลาเปิด-ปิดไม่ครบ 7 วัน');
  for (const w of input.weekly) {
    intIn(w.weekday, 0, 6, 'วัน');
    if (!isTimeStr(w.open_time) || !isTimeStr(w.close_time)) throw new BookingError('bad_setting', 'รูปแบบเวลาไม่ถูกต้อง');
    if (w.is_open && toMin(w.close_time) - toMin(w.open_time) < slot)
      throw new BookingError('bad_setting', 'เวลาปิดต้องหลังเวลาเปิดอย่างน้อย 1 ช่วงเวลา');
    if (toMin(w.close_time) <= toMin(w.open_time)) throw new BookingError('bad_setting', 'เวลาปิดต้องหลังเวลาเปิด');
  }
  await tx(async (c) => {
    await c.query(
      `UPDATE booking_settings SET slot_minutes=$1, max_per_slot=$2, booking_window_days=$3, min_lead_minutes=$4, shop_phone=$5, updated_at=now() WHERE id=1`,
      [slot, max, win, lead, phone],
    );
    for (const w of input.weekly) {
      await c.query('UPDATE booking_weekly_hours SET is_open=$1, open_time=$2, close_time=$3 WHERE weekday=$4', [!!w.is_open, w.open_time, w.close_time, w.weekday]);
    }
    for (const s of input.services || []) {
      await c.query('UPDATE booking_services SET active=$1 WHERE code=$2', [!!s.active, String(s.code)]);
    }
    const act = await c.query('SELECT count(*)::int n FROM booking_services WHERE active');
    if (act.rows[0].n === 0) throw new BookingError('bad_setting', 'ต้องเปิดอย่างน้อย 1 บริการ');
  });
}

export async function addHoliday(date: string, note: string) {
  if (!isDateStr(date)) throw new BookingError('bad_date', 'วันที่ไม่ถูกต้อง');
  await pool().query(
    'INSERT INTO booking_holidays (holiday_date, note) VALUES ($1,$2) ON CONFLICT (holiday_date) DO UPDATE SET note = EXCLUDED.note',
    [date, cleanText(note, 100)],
  );
  const r = await pool().query(
    `SELECT count(*)::int n FROM appointments WHERE appt_date = $1 AND status IN ('pending','confirmed')`,
    [date],
  );
  return { affected: r.rows[0].n as number };
}

export async function removeHoliday(date: string) {
  if (!isDateStr(date)) throw new BookingError('bad_date', 'วันที่ไม่ถูกต้อง');
  await pool().query('DELETE FROM booking_holidays WHERE holiday_date = $1', [date]);
}

export async function listHolidays() {
  const r = await pool().query('SELECT holiday_date, note FROM booking_holidays WHERE holiday_date >= CURRENT_DATE - 30 ORDER BY holiday_date');
  return r.rows as Holiday[];
}
