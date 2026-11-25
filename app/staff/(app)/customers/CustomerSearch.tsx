'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
type Cust = { legacy_row: number; customer_code: string; first_name: string; last_name: string; phone: string; member_type: string; points: number };
const fmt = (p: string) => (p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p);
export function CustomerSearch() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Cust[] | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/staff/customers?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      if (r.status === 401) { window.location.href = '/staff/login'; return; }
      setHits(await r.json());
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <h1>ค้นหาลูกค้า</h1>
      <p className="muted" style={{ margin: 0 }}>ค้นจากข้อมูลลูกค้าเดิม (อ่านอย่างเดียว) ด้วยชื่อ นามสกุล เบอร์โทร หรือรหัสลูกค้า แล้วกดเพื่อดูประวัติและการจองคิว</p>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="พิมพ์ชื่อ เบอร์โทร หรือรหัส M000123" aria-label="ค้นหาลูกค้า" autoFocus />
      <div className="appt-list">
        {hits?.map((c) => (
          <Link key={c.legacy_row} href={`/staff/customers/${c.legacy_row}`} className="card row" style={{ textDecoration: 'none', color: 'inherit', padding: '10px 14px' }}>
            <span className="mono muted small" style={{ width: '5.2rem' }}>{c.customer_code}</span>
            <b>{c.first_name} {c.last_name}</b>
            <span className="spacer" />
            {c.points > 0 && <span className="badge m-matched mono">{c.points.toLocaleString()} แต้ม</span>}
            <span className="mono">{c.phone ? fmt(c.phone) : '—'}</span>
          </Link>
        ))}
        {hits && hits.length === 0 && <div className="empty">ไม่พบลูกค้า</div>}
        {hits && hits.length === 20 && <p className="muted small">แสดง 20 รายการแรก พิมพ์ให้เจาะจงขึ้นเพื่อหาเพิ่ม</p>}
      </div>
    </div>
  );
}
