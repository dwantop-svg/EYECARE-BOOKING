// ทดสอบตรรกะการจองกับฐานข้อมูลทดสอบ (eyecare_test) ที่นำเข้าข้อมูลปลอมจาก sample/fake-customers.json — ไม่แตะฐานข้อมูลจริง
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://eyecare:eyecare@localhost:5432/eyecare_test';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '@/lib/db';
import {
  BookingError, createAppointment, getBookableDays, getDaySlots, listAppointments, loadConfig, matchCustomer,
  saveSettings, setCustomerLink, slotGrid, updateStatus, addHoliday, removeHoliday,
} from '@/lib/booking';
import { addDays, weekdayOf } from '@/lib/time';
import { normalizePhone } from '@/lib/phone';

if (!/_test(\?|$)/.test(process.env.DATABASE_URL!)) throw new Error('tests must run against the test database');

// "ตอนนี้" สมมติ = วันจันทร์ 7 ม.ค. 2030 เวลา 12:10 น. (เวลาไทย) = 05:10 UTC
const NOW = new Date('2030-01-07T05:10:00Z');
const TODAY = '2030-01-07';
const TOMORROW = '2030-01-08';
const KNOWN_PHONE = '0800000001'; // ลูกค้าตัวอย่าง แถวที่ 1 (M900001)
const DUP_PHONE = '0800000004'; // เบอร์นี้ซ้ำกัน 2 คนในข้อมูลตัวอย่าง

const base = (over: Record<string, unknown> = {}) => ({
  service_code: 'eye_exam', date: TOMORROW, time: '10:00', full_name: 'ทดสอบ ระบบ', phone: '0999999901', note: '', pdpa_consent: true, ...over,
});
const book = (over: Record<string, unknown> = {}, source: 'online' | 'staff' = 'online') =>
  createAppointment(base(over), { source, staffId: source === 'staff' ? staffId : undefined, now: NOW });
const code = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return e instanceof BookingError ? e.code : String((e as Error).message); } };

let staffId = 0;
const defaultWeekly = Array.from({ length: 7 }, (_, i) => ({ weekday: i, is_open: true, open_time: '10:00', close_time: '19:00' }));
const defaults = { slot_minutes: 30, max_per_slot: 2, booking_window_days: 30, min_lead_minutes: 0, shop_phone: '', weekly: defaultWeekly, services: [] as { code: string; active: boolean }[] };

beforeEach(async () => {
  const q = pool();
  await q.query('DELETE FROM appointment_log');
  await q.query('DELETE FROM appointments');
  await q.query('DELETE FROM booking_daily_counter');
  await q.query('DELETE FROM booking_holidays');
  await q.query('UPDATE booking_services SET active = true');
  await saveSettings(defaults);
  const s = await q.query(`INSERT INTO staff_users (username, display_name, password_hash) VALUES ('t','T','x') ON CONFLICT (username) DO UPDATE SET display_name='T' RETURNING id`);
  staffId = s.rows[0].id;
});
afterAll(async () => { await pool().end(); });

describe('ข้อมูลลูกค้าเดิม: ห้ามแก้/ลบ', () => {
  it('UPDATE / DELETE / TRUNCATE ถูกฐานข้อมูลปฏิเสธ', async () => {
    await expect(pool().query('UPDATE customers SET points = 999 WHERE legacy_row = 1')).rejects.toThrow(/ห้ามแก้ไขหรือลบ/);
    await expect(pool().query('DELETE FROM customers WHERE legacy_row = 1')).rejects.toThrow(/ห้ามแก้ไขหรือลบ/);
    await expect(pool().query('TRUNCATE customers CASCADE')).rejects.toThrow(/ห้ามแก้ไขหรือลบ/);
    const r = await pool().query('SELECT count(*)::int n, sum(points)::int p FROM customers');
    expect(r.rows[0].n).toBe(5);
  });
});

describe('ช่องเวลา', () => {
  it('ค่าเริ่มต้นช่องละ 30 นาที 10:00–19:00 = 18 ช่อง', async () => {
    const g = slotGrid(await loadConfig(), TOMORROW);
    expect(g.length).toBe(18);
  });
  it('แก้ความยาวช่องเป็น 20 นาที → 27 ช่อง และหน้าจองเห็นเวลาใหม่', async () => {
    await saveSettings({ ...defaults, slot_minutes: 20 });
    const d = await getDaySlots(TOMORROW, NOW);
    expect(d.slots.length).toBe(27);
    expect(d.slots.map((s) => s.time).slice(0, 3)).toEqual(['10:00', '10:20', '10:40']);
    expect(await code(book({ time: '10:20' }))).toBe('ok');
    expect(await code(book({ time: '10:30', phone: '0999999902' }))).toBe('bad_slot');
  });
  it('เวลาที่ผ่านไปแล้ววันนี้แสดงเป็น past และจองไม่ได้', async () => {
    const d = await getDaySlots(TODAY, NOW);
    const at = Object.fromEntries(d.slots.map((s) => [s.time, s]));
    expect(at['12:00'].available).toBe(false);
    expect(at['12:00'].reason).toBe('past');
    expect(at['12:30'].available).toBe(true);
    expect(await code(book({ date: TODAY, time: '12:00' }))).toBe('past');
    expect(await code(book({ date: TODAY, time: '11:00' }))).toBe('past');
    expect(await code(book({ date: addDays(TODAY, -1), time: '15:00' }))).toBe('past');
    expect(await code(book({ date: TODAY, time: '12:30' }))).toBe('ok');
  });
  it('ระยะเวลาจองล่วงหน้าขั้นต่ำ (min_lead_minutes)', async () => {
    await saveSettings({ ...defaults, min_lead_minutes: 60 });
    expect(await code(book({ date: TODAY, time: '13:00' }))).toBe('past');
    expect(await code(book({ date: TODAY, time: '13:30' }))).toBe('ok');
  });
  it('นอกเวลาเปิด-ปิด และเวลาไม่ตรงช่อง จองไม่ได้', async () => {
    expect(await code(book({ time: '09:30' }))).toBe('bad_slot');
    expect(await code(book({ time: '18:30', phone: '0999999903' }))).toBe('ok');
    expect(await code(book({ time: '19:00' }))).toBe('bad_slot');
    expect(await code(book({ time: '10:15' }))).toBe('bad_slot');
  });
  it('เกินช่วงเปิดจองล่วงหน้าไม่ได้', async () => {
    expect(await code(book({ date: addDays(TODAY, 30) }))).toBe('ok');
    expect(await code(book({ date: addDays(TODAY, 31) }))).toBe('beyond');
  });
});

describe('วันหยุด', () => {
  it('วันหยุดประจำสัปดาห์จองไม่ได้ และหน้าจองแสดงว่าปิด', async () => {
    const wd = weekdayOf(TOMORROW);
    await saveSettings({ ...defaults, weekly: defaultWeekly.map((w) => (w.weekday === wd ? { ...w, is_open: false } : w)) });
    expect(await code(book())).toBe('closed');
    const days = await getBookableDays(NOW);
    expect(days.days.find((d) => d.date === TOMORROW)?.state).toBe('closed');
    expect((await getDaySlots(TOMORROW, NOW)).slots).toEqual([]);
  });
  it('เวลาเปิด-ปิดรายวันมีผล', async () => {
    const wd = weekdayOf(TOMORROW);
    await saveSettings({ ...defaults, weekly: defaultWeekly.map((w) => (w.weekday === wd ? { ...w, open_time: '13:00', close_time: '15:00' } : w)) });
    expect((await getDaySlots(TOMORROW, NOW)).slots.map((s) => s.time)).toEqual(['13:00', '13:30', '14:00', '14:30']);
    expect(await code(book({ time: '10:00' }))).toBe('bad_slot');
  });
  it('วันหยุดพิเศษจองไม่ได้ และลบแล้วจองได้', async () => {
    await addHoliday(TOMORROW, 'สงกรานต์');
    expect(await code(book())).toBe('holiday');
    const days = await getBookableDays(NOW);
    expect(days.days.find((d) => d.date === TOMORROW)).toMatchObject({ state: 'holiday', note: 'สงกรานต์' });
    await removeHoliday(TOMORROW);
    expect(await code(book())).toBe('ok');
  });
  it('เพิ่มวันหยุดทับวันที่มีคิวแล้ว แจ้งจำนวนคิวที่ได้รับผลกระทบ', async () => {
    await book();
    expect((await addHoliday(TOMORROW, '')).affected).toBe(1);
  });
});

describe('จำนวนคิวสูงสุดต่อช่วงเวลา', () => {
  it('ครบ 2 คิวแล้ว คิวที่ 3 จองไม่ได้ และหน้าจองแสดงเต็ม', async () => {
    expect(await code(book({ phone: '0999999911' }))).toBe('ok');
    expect(await code(book({ phone: '0999999912' }))).toBe('ok');
    expect(await code(book({ phone: '0999999913' }))).toBe('full');
    expect(await code(book({ phone: '0999999913' }, 'staff'))).toBe('full');
    const s = (await getDaySlots(TOMORROW, NOW)).slots.find((x) => x.time === '10:00')!;
    expect(s).toMatchObject({ available: false, reason: 'full', remaining: 0 });
  });
  it('ยกเลิกคิวแล้วช่องว่างคืน แต่กู้คิวที่ยกเลิกกลับมาเกินจำนวนไม่ได้', async () => {
    const a = await book({ phone: '0999999921' });
    await book({ phone: '0999999922' });
    await updateStatus(a.id, 'cancelled', staffId, NOW);
    expect(await code(book({ phone: '0999999923' }))).toBe('ok');
    expect(await code(updateStatus(a.id, 'confirmed', staffId, NOW))).toBe('full');
  });
  it('แก้จำนวนสูงสุดเป็น 1 มีผลทันที', async () => {
    await saveSettings({ ...defaults, max_per_slot: 1 });
    expect(await code(book({ phone: '0999999931' }))).toBe('ok');
    expect(await code(book({ phone: '0999999932' }))).toBe('full');
  });
  it('จองพร้อมกัน 12 คนในช่องเดียว ได้คิวแค่ 2 (กันจองชนกัน)', async () => {
    const res = await Promise.all(Array.from({ length: 12 }, (_, i) => code(book({ phone: `09888888${String(i).padStart(2, '0')}` }))));
    expect(res.filter((r) => r === 'ok').length).toBe(2);
    expect(res.filter((r) => r === 'full').length).toBe(10);
  });
});

describe('เชื่อมกับลูกค้าเดิม', () => {
  it('เบอร์ตรงกับลูกค้าเดิม 1 คน → ผูกอัตโนมัติ', async () => {
    const a = await book({ phone: KNOWN_PHONE });
    expect(a.match_status).toBe('matched');
    expect(a.customer_row).toBe(1);
  });
  it('รองรับเบอร์รูปแบบ +66 / มีขีด', async () => {
    expect(normalizePhone('+66 80-000-0001')).toBe(KNOWN_PHONE);
    const a = await book({ phone: '080-000-0001' });
    expect(a.match_status).toBe('matched');
  });
  it('เบอร์ไม่ตรง → ลูกค้าใหม่ (รอยืนยัน) และไม่สร้างลูกค้าในตาราง customers', async () => {
    const before = (await pool().query('SELECT count(*)::int n FROM customers')).rows[0].n;
    const a = await book({ phone: '0912345670' });
    const b = await book({ phone: '0912345670', time: '11:00' });
    expect(a.match_status).toBe('new_pending');
    expect(b.match_status).toBe('new_pending');
    expect(a.customer_row).toBeNull();
    expect((await pool().query('SELECT count(*)::int n FROM customers')).rows[0].n).toBe(before);
  });
  it('เบอร์ตรงหลายคนในข้อมูลเดิม → ไม่เดา ให้พนักงานเลือก', async () => {
    const m = await matchCustomer(pool(), DUP_PHONE);
    expect(m.candidates.length).toBe(2);
    const a = await book({ phone: DUP_PHONE });
    expect(a.match_status).toBe('multiple');
    await setCustomerLink(a.id, m.candidates[1], staffId);
    const [row] = await listAppointments(TOMORROW, TOMORROW);
    expect(row).toMatchObject({ match_status: 'matched', customer_row: m.candidates[1] });
  });
  it('พนักงานยืนยันลูกค้าใหม่ หรือผูกกับลูกค้าเดิมได้ภายหลัง', async () => {
    const a = await book({ phone: '0912345671' });
    expect((await setCustomerLink(a.id, null, staffId)).match_status).toBe('new_confirmed');
    expect((await setCustomerLink(a.id, 5, staffId)).match_status).toBe('matched');
    expect(await code(setCustomerLink(a.id, 999999, staffId))).toBe('no_customer');
  });
});

describe('ตรวจข้อมูลที่กรอก', () => {
  it('ไม่ติ๊ก PDPA จองไม่ได้', async () => {
    expect(await code(book({ pdpa_consent: false }))).toBe('no_consent');
    expect(await code(book({ pdpa_consent: 'true' }))).toBe('no_consent');
  });
  it('ชื่อ เบอร์ บริการ ผิด จองไม่ได้', async () => {
    expect(await code(book({ full_name: ' ' }))).toBe('bad_name');
    expect(await code(book({ phone: '12345' }))).toBe('bad_phone');
    expect(await code(book({ service_code: 'xxx' }))).toBe('bad_service');
    expect(await code(book({ date: '2030-02-30' }))).toBe('bad_date');
    expect(await code(book({ time: '25:00' }))).toBe('bad_time');
  });
  it('ปิดบริการแล้วจองบริการนั้นไม่ได้', async () => {
    await saveSettings({ ...defaults, services: [{ code: 'repair', active: false }] });
    expect(await code(book({ service_code: 'repair' }))).toBe('bad_service');
    expect((await getBookableDays(NOW)).services.map((s) => s.code)).not.toContain('repair');
  });
  it('เบอร์เดียวจองช่วงเวลาเดิมซ้ำไม่ได้ และจองออนไลน์ค้างได้ไม่เกิน 3 คิว', async () => {
    await book({ phone: '0912345672' });
    expect(await code(book({ phone: '0912345672' }))).toBe('duplicate');
    await book({ phone: '0912345672', time: '11:00' });
    await book({ phone: '0912345672', time: '12:00' });
    expect(await code(book({ phone: '0912345672', time: '13:00' }))).toBe('too_many');
    expect(await code(book({ phone: '0912345672', time: '13:00' }, 'staff'))).toBe('ok');
  });
  it('ตั้งค่าที่ผิดถูกปฏิเสธ', async () => {
    expect(await code(saveSettings({ ...defaults, slot_minutes: 0 }))).toBe('bad_setting');
    expect(await code(saveSettings({ ...defaults, max_per_slot: 0 }))).toBe('bad_setting');
    expect(await code(saveSettings({ ...defaults, weekly: defaultWeekly.map((w) => ({ ...w, close_time: '09:00' })) }))).toBe('bad_setting');
    expect(await code(saveSettings({ ...defaults, services: ['eye_exam', 'pickup', 'repair', 'lens_consult'].map((c) => ({ code: c, active: false })) }))).toBe('bad_setting');
  });
});

describe('เลขคิวและสถานะ', () => {
  it('เลขคิวเรียงต่อกันรายวัน และไม่ใช้ซ้ำแม้ยกเลิก', async () => {
    const a = await book({ phone: '0912345681' });
    const b = await book({ phone: '0912345682', time: '11:00' });
    await updateStatus(b.id, 'cancelled', staffId, NOW);
    const c = await book({ phone: '0912345683', time: '11:30' });
    expect([a.queue_no, b.queue_no, c.queue_no]).toEqual(['0801-001', '0801-002', '0801-003']);
  });
  it('เปลี่ยนสถานะได้ครบ 5 แบบ และบันทึกประวัติ', async () => {
    const a = await book({ phone: '0912345691' });
    for (const s of ['confirmed', 'arrived', 'no_show', 'cancelled', 'pending']) await updateStatus(a.id, s, staffId, NOW);
    expect(await code(updateStatus(a.id, 'done', staffId, NOW))).toBe('bad_status');
    const log = await pool().query("SELECT count(*)::int n FROM appointment_log WHERE appointment_id = $1 AND action = 'status'", [a.id]);
    expect(log.rows[0].n).toBe(5);
  });
  it('คิวที่พนักงานเพิ่มเป็น "ยืนยันแล้ว" ส่วนคิวออนไลน์เป็น "รอยืนยัน"', async () => {
    await book({ phone: '0912345692' });
    await book({ phone: '0912345693', time: '11:00' }, 'staff');
    const rows = await listAppointments(TOMORROW, TOMORROW);
    expect(rows.map((r) => [r.source, r.status])).toEqual([['online', 'pending'], ['staff', 'confirmed']]);
  });
});
