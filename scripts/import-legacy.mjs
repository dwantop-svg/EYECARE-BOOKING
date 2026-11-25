// นำเข้าสำเนาข้อมูลลูกค้าเดิมจากไฟล์ JSON (ส่งออกจากหน้า "ทะเบียนลูกค้าร้านแว่น")
// ใช้: DATABASE_URL=... node scripts/import-legacy.mjs data/legacy-customers.json
// แถวที่มีอยู่แล้วจะถูกข้าม (ON CONFLICT DO NOTHING) — ไม่แก้ ไม่ลบข้อมูลเดิม
import fs from 'node:fs';
import { makePool } from './_db.mjs';

const file = process.argv[2] || 'data/legacy-customers.json';
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
// ลำดับคอลัมน์ในแหล่งเดิม: id, fn, ln, g, ph, type, pts, tags, dob, addr, idc, email, line, comp, note
// นำเข้าเฉพาะช่องที่จำเป็น (ไม่นำเข้า ที่อยู่ / เลขบัตร ปชช. / อีเมล / Line / บริษัท)
const pool = makePool();
const client = await pool.connect();
let inserted = 0;
try {
  await client.query('BEGIN');
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const vals = [];
    const params = [];
    chunk.forEach((r, j) => {
      const b = params.length;
      vals.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`);
      params.push(
        i + j + 1, r[0], r[1] || '', r[2] || '', r[3] || '',
        String(r[4] || '').replace(/\D/g, ''), r[5] || '', Number(r[6]) || 0, r[7] || '', r[14] || '',
      );
    });
    const res = await client.query(
      `INSERT INTO customers (legacy_row, customer_code, first_name, last_name, gender, phone, member_type, points, history, check_note)
       VALUES ${vals.join(',')} ON CONFLICT (legacy_row) DO NOTHING`,
      params,
    );
    inserted += res.rowCount;
  }
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}
const { rows: [c] } = await pool.query('SELECT count(*)::int AS n FROM customers');
console.log(`import-legacy: เพิ่มใหม่ ${inserted} แถว, ในฐานข้อมูลทั้งหมด ${c.n} แถว (ไฟล์ต้นทาง ${rows.length} แถว)`);
await pool.end();
