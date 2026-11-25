// ทดสอบผ่านเบราว์เซอร์จริง (Playwright) กับเซิร์ฟเวอร์ที่รันอยู่
// ใช้: BASE_URL=http://localhost:3000 STAFF_USER=staff STAFF_PASS=... node tests/e2e.mjs
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const USER = process.env.STAFF_USER || 'staff';
const PASS = process.env.STAFF_PASS;
if (!PASS) { console.error('ต้องตั้งค่า STAFF_PASS'); process.exit(1); }
const SHOTS = process.env.SHOTS_DIR || 'test-results';
fs.mkdirSync(SHOTS, { recursive: true });

const KNOWN_PHONE = '0800000001'; // ลูกค้าตัวอย่าง M900001 สมชาย ทดสอบ (sample/fake-customers.json)
const NEW_PHONE = '09' + String(Date.now()).slice(-8); // เบอร์ที่ไม่มีในระบบ
const bkk = new Date(Date.now() + 7 * 3600e3);
const today = bkk.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
// ใช้วันที่ล่วงหน้า 10–12 วัน เพื่อไม่ชนกับการทดสอบครั้งก่อน ๆ
const D1 = addDays(today, 10 + (Date.now() % 3));
const D2 = addDays(D1, 1);
const D3 = addDays(D1, 2);

let passed = 0;
const results = [];
async function step(name, fn) {
  try { await fn(); passed++; results.push(`  ✓ ${name}`); console.log(`✓ ${name}`); }
  catch (e) { results.push(`  ✗ ${name}\n    ${e.message}`); console.error(`✗ ${name}\n`, e); throw e; }
}

const browser = await chromium.launch();
const phone = await browser.newContext({ ...devices['iPhone 13'], locale: 'th-TH' });
const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'th-TH' });
const p = await phone.newPage();

async function publicBook(page, { service = 'eye_exam', date, time, name, phoneNo, note = '' }) {
  await page.goto(`${BASE}/book`);
  await page.click(`[data-service="${service}"]`);
  await page.click(`[data-date="${date}"]`);
  await page.click(`[data-time="${time}"]`);
  await page.fill('input[name=full_name]', name);
  await page.fill('input[name=phone]', phoneNo);
  if (note) await page.fill('textarea[name=note]', note);
  await page.check('input[name=pdpa]');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/book\/done\//);
  return (await page.textContent('[data-testid=queue-no]')).trim();
}

try {
  // ───────── 1) หน้าจองคิวสาธารณะ ─────────
  await step('หน้าจองเปิดได้โดยไม่ต้องล็อกอิน และมีบริการครบ 4 อย่าง', async () => {
    const r = await p.goto(`${BASE}/book`);
    assert.equal(r.status(), 200);
    for (const s of ['วัดสายตา', 'รับแว่น', 'ปรับ-ซ่อมแว่น', 'ปรึกษาเลนส์']) await p.getByRole('button', { name: new RegExp(s) }).waitFor();
    await p.screenshot({ path: `${SHOTS}/01-book-mobile.png`, fullPage: true });
  });

  await step('ช่วงเวลาที่ผ่านไปแล้ววันนี้กดไม่ได้', async () => {
    const r = await (await fetch(`${BASE}/api/public/slots?date=${today}`)).json();
    const nowMin = bkk.getUTCHours() * 60 + bkk.getUTCMinutes();
    for (const s of r.slots) {
      const [h, m] = s.time.split(':').map(Number);
      if (h * 60 + m <= nowMin) assert.equal(s.available, false, `slot ${s.time} should be past`);
    }
    const dayBtn = p.locator(`[data-date="${today}"]`);
    const anyFuture = r.slots.some((s) => s.available);
    assert.equal(await dayBtn.isDisabled(), !anyFuture);
  });

  await step('ไม่ติ๊ก PDPA → ปุ่มยืนยันกดไม่ได้ และ API ปฏิเสธ', async () => {
    await p.goto(`${BASE}/book`);
    await p.click('[data-service="eye_exam"]');
    await p.click(`[data-date="${D1}"]`);
    await p.click('[data-time="10:00"]');
    await p.fill('input[name=full_name]', 'ไม่ ยินยอม');
    await p.fill('input[name=phone]', '0811111111');
    assert.equal(await p.isDisabled('button[type=submit]'), true);
    await p.check('input[name=pdpa]');
    assert.equal(await p.isDisabled('button[type=submit]'), false);
    const res = await fetch(`${BASE}/api/public/book`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_code: 'eye_exam', date: D1, time: '10:00', full_name: 'ทดสอบ', phone: '0811111111', pdpa_consent: false }) });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /PDPA/);
  });

  let q1, q2;
  await step('ลูกค้าเดิมจองสำเร็จ → หน้ายืนยันแสดงเลขคิว', async () => {
    q1 = await publicBook(p, { date: D1, time: '10:00', name: 'สมชาย ทดสอบ', phoneNo: '080-000-0001', note: 'ใส่คอนแทคเลนส์อยู่' });
    assert.match(q1, /^\d{4}-\d{3}$/);
    await p.getByText('จองคิวสำเร็จ', { exact: true }).waitFor();
    await p.getByText('วัดสายตา').waitFor();
    await p.getByText('080-xxx-0001').waitFor();
    await p.screenshot({ path: `${SHOTS}/02-done-mobile.png`, fullPage: true });
  });

  await step('ลูกค้าใหม่จองสำเร็จ (เบอร์ไม่อยู่ในระบบ)', async () => {
    q2 = await publicBook(p, { service: 'repair', date: D1, time: '10:00', name: 'ลูกค้า ใหม่ทดสอบ', phoneNo: NEW_PHONE });
    assert.notEqual(q1, q2);
  });

  await step('ช่องเต็ม (2/2) → หน้าจองแสดง "เต็ม" และ API ปฏิเสธคิวที่ 3', async () => {
    await p.goto(`${BASE}/book`);
    await p.click(`[data-date="${D1}"]`);
    const slot = p.locator('[data-time="10:00"]');
    await slot.waitFor();
    assert.equal(await slot.isDisabled(), true);
    assert.match(await slot.textContent(), /เต็ม/);
    const res = await fetch(`${BASE}/api/public/book`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_code: 'pickup', date: D1, time: '10:00', full_name: 'คนที่ สาม', phone: '0822222222', pdpa_consent: true }) });
    assert.equal(res.status, 409);
  });

  await step('API สาธารณะไม่เปิดเผยชื่อ/เบอร์ผู้จอง และไม่บอกว่าเป็นลูกค้าเดิมหรือไม่', async () => {
    const slots = await (await fetch(`${BASE}/api/public/slots?date=${D1}`)).text();
    assert.ok(!slots.includes('สมชาย') && !slots.includes(KNOWN_PHONE));
    const res = await fetch(`${BASE}/api/public/book`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_code: 'pickup', date: D1, time: '11:00', full_name: 'ทดสอบ API', phone: '0833333333', pdpa_consent: true }) });
    const j = await res.json();
    assert.deepEqual(Object.keys(j).sort(), ['queue_no', 'ref_token']);
  });

  // ───────── 2) หน้าพนักงาน ─────────
  const d = await desk.newPage();
  await step('หน้าพนักงานต้องล็อกอิน (หน้าเว็บ + API)', async () => {
    await d.goto(`${BASE}/staff`);
    await d.waitForURL(/\/staff\/login/);
    for (const path of ['/api/staff/appointments?from=' + D1 + '&to=' + D1, '/api/staff/customers?q=0895', '/api/staff/settings', '/api/staff/qr']) {
      assert.equal((await fetch(BASE + path)).status, 401, path);
    }
  });

  await step('รหัสผ่านผิดเข้าไม่ได้ / รหัสถูกเข้าได้', async () => {
    await d.fill('input[name=username]', USER);
    await d.fill('input[name=password]', 'wrong-password');
    await d.click('button[type=submit]');
    await d.getByText('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง').waitFor();
    await d.fill('input[name=password]', PASS);
    await d.click('button[type=submit]');
    await d.waitForURL(`${BASE}/staff`);
    await d.getByRole('link', { name: 'คิวนัดหมาย' }).waitFor();
  });

  await step('คิวรายวัน: เห็นคิวทั้งสอง ลูกค้าเดิมถูกผูก ลูกค้าใหม่ขึ้น "ลูกค้าใหม่ (รอยืนยัน)"', async () => {
    await d.goto(`${BASE}/staff?date=${D1}&view=day`);
    const c1 = d.locator(`[data-queue="${q1}"]`);
    const c2 = d.locator(`[data-queue="${q2}"]`);
    await c1.waitFor();
    assert.match(await c1.textContent(), /M900001 · สมชาย ทดสอบ/);
    assert.match(await c1.textContent(), /รอยืนยัน/);
    assert.match(await c1.textContent(), /ใส่คอนแทคเลนส์อยู่/);
    assert.match(await c2.textContent(), /ลูกค้าใหม่ \(รอยืนยัน\)/);
    await d.screenshot({ path: `${SHOTS}/03-staff-day.png`, fullPage: true });
  });

  await step('เปลี่ยนสถานะคิว: รอยืนยัน → ยืนยันแล้ว → มาแล้ว (บันทึกจริง)', async () => {
    const sel = d.locator(`[data-queue="${q1}"] select`);
    await sel.selectOption('confirmed');
    await d.getByText(`คิว ${q1} → ยืนยันแล้ว`).waitFor();
    await sel.selectOption('arrived');
    await d.getByText(`คิว ${q1} → มาแล้ว`).waitFor();
    await d.reload();
    assert.equal(await d.locator(`[data-queue="${q1}"] select`).inputValue(), 'arrived');
    for (const s of ['no_show', 'cancelled', 'pending']) {
      await d.locator(`[data-queue="${q2}"] select`).selectOption(s);
      await d.waitForTimeout(250);
    }
    await d.reload();
    assert.equal(await d.locator(`[data-queue="${q2}"] select`).inputValue(), 'pending');
  });

  await step('กดจากคิวไปเปิดประวัติลูกค้าเดิม', async () => {
    await d.locator(`[data-queue="${q1}"] [data-testid=customer-link]`).click();
    await d.waitForURL(/\/staff\/customers\/1$/);
    await d.getByRole('heading', { name: 'สมชาย ทดสอบ' }).waitFor();
    await d.getByText('M900001').first().waitFor();
    await d.getByText('ประวัติการจองคิว').waitFor();
    assert.ok((await d.locator('table').textContent()).includes(q1));
    await d.screenshot({ path: `${SHOTS}/04-customer-history.png`, fullPage: true });
  });

  await step('ลูกค้าใหม่: พนักงานกด "ยืนยันว่าเป็นลูกค้าใหม่" ได้ (ไม่สร้างลูกค้าซ้ำ)', async () => {
    await d.goto(`${BASE}/staff?date=${D1}&view=day`);
    await d.locator(`[data-queue="${q2}"]`).getByRole('button', { name: 'ผูกกับลูกค้าเดิม' }).click();
    await d.getByRole('heading', { name: `ผูกคิว ${q2} กับลูกค้าเดิม` }).waitFor();
    await d.getByRole('button', { name: 'ยืนยันว่าเป็นลูกค้าใหม่' }).click();
    await d.getByText(`คิว ${q2}: ยืนยันเป็นลูกค้าใหม่แล้ว`).waitFor();
    assert.match(await d.locator(`[data-queue="${q2}"]`).textContent(), /ลูกค้าใหม่ \(ยืนยันแล้ว\)/);
  });

  let q3;
  await step('พนักงานเพิ่มคิวเอง (ลูกค้าโทรมา) → ระบบเจอลูกค้าเดิมจากเบอร์', async () => {
    await d.goto(`${BASE}/staff?date=${D2}&view=day`);
    await d.click('[data-testid=add-appt]');
    await d.fill('dialog input[name=phone]', KNOWN_PHONE);
    await d.locator('[data-testid=lookup]').getByText(/ลูกค้าเดิม: M900001/).waitFor();
    await d.getByRole('button', { name: 'ใช้ชื่อนี้' }).click();
    assert.equal(await d.inputValue('dialog input[name=full_name]'), 'สมชาย ทดสอบ');
    await d.selectOption('dialog select[name=service]', 'pickup');
    await d.fill('dialog input[name=date]', D2);
    await d.click('dialog [data-time="14:00"]');
    await d.screenshot({ path: `${SHOTS}/05-staff-add.png` });
    assert.equal(await d.isDisabled('dialog button[type=submit]'), true, 'ต้องติ๊กยินยอมก่อน');
    await d.check('dialog input[name=pdpa]');
    await d.click('dialog button[type=submit]');
    const msg = await d.getByText(/เพิ่มคิว \d{4}-\d{3} แล้ว \(ลูกค้าเดิม\)/).textContent();
    q3 = msg.match(/\d{4}-\d{3}/)[0];
    const card = d.locator(`[data-queue="${q3}"]`);
    assert.match(await card.textContent(), /ยืนยันแล้ว/);
    assert.match(await card.textContent(), /พนักงานเพิ่ม/);
  });

  await step('คิวรายสัปดาห์แสดงคิวของทั้งสัปดาห์ และกดไปดูรายวันได้', async () => {
    await d.goto(`${BASE}/staff?date=${D1}&view=week`);
    const grid = d.locator('[data-testid=week-grid]');
    await grid.waitFor();
    assert.equal(await grid.locator('.wday').count(), 7);
    assert.match(await grid.locator(`[data-date="${D1}"]`).textContent(), /สมชาย/);
    assert.match(await grid.locator(`[data-date="${D2}"]`).textContent(), /14:00/);
    await d.screenshot({ path: `${SHOTS}/06-staff-week.png`, fullPage: true });
    await grid.locator(`[data-date="${D2}"] .wday-head`).click();
    await d.locator(`[data-queue="${q3}"]`).waitFor();
  });

  // ───────── 3) ตั้งค่า ─────────
  let original;
  await step('ตั้งค่า: แก้ช่องเวลาเป็น 20 นาที / สูงสุด 1 คิว / ปิดวันในสัปดาห์ → หน้าจองเปลี่ยนตาม', async () => {
    original = await (await d.request.get(`${BASE}/api/staff/settings`)).json();
    await d.goto(`${BASE}/staff/settings`);
    await d.fill('input[name=slot_minutes]', '20');
    await d.fill('input[name=max_per_slot]', '1');
    const wd3 = new Date(D3 + 'T00:00:00Z').getUTCDay();
    await d.locator(`tr[data-weekday="${wd3}"] input[type=checkbox]`).uncheck();
    await d.screenshot({ path: `${SHOTS}/07-settings.png`, fullPage: true });
    await d.getByRole('button', { name: 'บันทึกการตั้งค่า' }).click();
    await d.getByText('บันทึกการตั้งค่าแล้ว').waitFor();
    const s = await (await fetch(`${BASE}/api/public/slots?date=${D2}`)).json();
    assert.equal(s.slots[1].time, '10:20');
    assert.equal(s.slots.find((x) => x.time === '14:00').available, false, '14:00 มี 1 คิวแล้ว สูงสุด 1');
    const s3 = await (await fetch(`${BASE}/api/public/slots?date=${D3}`)).json();
    assert.equal(s3.state, 'closed');
    await p.goto(`${BASE}/book`);
    assert.equal(await p.locator(`[data-date="${D3}"]`).isDisabled(), true);
  });

  await step('ตั้งค่า: เพิ่ม/ลบวันหยุดพิเศษ → หน้าจองเปลี่ยนตาม', async () => {
    await d.fill('input[aria-label="วันที่หยุด"]', D2);
    await d.fill('input[aria-label="หมายเหตุวันหยุด"]', 'ทดสอบวันหยุด');
    await d.getByRole('button', { name: 'เพิ่มวันหยุด' }).click();
    await d.getByText(/มีคิวที่จองไว้แล้ว 1 คิว/).waitFor();
    const s = await (await fetch(`${BASE}/api/public/slots?date=${D2}`)).json();
    assert.equal(s.state, 'holiday');
    await p.goto(`${BASE}/book`);
    assert.equal(await p.locator(`[data-date="${D2}"]`).isDisabled(), true);
    assert.match(await p.locator(`[data-date="${D2}"]`).textContent(), /หยุด/);
    await d.locator('[data-testid=holidays] tr', { hasText: 'ทดสอบวันหยุด' }).getByRole('button', { name: 'ลบ' }).click();
    await d.getByText('ลบวันหยุดแล้ว').waitFor();
    assert.equal((await (await fetch(`${BASE}/api/public/slots?date=${D2}`)).json()).state, 'open');
  });

  await step('คืนค่าตั้งค่าเดิม', async () => {
    const r = await d.request.put(`${BASE}/api/staff/settings`, {
      headers: { Origin: BASE },
      data: { ...original.settings, weekly: original.weekly, services: original.services.map(({ code, active }) => ({ code, active })) },
    });
    assert.equal(r.status(), 200);
  });

  await step('กันคำขอข้ามเว็บ (CSRF): Origin อื่นแก้ข้อมูลไม่ได้', async () => {
    const r = await d.request.patch(`${BASE}/api/staff/appointments/1`, { headers: { Origin: 'https://evil.example' }, data: { status: 'cancelled' } });
    assert.equal(r.status(), 401);
  });

  // ───────── 4) ลิงก์ & QR ─────────
  await step('หน้าลิงก์ & QR Code: แสดงลิงก์ /book, QR และดาวน์โหลด PNG ได้', async () => {
    await d.goto(`${BASE}/staff/share`);
    assert.match(await d.textContent('[data-testid=public-url]'), /\/book$/);
    assert.equal(await d.locator('.qr-box svg').count(), 1);
    const r = await d.request.get(`${BASE}/api/staff/qr`);
    assert.equal(r.headers()['content-type'], 'image/png');
    const buf = await r.body();
    assert.equal(buf.subarray(1, 4).toString(), 'PNG');
    fs.writeFileSync(`${SHOTS}/qr.png`, buf);
    await d.screenshot({ path: `${SHOTS}/08-share.png`, fullPage: true });
  });

  await step('ค้นหาลูกค้าเดิมจากเมนู "ค้นหาลูกค้า"', async () => {
    await d.goto(`${BASE}/staff/customers`);
    await d.fill('input[type=search]', '0800000001');
    await d.getByText('สมชาย ทดสอบ').click();
    await d.waitForURL(/\/staff\/customers\/1$/);
  });

  await step('ออกจากระบบแล้วเข้าหน้าพนักงานไม่ได้', async () => {
    await d.goto(`${BASE}/staff`);
    await d.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await d.waitForURL(/\/staff\/login/);
    await d.goto(`${BASE}/staff/settings`);
    await d.waitForURL(/\/staff\/login/);
  });

  await step('มือถือ: หน้าพนักงานไม่ล้นจอแนวนอน', async () => {
    const m = await phone.newPage();
    await m.goto(`${BASE}/staff/login`);
    await m.fill('input[name=username]', USER);
    await m.fill('input[name=password]', PASS);
    await m.click('button[type=submit]');
    await m.waitForURL(`${BASE}/staff`);
    await m.goto(`${BASE}/staff?date=${D1}&view=day`);
    await m.locator(`[data-queue="${q1}"]`).waitFor();
    for (const path of [`/staff?date=${D1}&view=day`, `/staff?date=${D1}&view=week`, '/staff/settings', '/book']) {
      await m.goto(BASE + path);
      await m.waitForTimeout(400);
      const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(over <= 1, `${path} ล้นแนวนอน ${over}px`);
    }
    await m.goto(`${BASE}/staff?date=${D1}&view=day`);
    await m.locator(`[data-queue="${q1}"]`).waitFor();
    await m.screenshot({ path: `${SHOTS}/09-staff-mobile.png`, fullPage: true });
  });
} finally {
  await browser.close();
  console.log(`\nผลทดสอบ E2E: ผ่าน ${passed} ข้อ\n${results.join('\n')}`);
}
