// สร้างตารางของระบบจองคิว (รันซ้ำได้ ไม่ลบข้อมูล)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePool } from './_db.mjs';
const sql = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../db/schema.sql'), 'utf8');
const pool = makePool();
await pool.query(sql);
console.log('migrate: เสร็จ');
await pool.end();
