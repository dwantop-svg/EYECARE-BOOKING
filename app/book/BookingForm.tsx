'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brand } from '@/components/Brand';

type Day = { date: string; state: string; note?: string; available: number };
type Service = { code: string; name_th: string };
type Slot = { time: string; remaining: number; available: boolean; reason?: string };

const SERVICE_HINT: Record<string, string> = {
  eye_exam: 'ตรวจวัดค่าสายตาอย่างละเอียด',
  pickup: 'มารับแว่นที่สั่งตัดไว้',
  repair: 'ปรับทรง ขันน็อต เปลี่ยนแป้นจมูก',
  lens_consult: 'เลือกเลนส์ให้เหมาะกับการใช้งาน',
};
const DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const dowOf = (d: string) => new Date(d + 'T00:00:00Z').getUTCDay();

export function BookingForm({ pdpaVersion }: { pdpaVersion: string }) {
  const router = useRouter();
  const [days, setDays] = useState<Day[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [shop, setShop] = useState({ shop_name: 'Eyecare Optic ลำปาง', shop_phone: '', slot_minutes: 30 });
  const [loadErr, setLoadErr] = useState('');
  const [service, setService] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [time, setTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const timesRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  async function loadDays() {
    try {
      const r = await fetch('/api/public/days', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setDays(j.days);
      setServices(j.services);
      setShop(j.settings);
    } catch {
      setLoadErr('โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง');
    }
  }
  async function loadSlots(d: string) {
    setSlots(null);
    const r = await fetch(`/api/public/slots?date=${d}`, { cache: 'no-store' });
    const j = await r.json();
    setSlots(r.ok ? j.slots : []);
  }
  useEffect(() => { loadDays(); }, []);
  useEffect(() => {
    if (!date) return;
    loadSlots(date);
  }, [date]);

  const firstOpen = useMemo(() => days?.find((d) => d.state === 'open' && d.available > 0)?.date, [days]);

  function pickDate(d: string) {
    setDate(d);
    setTime('');
    setErr('');
    setTimeout(() => timesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }
  function pickTime(t: string) {
    setTime(t);
    setErr('');
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  const phoneDigits = phone.replace(/\D/g, '');
  const ready = service && date && time && name.trim().length >= 2 && /^0\d{8,9}$/.test(phoneDigits) && consent;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!service) return setErr('กรุณาเลือกบริการ');
    if (!date || !time) return setErr('กรุณาเลือกวันและเวลา');
    if (name.trim().length < 2) return setErr('กรุณากรอกชื่อ-นามสกุล');
    if (!/^0\d{8,9}$/.test(phoneDigits)) return setErr('เบอร์โทรไม่ถูกต้อง (ตัวอย่าง 081-234-5678)');
    if (!consent) return setErr('กรุณาติ๊กยินยอมให้เก็บข้อมูลส่วนบุคคล (PDPA) ก่อนยืนยัน');
    setBusy(true);
    try {
      const r = await fetch('/api/public/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_code: service, date, time, full_name: name, phone: phoneDigits, note, pdpa_consent: consent, website: hp }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error || 'จองไม่สำเร็จ');
        if (j.code === 'full' || j.code === 'past') { setTime(''); loadSlots(date); loadDays(); }
        setBusy(false);
        return;
      }
      router.push(`/book/done/${j.ref_token}`);
    } catch {
      setErr('เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง');
      setBusy(false);
    }
  }

  return (
    <main className="wrap narrow stack" style={{ gap: 18 }}>
      <header className="stack" style={{ gap: 8 }}>
        <Brand name={shop.shop_name} />
        <h1>จองคิวล่วงหน้า</h1>
        <p className="muted" style={{ margin: 0 }}>
          เลือกบริการ วัน และเวลาที่สะดวก ช่วงละ {shop.slot_minutes} นาที ร้านจะติดต่อยืนยันคิวทางโทรศัพท์
        </p>
      </header>

      {loadErr && <div className="alert alert-error" role="alert">{loadErr}</div>}

      <form onSubmit={submit} className="stack" style={{ gap: 18 }} noValidate>
        <section className="card step" aria-labelledby="s1">
          <div className="step-title" id="s1"><span className="step-num">1</span>เลือกบริการ</div>
          <div className="picks" role="group" aria-label="บริการ">
            {services.map((s) => (
              <button type="button" key={s.code} className="pick" aria-pressed={service === s.code} onClick={() => { setService(s.code); setErr(''); }} data-service={s.code}>
                {s.name_th}
                {SERVICE_HINT[s.code] && <span className="sub">{SERVICE_HINT[s.code]}</span>}
              </button>
            ))}
            {!services.length && !loadErr && <span className="muted">กำลังโหลด…</span>}
          </div>
        </section>

        <section className="card step" aria-labelledby="s2">
          <div className="step-title" id="s2"><span className="step-num">2</span>เลือกวัน</div>
          {days === null && !loadErr && <span className="muted">กำลังโหลด…</span>}
          {days && !firstOpen && <div className="alert alert-warn">ช่วงนี้คิวเต็มทุกวัน กรุณาโทรสอบถามร้าน{shop.shop_phone ? ` ${shop.shop_phone}` : ''}</div>}
          {days && (
            <div className="days" role="group" aria-label="วันที่">
              {days.map((d) => {
                const [, m, dd] = d.date.split('-').map(Number);
                const ok = d.state === 'open' && d.available > 0;
                const sub = d.state === 'holiday' ? 'หยุด' : d.state === 'closed' ? 'ปิด' : d.available > 0 ? `ว่าง ${d.available}` : 'เต็ม';
                return (
                  <button type="button" key={d.date} className="pick day" disabled={!ok} aria-pressed={date === d.date} onClick={() => pickDate(d.date)} data-date={d.date}
                    title={d.state === 'holiday' && d.note ? d.note : undefined}>
                    <span className="small muted">{DOW[dowOf(d.date)]}</span>
                    <span className="dnum">{dd}</span>
                    <span className="small">{MON[m - 1]}</span>
                    <span className="sub">{sub}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="card step" aria-labelledby="s3" ref={timesRef}>
          <div className="step-title" id="s3"><span className="step-num">3</span>เลือกช่วงเวลา</div>
          {!date && <span className="muted small">เลือกวันก่อน แล้วช่วงเวลาที่ว่างจะแสดงที่นี่</span>}
          {date && slots === null && <span className="muted">กำลังโหลด…</span>}
          {date && slots && slots.length === 0 && <span className="muted">วันนี้ไม่มีช่วงเวลาให้จอง</span>}
          {date && slots && slots.length > 0 && (
            <div className="times" role="group" aria-label="ช่วงเวลา">
              {slots.map((s) => (
                <button type="button" key={s.time} className="pick time" disabled={!s.available} aria-pressed={time === s.time} onClick={() => pickTime(s.time)} data-time={s.time}>
                  <span className="mono">{s.time}</span>
                  <span className="sub">{s.reason === 'past' ? 'ผ่านไปแล้ว' : s.reason === 'full' ? 'เต็ม' : `ว่าง ${s.remaining}`}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card step" aria-labelledby="s4" ref={formRef}>
          <div className="step-title" id="s4"><span className="step-num">4</span>ข้อมูลผู้จอง</div>
          <label className="field">ชื่อ-นามสกุล
            <input type="text" name="full_name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
          </label>
          <label className="field">เบอร์โทร
            <input type="tel" name="phone" inputMode="tel" autoComplete="tel" placeholder="08x-xxx-xxxx" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={15} required />
          </label>
          <label className="field">หมายเหตุ (ไม่บังคับ)
            <textarea name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="เช่น ใส่คอนแทคเลนส์อยู่ / มากัน 2 คน" />
          </label>
          <div className="hp" aria-hidden="true">
            <label>เว็บไซต์<input type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></label>
          </div>
          <details className="small">
            <summary style={{ cursor: 'pointer', color: 'var(--accent)' }}>อ่านรายละเอียดการเก็บข้อมูลส่วนบุคคล</summary>
            <div className="muted" style={{ marginTop: 6 }}>
              {shop.shop_name} เก็บชื่อ-นามสกุล เบอร์โทร และหมายเหตุของท่าน เพื่อใช้นัดหมาย ติดต่อยืนยันคิว
              และเชื่อมกับประวัติการใช้บริการของท่านที่ร้าน (ถ้ามี) เท่านั้น ไม่เปิดเผยแก่บุคคลภายนอก
              ท่านขอดู แก้ไข หรือขอลบข้อมูลได้โดยติดต่อร้าน{shop.shop_phone ? ` โทร ${shop.shop_phone}` : ''} (ฉบับ {pdpaVersion})
            </div>
          </details>
          <label className="check">
            <input type="checkbox" name="pdpa" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>ข้าพเจ้ายินยอมให้ร้านเก็บและใช้ข้อมูลส่วนบุคคลข้างต้นเพื่อการนัดหมาย ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA)</span>
          </label>
        </section>

        {err && <div className="alert alert-error" role="alert">{err}</div>}
        <button type="submit" className="btn-primary btn-block" disabled={busy || !ready} aria-disabled={busy || !ready}>
          {busy ? 'กำลังจอง…' : 'ยืนยันการจอง'}
        </button>
        {!ready && <p className="muted small" style={{ margin: '-8px 0 0', textAlign: 'center' }}>เลือกบริการ วัน เวลา กรอกข้อมูล และติ๊กยินยอม PDPA ให้ครบเพื่อยืนยัน</p>}
      </form>
    </main>
  );
}
