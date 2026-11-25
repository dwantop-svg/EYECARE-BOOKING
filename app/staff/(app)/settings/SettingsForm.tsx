'use client';

import { useState } from 'react';

type Settings = { slot_minutes: number; max_per_slot: number; booking_window_days: number; min_lead_minutes: number; shop_name: string; shop_phone: string };
type Weekly = { weekday: number; is_open: boolean; open_time: string; close_time: string };
type Service = { code: string; name_th: string; active: boolean };
type Holiday = { holiday_date: string; note: string };

const DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
// ตัวเลือกเวลาแบบ 24 ชม. แสดงเป็น "10.00 น." (ไม่ขึ้นกับภาษาของเบราว์เซอร์ที่อาจแสดง AM/PM)
const TIME_OPTS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
const thTime = (t: string) => `${t.replace(':', '.')} น.`;
function TimeSelect({ value, disabled, onChange, label }: { value: string; disabled: boolean; onChange: (v: string) => void; label: string }) {
  const v = value.slice(0, 5);
  const opts = TIME_OPTS.includes(v) ? TIME_OPTS : [...TIME_OPTS, v].sort();
  return (
    <select value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {opts.map((t) => <option key={t} value={t}>{thTime(t)}</option>)}
    </select>
  );
}

const th = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return `วัน${DOW[new Date(d + 'T00:00:00Z').getUTCDay()]}ที่ ${dd} ${MON[m - 1]} ${y + 543}`; };

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { window.location.href = '/staff/login'; throw new Error('auth'); }
  if (!r.ok) throw new Error(j.error || 'บันทึกไม่สำเร็จ');
  return j;
}

export function SettingsForm(props: { settings: Settings; weekly: Weekly[]; services: Service[]; holidays: Holiday[]; today: string }) {
  const [s, setS] = useState(props.settings);
  const [weekly, setWeekly] = useState(props.weekly);
  const [services, setServices] = useState(props.services);
  const [holidays, setHolidays] = useState(props.holidays);
  const [hDate, setHDate] = useState('');
  const [hNote, setHNote] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [hMsg, setHMsg] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const setW = (wd: number, patch: Partial<Weekly>) => setWeekly((ws) => ws.map((w) => (w.weekday === wd ? { ...w, ...patch } : w)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await send('/api/staff/settings', 'PUT', {
        slot_minutes: Number(s.slot_minutes), max_per_slot: Number(s.max_per_slot), booking_window_days: Number(s.booking_window_days),
        min_lead_minutes: Number(s.min_lead_minutes), shop_phone: s.shop_phone, weekly, services: services.map(({ code, active }) => ({ code, active })),
      });
      setMsg({ kind: 'ok', text: 'บันทึกการตั้งค่าแล้ว มีผลกับหน้าจองคิวทันที' });
    } catch (e2) { setMsg({ kind: 'error', text: (e2 as Error).message }); }
    setBusy(false);
  }

  async function addHoliday(e: React.FormEvent) {
    e.preventDefault();
    setHMsg(null);
    if (!hDate) return setHMsg({ kind: 'error', text: 'กรุณาเลือกวันที่' });
    try {
      const j = await send('/api/staff/holidays', 'POST', { date: hDate, note: hNote });
      setHolidays(j.holidays);
      setHDate(''); setHNote('');
      setHMsg(j.affected > 0
        ? { kind: 'warn', text: `เพิ่มวันหยุดแล้ว แต่มีคิวที่จองไว้แล้ว ${j.affected} คิวในวันนั้น กรุณาโทรแจ้งลูกค้าและเปลี่ยนสถานะเป็น “ยกเลิก”` }
        : { kind: 'ok', text: 'เพิ่มวันหยุดแล้ว' });
    } catch (e2) { setHMsg({ kind: 'error', text: (e2 as Error).message }); }
  }
  async function removeHoliday(d: string) {
    try { const j = await send(`/api/staff/holidays?date=${d}`, 'DELETE'); setHolidays(j.holidays); setHMsg({ kind: 'ok', text: 'ลบวันหยุดแล้ว' }); }
    catch (e2) { setHMsg({ kind: 'error', text: (e2 as Error).message }); }
  }

  return (
    <div className="stack" style={{ gap: 14, maxWidth: 820 }}>
      <h1>ตั้งค่าการจองคิว</h1>
      <form className="stack" style={{ gap: 14 }} onSubmit={save}>
        <section className="card stack">
          <h2>ช่วงเวลาและจำนวนคิว</h2>
          <div className="grid2">
            <label className="field">ความยาวแต่ละช่วงเวลา (นาที)
              <input type="number" name="slot_minutes" min={5} max={240} step={5} value={s.slot_minutes} onChange={(e) => setS({ ...s, slot_minutes: Number(e.target.value) })} required />
            </label>
            <label className="field">จำนวนคิวสูงสุดต่อช่วงเวลา
              <input type="number" name="max_per_slot" min={1} max={50} value={s.max_per_slot} onChange={(e) => setS({ ...s, max_per_slot: Number(e.target.value) })} required />
            </label>
            <label className="field">เปิดให้จองล่วงหน้าได้ (วัน)
              <input type="number" name="booking_window_days" min={1} max={365} value={s.booking_window_days} onChange={(e) => setS({ ...s, booking_window_days: Number(e.target.value) })} required />
            </label>
            <label className="field">ต้องจองก่อนถึงเวลาอย่างน้อย (นาที)
              <input type="number" name="min_lead_minutes" min={0} max={2880} value={s.min_lead_minutes} onChange={(e) => setS({ ...s, min_lead_minutes: Number(e.target.value) })} required />
            </label>
            <label className="field">เบอร์โทรร้าน (แสดงในหน้าจองและหน้ายืนยัน)
              <input type="tel" name="shop_phone" value={s.shop_phone} onChange={(e) => setS({ ...s, shop_phone: e.target.value })} maxLength={30} placeholder="054-xxx-xxx" />
            </label>
          </div>
          <p className="muted small" style={{ margin: 0 }}>ระบบไม่ให้จองเวลาที่ผ่านไปแล้ว และไม่ให้จองเกินจำนวนคิวสูงสุดต่อช่วงเวลา (ทั้งหน้าลูกค้าและพนักงาน)</p>
        </section>

        <section className="card stack">
          <h2>เวลาเปิด-ปิดร้าน และวันหยุดประจำสัปดาห์</h2>
          <div className="scroll-x">
            <table className="table" data-testid="weekly">
              <thead><tr><th>วัน</th><th>เปิดร้าน</th><th>เวลาเปิด</th><th>เวลาปิด</th></tr></thead>
              <tbody>
                {ORDER.map((wd) => {
                  const w = weekly.find((x) => x.weekday === wd)!;
                  return (
                    <tr key={wd} data-weekday={wd}>
                      <td>{DOW[wd]}</td>
                      <td><label className="check"><input type="checkbox" checked={w.is_open} onChange={(e) => setW(wd, { is_open: e.target.checked })} aria-label={`เปิดร้านวัน${DOW[wd]}`} /><span>{w.is_open ? 'เปิด' : 'หยุด'}</span></label></td>
                      <td><TimeSelect value={w.open_time} disabled={!w.is_open} onChange={(v) => setW(wd, { open_time: v })} label={`เวลาเปิดวัน${DOW[wd]}`} /></td>
                      <td><TimeSelect value={w.close_time} disabled={!w.is_open} onChange={(v) => setW(wd, { close_time: v })} label={`เวลาปิดวัน${DOW[wd]}`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card stack">
          <h2>บริการที่เปิดให้จอง</h2>
          <div className="chips">
            {services.map((sv) => (
              <label key={sv.code} className="check" style={{ marginRight: 14 }}>
                <input type="checkbox" checked={sv.active} onChange={(e) => setServices((xs) => xs.map((x) => (x.code === sv.code ? { ...x, active: e.target.checked } : x)))} />
                <span>{sv.name_th}</span>
              </label>
            ))}
          </div>
        </section>

        {msg && <div className={`alert alert-${msg.kind}`} role="status">{msg.text}</div>}
        <div><button type="submit" className="btn-primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}</button></div>
      </form>

      <section className="card stack">
        <h2>วันหยุดพิเศษ</h2>
        <form className="row" onSubmit={addHoliday}>
          <input type="date" value={hDate} min={props.today} onChange={(e) => setHDate(e.target.value)} aria-label="วันที่หยุด" style={{ width: 'auto' }} />
          <input type="text" value={hNote} onChange={(e) => setHNote(e.target.value)} placeholder="เหตุผล เช่น วันสงกรานต์" maxLength={100} aria-label="หมายเหตุวันหยุด" style={{ flex: 1, minWidth: 180 }} />
          <button type="submit" className="btn-primary">เพิ่มวันหยุด</button>
        </form>
        {hMsg && <div className={`alert alert-${hMsg.kind}`} role="status">{hMsg.text}</div>}
        {holidays.length === 0 ? <p className="muted" style={{ margin: 0 }}>ยังไม่มีวันหยุดพิเศษ</p> : (
          <table className="table" data-testid="holidays">
            <tbody>
              {holidays.map((h) => (
                <tr key={h.holiday_date}>
                  <td>{th(h.holiday_date)}</td><td className="muted">{h.note}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn-sm" onClick={() => removeHoliday(h.holiday_date)}>ลบ</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
