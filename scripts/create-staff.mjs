// สร้างบัญชีพนักงาน หรือตั้งรหัสผ่านใหม่
// ใช้: DATABASE_URL=... node scripts/create-staff.mjs <username> <password> "<ชื่อที่แสดง>"
import crypto from 'node:crypto';
import { makePool } from './_db.mjs';

const [username, password, displayName] = process.argv.slice(2);
if (!username || !password || password.length < 8) {
  console.error('ใช้: node scripts/create-staff.mjs <username> <password อย่างน้อย 8 ตัว> "<ชื่อ>"');
  process.exit(1);
}
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
const stored = `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
const pool = makePool();
await pool.query(
  `INSERT INTO staff_users (username, display_name, password_hash) VALUES ($1,$2,$3)
   ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash,
     display_name = EXCLUDED.display_name, active = true, failed_count = 0, locked_until = NULL`,
  [username.toLowerCase(), displayName || username, stored],
);
console.log(`create-staff: บัญชี ${username} พร้อมใช้งาน`);
await pool.end();
