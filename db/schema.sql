-- Eyecare Optic ลำปาง — ระบบจองคิว
-- รันซ้ำได้ (idempotent): ใช้ IF NOT EXISTS / ON CONFLICT DO NOTHING ทั้งหมด
-- ไม่มีคำสั่ง DROP / DELETE / UPDATE ต่อข้อมูลลูกค้า

-- ─────────────────────────────────────────────────────────────
-- 1) ข้อมูลลูกค้าเดิม (สำเนาจาก "ทะเบียนลูกค้าร้านแว่น") — อ่านอย่างเดียว
--    นำเข้าครั้งเดียวด้วย scripts/import-legacy.mjs
--    เก็บเฉพาะช่องที่ระบบจองคิวต้องใช้ ไม่นำเข้าเลขบัตรประชาชน/ที่อยู่/อีเมล/Line (หลัก PDPA: เก็บเท่าที่จำเป็น)
--    รหัสลูกค้าในข้อมูลเดิมซ้ำกันได้ (คนละคน) จึงใช้ legacy_row (ลำดับแถวในแหล่งเดิม) เป็นคีย์หลัก
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  legacy_row     integer PRIMARY KEY,
  customer_code  text NOT NULL,
  first_name     text NOT NULL DEFAULT '',
  last_name      text NOT NULL DEFAULT '',
  gender         text NOT NULL DEFAULT '',
  phone          text NOT NULL DEFAULT '',
  member_type    text NOT NULL DEFAULT '',
  points         integer NOT NULL DEFAULT 0,
  history        text NOT NULL DEFAULT '',
  check_note     text NOT NULL DEFAULT '',
  imported_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers (phone);
CREATE INDEX IF NOT EXISTS customers_code_idx  ON customers (customer_code);

-- ป้องกันการแก้/ลบข้อมูลลูกค้าเดิมที่ระดับฐานข้อมูล (เพิ่มแถวใหม่ได้เฉพาะตอนนำเข้า)
CREATE OR REPLACE FUNCTION customers_readonly() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'customers เป็นข้อมูลลูกค้าเดิม ห้ามแก้ไขหรือลบ (%)', TG_OP;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS customers_no_update ON customers;
CREATE TRIGGER customers_no_update BEFORE UPDATE OR DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION customers_readonly();
DROP TRIGGER IF EXISTS customers_no_truncate ON customers;
CREATE TRIGGER customers_no_truncate BEFORE TRUNCATE ON customers
  FOR EACH STATEMENT EXECUTE FUNCTION customers_readonly();

-- ─────────────────────────────────────────────────────────────
-- 2) ตารางใหม่ของระบบจองคิว
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking_settings (
  id                   smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  slot_minutes         integer NOT NULL DEFAULT 30  CHECK (slot_minutes BETWEEN 5 AND 240),
  max_per_slot         integer NOT NULL DEFAULT 2   CHECK (max_per_slot BETWEEN 1 AND 50),
  booking_window_days  integer NOT NULL DEFAULT 30  CHECK (booking_window_days BETWEEN 1 AND 365),
  min_lead_minutes     integer NOT NULL DEFAULT 0   CHECK (min_lead_minutes BETWEEN 0 AND 2880),
  shop_name            text    NOT NULL DEFAULT 'Eyecare Optic ลำปาง',
  shop_phone           text    NOT NULL DEFAULT '',
  updated_at           timestamptz NOT NULL DEFAULT now()
);
INSERT INTO booking_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- เวลาเปิด-ปิดรายวันในสัปดาห์ (0=อาทิตย์ … 6=เสาร์), is_open=false = วันหยุดประจำสัปดาห์
CREATE TABLE IF NOT EXISTS booking_weekly_hours (
  weekday    smallint PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
  is_open    boolean NOT NULL DEFAULT true,
  open_time  time    NOT NULL DEFAULT '10:00',
  close_time time    NOT NULL DEFAULT '19:00',
  CHECK (close_time > open_time)
);
INSERT INTO booking_weekly_hours (weekday) SELECT g FROM generate_series(0,6) g ON CONFLICT DO NOTHING;

-- วันหยุดพิเศษ
CREATE TABLE IF NOT EXISTS booking_holidays (
  holiday_date date PRIMARY KEY,
  note         text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS booking_services (
  code       text PRIMARY KEY,
  name_th    text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true
);
INSERT INTO booking_services (code, name_th, sort_order) VALUES
  ('eye_exam',     'วัดสายตา',       1),
  ('new_glasses',  'ตัดแว่นใหม่',     2),
  ('lens_change',  'เปลี่ยนเลนส์',    3),
  ('pickup',       'รับแว่น',        4),
  ('repair',       'ปรับ-ซ่อมแว่น',  5),
  ('lens_consult', 'ปรึกษาเลนส์',    6)
ON CONFLICT (code) DO UPDATE SET sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS staff_users (
  id            serial PRIMARY KEY,
  username      text UNIQUE NOT NULL,
  display_name  text NOT NULL,
  password_hash text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  failed_count  integer NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- เลขคิวรายวัน (นับต่อเนื่อง ไม่ใช้ซ้ำแม้คิวถูกยกเลิก)
CREATE TABLE IF NOT EXISTS booking_daily_counter (
  appt_date date PRIMARY KEY,
  last_seq  integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS appointments (
  id               bigserial PRIMARY KEY,
  ref_token        uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  queue_seq        integer NOT NULL,
  appt_date        date NOT NULL,
  start_time       time NOT NULL,
  slot_minutes     integer NOT NULL,
  service_code     text NOT NULL REFERENCES booking_services(code),
  full_name        text NOT NULL,
  phone            text NOT NULL,
  note             text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','confirmed','arrived','no_show','cancelled')),
  -- การผูกกับลูกค้าเดิม: matched = ผูกแล้ว, multiple = เบอร์ตรงหลายคน (รอพนักงานเลือก),
  -- new_pending = ลูกค้าใหม่ (รอยืนยัน), new_confirmed = พนักงานยืนยันว่าเป็นลูกค้าใหม่
  customer_row     integer REFERENCES customers(legacy_row),
  match_status     text NOT NULL CHECK (match_status IN ('matched','multiple','new_pending','new_confirmed')),
  source           text NOT NULL CHECK (source IN ('online','staff')),
  pdpa_consent_at  timestamptz NOT NULL,
  pdpa_version     text NOT NULL,
  created_by       integer REFERENCES staff_users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appt_date, queue_seq),
  CHECK ((match_status = 'matched') = (customer_row IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS appointments_date_idx  ON appointments (appt_date, start_time);
CREATE INDEX IF NOT EXISTS appointments_phone_idx ON appointments (phone);
CREATE INDEX IF NOT EXISTS appointments_cust_idx  ON appointments (customer_row);

-- ประวัติการเปลี่ยนสถานะ/การผูกลูกค้า
CREATE TABLE IF NOT EXISTS appointment_log (
  id             bigserial PRIMARY KEY,
  appointment_id bigint NOT NULL REFERENCES appointments(id),
  action         text NOT NULL,
  from_value     text,
  to_value       text,
  staff_id       integer REFERENCES staff_users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointment_log_appt_idx ON appointment_log (appointment_id);
