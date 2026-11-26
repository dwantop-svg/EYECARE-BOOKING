import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { pool } from './db';

export const SESSION_COOKIE = 'ec_staff';
const SESSION_HOURS = 12;

export type Staff = { id: number; username: string; display_name: string };

function secret(): string {
  const s = process.env.SESSION_SECRET || '';
  if (s.length < 32) throw new Error('SESSION_SECRET must be set (at least 32 characters)');
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function makeSessionToken(staffId: number, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ uid: staffId, exp: now + SESSION_HOURS * 3600_000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined, now = Date.now()): number | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof uid !== 'number' || typeof exp !== 'number' || exp < now) return null;
    return uid;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIE !== '1',
    path: '/',
    maxAge: SESSION_HOURS * 3600,
  };
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const hash = Buffer.from(hashB64, 'base64');
  const test = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), hash.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(hash, test);
}

/** ตรวจรหัสผ่าน พร้อมล็อกบัญชี 15 นาทีเมื่อผิดเกิน 5 ครั้ง */
export async function login(username: string, password: string): Promise<{ ok: true; staff: Staff } | { ok: false; message: string }> {
  const u = String(username || '').trim().toLowerCase();
  const r = await pool().query('SELECT id, username, display_name, password_hash, active, failed_count, locked_until FROM staff_users WHERE username = $1', [u]);
  const row = r.rows[0];
  const generic = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
  if (!row || !row.active) {
    verifyPassword(String(password), 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64'));
    return { ok: false, message: generic };
  }
  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    return { ok: false, message: 'บัญชีถูกล็อกชั่วคราวเพราะใส่รหัสผิดหลายครั้ง กรุณารอ 15 นาที' };
  }
  if (!verifyPassword(String(password), row.password_hash)) {
    await pool().query(
      `UPDATE staff_users SET failed_count = failed_count + 1,
         locked_until = CASE WHEN failed_count + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END
       WHERE id = $1`,
      [row.id],
    );
    return { ok: false, message: generic };
  }
  await pool().query('UPDATE staff_users SET failed_count = 0, locked_until = NULL WHERE id = $1', [row.id]);
  return { ok: true, staff: { id: row.id, username: row.username, display_name: row.display_name } };
}

async function staffById(id: number | null): Promise<Staff | null> {
  if (!id) return null;
  const r = await pool().query('SELECT id, username, display_name FROM staff_users WHERE id = $1 AND active', [id]);
  return r.rows[0] || null;
}

/** ใช้ในหน้าเว็บของพนักงาน: ไม่ได้ล็อกอิน → ไปหน้าเข้าสู่ระบบ */
export async function requireStaffPage(): Promise<Staff> {
  const jar = await cookies();
  const staff = await staffById(readSessionToken(jar.get(SESSION_COOKIE)?.value));
  if (!staff) redirect('/staff/login');
  return staff;
}

/** ใช้ใน API ของพนักงาน: คืน null ถ้าไม่ได้ล็อกอิน หรือคำขอมาจากเว็บอื่น (กัน CSRF) */
export async function staffFromRequest(req: Request): Promise<Staff | null> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.get('origin');
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host');
    if (!origin || !host || new URL(origin).host !== host) return null;
  }
  const jar = await cookies();
  return staffById(readSessionToken(jar.get(SESSION_COOKIE)?.value));
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export const MIN_PASSWORD_LENGTH = 8;

// เปลี่ยนรหัสผ่านของพนักงานที่ล็อกอินอยู่ ต้องยืนยันรหัสเดิมก่อนเสมอ
export async function changePassword(
  staffId: number,
  current: string,
  next: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (typeof current !== 'string' || typeof next !== 'string') return { ok: false, message: 'ข้อมูลไม่ถูกต้อง' };
  if (next.length < MIN_PASSWORD_LENGTH) return { ok: false, message: `รหัสผ่านใหม่ต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร` };
  if (next.length > 128) return { ok: false, message: 'รหัสผ่านใหม่ยาวเกินไป' };
  if (next === current) return { ok: false, message: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม' };
  const { rows } = await pool().query<{ password_hash: string }>(
    'SELECT password_hash FROM staff_users WHERE id = $1 AND active',
    [staffId],
  );
  if (!rows[0] || !verifyPassword(current, rows[0].password_hash)) return { ok: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' };
  await pool().query('UPDATE staff_users SET password_hash = $1, failed_count = 0, locked_until = NULL WHERE id = $2', [hashPassword(next), staffId]);
  return { ok: true };
}
