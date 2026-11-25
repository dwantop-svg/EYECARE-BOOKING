'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Appt = {
  id: number; queue_no: string; appt_date: string; start_time: string; slot_minutes: number;
  service_code: string; service_name: string; full_name: string; phone: string; note: string;
  status: Status; customer_row: number | null; match_status: string; source: string;
  customer_code: string | null; c_first_name: string | null; c_last_name: string | null; c_member_type: string | null;
};
type Status = 'pending' | 'confirmed' | 'arrived' | 'no_show' | 'cancelled';
type Cust = { legacy_row: number; customer_code: string; first_name: string; last_name: string; phone: string; member_type: string; points: number };
type Weekly = { weekday: number; is_open: boolean; open_time: string; close_time: string };

const STATUS: { k: Status; t: string }[] = [
  { k: 'pending', t: 'รอยืนยัน' },
  { k: 'confirmed', t: 'ยืนยันแล้ว' },
  { k: 'arrived', t: 'มาแล้ว' },
  { k: 'no_show', t: 'ไม่มา' },
  { k: 'cancelled', t: 'ยกเลิก' },
];
const STATUS_T = Object.fromEntries(STATUS.map((s) => [s.k, s.t])) as Record<Status, string>;
const MATCH_T: Record<string, string> = {
  matched: 'ลูกค้าเดิม', multiple: 'เบอร์ตรงหลายคน', new_pending: 'ลูกค้าใหม่ (รอยืนยัน)', new_confirmed: 'ลูกค้าใหม่ (ยืนยันแล้ว)',
};
const DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const DOW_S = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dow = (d: string) => new Date(d + 'T00:00:00Z').getUTCDay();
const monday = (d: string) => addDays(d, dow(d) === 0 ? -6 : 1 - dow(d));
const thShort = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${MON[m - 1]} ${String(y + 543).slice(2)}`; };
const thLong = (d: string) => `วัน${DOW[dow(d)]}ที่ ${thShort(d)}`;
const fmtPhone = (p: string) => (p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { window.location.href = '/staff/login'; throw new Error('auth'); }
  if (!r.ok) throw new Error(j.error || 'เกิดข้อผิดพลาด');
  return j as T;
}

export function QueueBoard(props: {
  today: string; initialDate: string; initialView: 'day' | 'week';
  services: { code: string; name_th: string }[]; weekly: Weekly[]; holidays: Record<string, string>;
}) {
  const { today } = props;
  const [view, setView] = useState<'day' | 'week'>(props.initialView);
  const [date, setDate] = useState(props.initialDate);
  const [items, setItems] = useState<Appt[] | null>(null);
  const [filter, setFilter] = useState<'all' | Status | 'new'>('all');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [linkFor, setLinkFor] = useState<Appt | null>(null);

  const range = useMemo(() => (view === 'day' ? { from: date, to: date } : { from: monday(date), to: addDays(monday(date), 6) }), [view, date]);

  const load = useCallback(async () => {
    try {
      setItems(await api<Appt[]>(`/api/staff/appointments?from=${range.from}&to=${range.to}`));
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    }
  }, [range.from, range.to]);

  useEffect(() => { setItems(null); load(); }, [load]);
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set('date', date);
    u.searchParams.set('view', view);
    window.history.replaceState(null, '', u);
  }, [date, view]);
  // รีเฟรชอัตโนมัติทุก 60 วินาที เพื่อเห็นคิวที่ลูกค้าจองเข้ามาใหม่
  useEffect(() => { const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  async function changeStatus(a: Appt, status: Status) {
    setMsg(null);
    try {
      await api(`/api/staff/appointments/${a.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setItems((xs) => xs && xs.map((x) => (x.id === a.id ? { ...x, status } : x)));
      setMsg({ kind: 'ok', text: `คิว ${a.queue_no} → ${STATUS_T[status]}` });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
      load();
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, new: 0 };
    for (const s of STATUS) c[s.k] = 0;
    for (const a of items || []) { c.all++; c[a.status]++; if (a.match_status === 'new_pending' || a.match_status === 'multiple') c.new++; }
    return c;
  }, [items]);
  const shown = (items || []).filter((a) => filter === 'all' || (filter === 'new' ? a.match_status === 'new_pending' || a.match_status === 'multiple' : a.status === filter));

  const step = view === 'day' ? 1 : 7;
  const dayClosed = (d: string) => props.holidays[d] ? `วันหยุดพิเศษ${props.holidays[d] ? ': ' + props.holidays[d] : ''}` : !props.weekly.find((w) => w.weekday === dow(d))?.is_open ? 'วันหยุดประจำสัปดาห์' : '';

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row">
        <h1>คิวนัดหมาย</h1>
        <span className="spacer" />
        <button className="btn-primary" onClick={() => setAddOpen(true)} data-testid="add-appt">+ เพิ่มคิว (ลูกค้าโทรจอง)</button>
      </div>

      <div className="toolbar">
        <div className="seg" role="group" aria-label="มุมมอง">
          <button aria-pressed={view === 'day'} onClick={() => setView('day')}>รายวัน</button>
          <button aria-pressed={view === 'week'} onClick={() => setView('week')}>รายสัปดาห์</button>
        </div>
        <button onClick={() => setDate(addDays(date, -step))} aria-label="ก่อนหน้า">‹</button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="เลือกวันที่" />
        <button onClick={() => setDate(addDays(date, step))} aria-label="ถัดไป">›</button>
        <button onClick={() => setDate(today)} disabled={date === today}>วันนี้</button>
        <span className="spacer" />
        <button onClick={load} className="btn-sm">รีเฟรช</button>
      </div>

      <div className="muted" data-testid="range-label">
        {view === 'day' ? thLong(date) : `สัปดาห์ ${thShort(range.from)} – ${thShort(range.to)}`}
        {view === 'day' && dayClosed(date) && <span className="badge st-pending" style={{ marginLeft: 8 }}>{dayClosed(date)}</span>}
      </div>

      <div className="chips" role="group" aria-label="กรองสถานะ">
        <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>ทั้งหมด <b>{counts.all}</b></button>
        {STATUS.map((s) => (
          <button key={s.k} className="chip" aria-pressed={filter === s.k} onClick={() => setFilter(s.k)}>{s.t} <b>{counts[s.k]}</b></button>
        ))}
        <button className="chip" aria-pressed={filter === 'new'} onClick={() => setFilter('new')}>ลูกค้าใหม่/รอเลือก <b>{counts.new}</b></button>
      </div>

      {msg && <div className={`alert alert-${msg.kind}`} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</div>}

      {items === null ? (
        <div className="empty">กำลังโหลด…</div>
      ) : view === 'day' ? (
        shown.length === 0 ? (
          <div className="empty">ไม่มีคิว{filter !== 'all' ? 'ในสถานะนี้' : 'ในวันนี้'}</div>
        ) : (
          <div className="appt-list" data-testid="day-list">
            {shown.map((a) => <ApptCard key={a.id} a={a} onStatus={changeStatus} onLink={() => setLinkFor(a)} />)}
          </div>
        )
      ) : (
        <div className="week" data-testid="week-grid">
          {Array.from({ length: 7 }, (_, i) => addDays(range.from, i)).map((d) => {
            const list = shown.filter((a) => a.appt_date === d);
            const closed = dayClosed(d);
            return (
              <div key={d} className={`wday${d === today ? ' today' : ''}${closed ? ' off' : ''}`} data-date={d}>
                <button className="wday-head" onClick={() => { setDate(d); setView('day'); }} title="ดูรายวัน">
                  <b>{DOW_S[dow(d)]} {thShort(d).split(' ').slice(0, 2).join(' ')}</b>
                  <span className="muted small">{list.filter((a) => a.status !== 'cancelled').length} คิว</span>
                </button>
                {closed && <span className="muted small">{closed}</span>}
                {list.map((a) => (
                  <Link key={a.id} href={`/staff?date=${d}&view=day`} onClick={(e) => { e.preventDefault(); setDate(d); setView('day'); }} className={`witem st-${a.status}`} style={{ textDecoration: a.status === 'cancelled' ? 'line-through' : 'none' }}>
                    <span className="mono">{a.start_time}</span><span>{a.full_name}</span>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {addOpen && (
        <AddDialog
          services={props.services}
          defaultDate={date < today ? today : date}
          onClose={() => setAddOpen(false)}
          onCreated={(a) => { setAddOpen(false); setMsg({ kind: 'ok', text: `เพิ่มคิว ${a.queue_no} แล้ว (${MATCH_T[a.match_status]})` }); setDate(a.appt_date); setView('day'); load(); }}
        />
      )}
      {linkFor && (
        <LinkDialog appt={linkFor} onClose={() => setLinkFor(null)} onDone={(text) => { setLinkFor(null); setMsg({ kind: 'ok', text }); load(); }} />
      )}
    </div>
  );
}

function ApptCard({ a, onStatus, onLink }: { a: Appt; onStatus: (a: Appt, s: Status) => void; onLink: () => void }) {
  const end = (() => { const [h, m] = a.start_time.split(':').map(Number); const t = h * 60 + m + a.slot_minutes; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; })();
  return (
    <article className={`appt${a.status === 'cancelled' ? ' is-cancelled' : ''}`} data-queue={a.queue_no} data-id={a.id}>
      <div>
        <div className="t">{a.start_time}</div>
        <div className="q">–{end}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="who">{a.full_name}</span>
          <span className={`badge st-${a.status}`}>{STATUS_T[a.status]}</span>
        </div>
        <div className="meta">
          <span className="mono">คิว {a.queue_no}</span>
          <span>{a.service_name}</span>
          <a href={`tel:${a.phone}`} className="mono">{fmtPhone(a.phone)}</a>
          <span>{a.source === 'staff' ? 'พนักงานเพิ่ม' : 'จองออนไลน์'}</span>
        </div>
        <div className="meta" style={{ marginTop: 4 }}>
          {a.match_status === 'matched' && a.customer_row ? (
            <Link href={`/staff/customers/${a.customer_row}`} className={`badge m-matched`} data-testid="customer-link">
              {a.customer_code} · {a.c_first_name} {a.c_last_name} · ดูประวัติ ›
            </Link>
          ) : (
            <span className={`badge m-${a.match_status}`}>{MATCH_T[a.match_status]}</span>
          )}
          {a.match_status !== 'matched' && <button className="btn-sm" onClick={onLink}>ผูกกับลูกค้าเดิม</button>}
          {a.match_status === 'matched' && <button className="btn-sm" onClick={onLink}>เปลี่ยนลูกค้า</button>}
        </div>
        {a.note && <div className="note">{a.note}</div>}
      </div>
      <div className="act">
        <select value={a.status} onChange={(e) => onStatus(a, e.target.value as Status)} aria-label={`สถานะคิว ${a.queue_no}`}>
          {STATUS.map((s) => <option key={s.k} value={s.k}>{s.t}</option>)}
        </select>
      </div>
    </article>
  );
}

function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const h = () => cb.current();
    d.addEventListener('close', h);
    return () => d.removeEventListener('close', h);
  }, []);
  return ref;
}

function AddDialog({ services, defaultDate, onClose, onCreated }: {
  services: { code: string; name_th: string }[]; defaultDate: string; onClose: () => void;
  onCreated: (a: { queue_no: string; appt_date: string; match_status: string }) => void;
}) {
  const ref = useDialog(onClose);
  const [service, setService] = useState(services[0]?.code || '');
  const [date, setDate] = useState(defaultDate);
  const [slots, setSlots] = useState<{ time: string; remaining: number; available: boolean; reason?: string }[] | null>(null);
  const [dayNote, setDayNote] = useState('');
  const [time, setTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [lookup, setLookup] = useState<{ match_status: string; customers: Cust[] } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSlots(null); setTime(''); setDayNote('');
    fetch(`/api/public/slots?date=${date}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      setSlots(j.slots || []);
      setDayNote(j.state === 'holiday' ? 'วันหยุดพิเศษ' : j.state === 'closed' ? 'วันหยุดประจำสัปดาห์' : j.state === 'past' ? 'วันที่ผ่านไปแล้ว' : j.state === 'beyond' ? 'เกินช่วงที่เปิดให้จอง' : '');
    });
  }, [date]);

  const digits = phone.replace(/\D/g, '');
  useEffect(() => {
    if (!/^0\d{8,9}$/.test(digits)) { setLookup(null); return; }
    const t = setTimeout(() => { api<{ match_status: string; customers: Cust[] }>(`/api/staff/lookup?phone=${digits}`).then(setLookup).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [digits]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const a = await api<{ queue_no: string; appt_date: string; match_status: string }>('/api/staff/appointments', {
        method: 'POST', body: JSON.stringify({ service_code: service, date, time, full_name: name, phone: digits, note, pdpa_consent: consent }),
      });
      onCreated(a);
    } catch (e2) {
      setErr((e2 as Error).message); setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="add-title">
      <form className="dlg-body" onSubmit={submit}>
        <h2 id="add-title">เพิ่มคิว (ลูกค้าโทรมาจอง)</h2>
        <label className="field">เบอร์โทรลูกค้า
          <input type="tel" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="08x-xxx-xxxx" required autoFocus />
        </label>
        {lookup && (
          <div className={`alert ${lookup.match_status === 'matched' ? 'alert-ok' : 'alert-warn'}`} data-testid="lookup">
            {lookup.match_status === 'matched' && <>ลูกค้าเดิม: {lookup.customers[0].customer_code} {lookup.customers[0].first_name} {lookup.customers[0].last_name} — ระบบจะผูกให้อัตโนมัติ{' '}
              <button type="button" className="btn-sm" onClick={() => setName(`${lookup.customers[0].first_name} ${lookup.customers[0].last_name}`.trim())}>ใช้ชื่อนี้</button></>}
            {lookup.match_status === 'multiple' && <>เบอร์นี้ตรงกับลูกค้าเดิม {lookup.customers.length} คน ({lookup.customers.map((c) => `${c.customer_code} ${c.first_name}`).join(', ')}) — หลังบันทึกให้กด “ผูกกับลูกค้าเดิม” เพื่อเลือก</>}
            {lookup.match_status === 'new_pending' && <>ไม่พบเบอร์นี้ในข้อมูลลูกค้าเดิม — จะบันทึกเป็น “ลูกค้าใหม่ (รอยืนยัน)”</>}
          </div>
        )}
        <label className="field">ชื่อ-นามสกุล
          <input type="text" name="full_name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </label>
        <div className="grid2">
          <label className="field">บริการ
            <select name="service" value={service} onChange={(e) => setService(e.target.value)}>
              {services.map((s) => <option key={s.code} value={s.code}>{s.name_th}</option>)}
            </select>
          </label>
          <label className="field">วันที่
            <input type="date" name="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} required />
          </label>
        </div>
        <div className="field">
          <span>ช่วงเวลา {dayNote && <span className="badge st-pending">{dayNote}</span>}</span>
          {slots === null ? <span className="muted">กำลังโหลด…</span> : slots.length === 0 ? <span className="muted">ไม่มีช่วงเวลาให้จองในวันนี้</span> : (
            <div className="times">
              {slots.map((s) => (
                <button type="button" key={s.time} className="pick time" disabled={!s.available} aria-pressed={time === s.time} onClick={() => setTime(s.time)} data-time={s.time}>
                  <span className="mono">{s.time}</span>
                  <span className="sub">{s.reason === 'past' ? 'ผ่านแล้ว' : s.reason === 'full' ? 'เต็ม' : `ว่าง ${s.remaining}`}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="field">หมายเหตุ
          <textarea name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </label>
        <label className="check">
          <input type="checkbox" name="pdpa" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>แจ้งลูกค้าทางโทรศัพท์แล้ว และลูกค้ายินยอมให้เก็บข้อมูลเพื่อการนัดหมาย (PDPA)</span>
        </label>
        {err && <div className="alert alert-error" role="alert">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>ยกเลิก</button>
          <button type="submit" className="btn-primary" disabled={busy || !time || !consent}>{busy ? 'กำลังบันทึก…' : 'บันทึกคิว'}</button>
        </div>
      </form>
    </dialog>
  );
}

function LinkDialog({ appt, onClose, onDone }: { appt: Appt; onClose: () => void; onDone: (text: string) => void }) {
  const ref = useDialog(onClose);
  const [q, setQ] = useState(appt.phone);
  const [hits, setHits] = useState<Cust[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => { api<Cust[]>(`/api/staff/customers?q=${encodeURIComponent(q)}`).then(setHits).catch((e) => setErr(e.message)); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  async function link(row: number | null) {
    try {
      await api(`/api/staff/appointments/${appt.id}`, { method: 'PATCH', body: JSON.stringify({ customer_row: row }) });
      onDone(row === null ? `คิว ${appt.queue_no}: ยืนยันเป็นลูกค้าใหม่แล้ว` : `คิว ${appt.queue_no}: ผูกกับลูกค้าเดิมแล้ว`);
    } catch (e) { setErr((e as Error).message); }
  }
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="link-title">
      <div className="dlg-body">
        <h2 id="link-title">ผูกคิว {appt.queue_no} กับลูกค้าเดิม</h2>
        <p className="muted small" style={{ margin: 0 }}>ผู้จอง: {appt.full_name} · {fmtPhone(appt.phone)} — ค้นจากชื่อ เบอร์ หรือรหัสลูกค้า (ระบบไม่สร้างลูกค้าใหม่ซ้ำ)</p>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อ / เบอร์ / M000123" aria-label="ค้นหาลูกค้า" />
        <div className="cust-hits">
          {hits?.map((c) => (
            <button key={c.legacy_row} className="cust-hit" onClick={() => link(c.legacy_row)}>
              <span className="mono small">{c.customer_code}</span>
              <span>{c.first_name} {c.last_name} <span className="muted small mono">{fmtPhone(c.phone)}</span></span>
            </button>
          ))}
          {hits && hits.length === 0 && q.trim().length >= 2 && <span className="muted small">ไม่พบลูกค้า</span>}
        </div>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          {appt.match_status !== 'new_confirmed' && appt.match_status !== 'matched' ? (
            <button className="btn-ghost" onClick={() => link(null)}>ยืนยันว่าเป็นลูกค้าใหม่</button>
          ) : <span />}
          <button onClick={onClose}>ปิด</button>
        </div>
      </div>
    </dialog>
  );
}
