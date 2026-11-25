// เวลาทั้งหมดของระบบเป็นเวลาไทย (UTC+7 ไม่มี daylight saving)
const BKK_OFFSET_MS = 7 * 3600 * 1000;

export function bkkNow(now: Date = new Date()): { date: string; minutes: number } {
  const t = new Date(now.getTime() + BKK_OFFSET_MS);
  return { date: t.toISOString().slice(0, 10), minutes: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

export function isDateStr(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isTimeStr(s: unknown): s is string {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(s);
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/** 0 = อาทิตย์ … 6 = เสาร์ */
export function weekdayOf(date: string): number {
  return new Date(date + 'T00:00:00Z').getUTCDay();
}

/** วันจันทร์ของสัปดาห์ที่มีวันนี้อยู่ */
export function weekStart(date: string): string {
  const wd = weekdayOf(date);
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

export function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function fromMin(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const TH_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export function thaiDateLong(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `วัน${TH_DAYS[weekdayOf(date)]}ที่ ${d} ${TH_MONTHS[m - 1]} ${y + 543}`;
}

export function thaiDateShort(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${TH_DAYS_SHORT[weekdayOf(date)]} ${d} ${TH_MONTHS_SHORT[m - 1]} ${String(y + 543).slice(2)}`;
}

export const WEEKDAY_NAMES = TH_DAYS;
export const WEEKDAY_SHORT = TH_DAYS_SHORT;
export const MONTHS_SHORT = TH_MONTHS_SHORT;
