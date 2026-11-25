# ระบบจองคิว Eyecare Optic ลำปาง

## ภาษาและเฟรมเวิร์ก
- **TypeScript** บน **Node.js 20 ขึ้นไป** (ทดสอบแล้วกับ Node 22)
- **Next.js 15** (App Router) + **React 19**: หน้าเว็บและ API อยู่ในโปรเจกต์เดียว
- **PostgreSQL 14 ขึ้นไป** ต่อผ่านไลบรารี `pg` (ใช้ Neon หรือ Vercel Postgres ได้)
- `qrcode` สร้าง QR Code, `vitest` และ Playwright ใช้ทดสอบ

## โครงสร้าง
| โฟลเดอร์ / ไฟล์ | เนื้อหา |
|---|---|
| `app/book/` | หน้าจองคิวของลูกค้า (ไม่ต้องล็อกอิน) |
| `app/staff/` | หน้าพนักงาน: คิวนัดหมาย, ค้นหาลูกค้า, ตั้งค่า, ลิงก์ & QR (ต้องล็อกอิน) |
| `app/api/` | API ฝั่งลูกค้า (`public/`) และฝั่งพนักงาน (`staff/`) |
| `lib/booking.ts` | ตรรกะหลัก: ช่องเวลา, จำนวนคิว, กันจองย้อนหลัง, จับคู่เบอร์ลูกค้า |
| `db/schema.sql` | โครงสร้างฐานข้อมูลทั้งหมด (รันซ้ำได้ ไม่ลบข้อมูล) |
| `scripts/` | สร้างตาราง, นำเข้าลูกค้า, สร้างบัญชีพนักงาน |
| `sample/fake-customers.json` | ข้อมูลลูกค้าปลอม 5 แถวสำหรับทดลอง |
| `tests/` | ชุดทดสอบตรรกะ (28 ข้อ) และทดสอบผ่านเบราว์เซอร์ (23 ข้อ) |

## วิธีรัน
1. ติดตั้งแพ็กเกจ
   ```bash
   npm install
   ```
2. สร้างไฟล์ `.env.local` จาก `.env.example` แล้วใส่ค่า:
   - `DATABASE_URL`: ที่อยู่ฐานข้อมูล
   - `SESSION_SECRET`: สุ่มยาวอย่างน้อย 32 ตัว
   - `PUBLIC_BASE_URL`: โดเมนเว็บจริง
   ```bash
   cp .env.example .env.local
   ```
3. สร้างตาราง
   ```bash
   DATABASE_URL=postgres://... npm run db:migrate
   ```
4. นำเข้าลูกค้าตัวอย่าง (ใช้จริงให้เปลี่ยนเป็นไฟล์ข้อมูลลูกค้าของร้าน รูปแบบเดียวกัน)
   ```bash
   DATABASE_URL=postgres://... node scripts/import-legacy.mjs sample/fake-customers.json
   ```
5. สร้างบัญชีพนักงาน
   ```bash
   DATABASE_URL=postgres://... node scripts/create-staff.mjs admin 'รหัสผ่านอย่างน้อย8ตัว' 'ชื่อพนักงาน'
   ```
6. รันโหมดพัฒนา แล้วเปิด http://localhost:3000/book (ลูกค้า) และ http://localhost:3000/staff (พนักงาน)
   ```bash
   npm run dev
   ```
   ใช้งานจริงให้รัน
   ```bash
   npm run build && npm start
   ```

## ทดสอบ
ชุดทดสอบตรรกะต้องใช้ฐานข้อมูลที่ชื่อลงท้ายด้วย `_test` และนำเข้า `sample/fake-customers.json` ไว้แล้ว
```bash
TEST_DATABASE_URL=postgres://.../eyecare_test npm test
```
ชุดทดสอบผ่านเบราว์เซอร์ต้องเปิดเซิร์ฟเวอร์ไว้ก่อน และต้องติดตั้ง Playwright
```bash
STAFF_USER=admin STAFF_PASS='...' npm run test:e2e
```

## หมายเหตุ
- ตาราง `customers` คือสำเนาข้อมูลลูกค้าเดิม ฐานข้อมูลบล็อกการแก้ไขและการลบไว้ การจองคิวเก็บลงตารางใหม่เท่านั้น
- ไฟล์ `.env*` และไฟล์ข้อมูลลูกค้าจริงต้องไม่ถูก commit (กันไว้ใน `.gitignore` แล้ว)
