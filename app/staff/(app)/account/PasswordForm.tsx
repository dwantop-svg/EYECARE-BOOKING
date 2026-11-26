'use client';
import { useState } from 'react';

const MIN = 8;

export function PasswordForm({ username, displayName }: { username: string; displayName: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < MIN) return setMsg({ kind: 'error', text: `รหัสผ่านใหม่ต้องยาวอย่างน้อย ${MIN} ตัวอักษร` });
    if (next !== confirm) return setMsg({ kind: 'error', text: 'รหัสผ่านใหม่ทั้ง 2 ช่องไม่ตรงกัน' });
    setBusy(true);
    const r = await fetch('/api/staff/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current, next }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.status === 401) { window.location.href = '/staff/login'; return; }
    if (!r.ok) return setMsg({ kind: 'error', text: j.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ' });
    setCurrent(''); setNext(''); setConfirm('');
    setMsg({ kind: 'ok', text: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว ครั้งหน้าให้เข้าสู่ระบบด้วยรหัสใหม่' });
  }

  const type = show ? 'text' : 'password';
  return (
    <div style={{ maxWidth: 460 }}>
      <h1>บัญชีของฉัน</h1>
      <p className="muted">{displayName} · ชื่อผู้ใช้ <strong>{username}</strong></p>
      <form className="card stack" onSubmit={submit}>
        <h2 style={{ fontSize: '1.1rem', margin: 0 }}>เปลี่ยนรหัสผ่าน</h2>
        <label className="field">รหัสผ่านปัจจุบัน
          <input type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="field">รหัสผ่านใหม่ (อย่างน้อย {MIN} ตัวอักษร)
          <input type={type} autoComplete="new-password" minLength={MIN} value={next} onChange={(e) => setNext(e.target.value)} required />
        </label>
        <label className="field">ยืนยันรหัสผ่านใหม่
          <input type={type} autoComplete="new-password" minLength={MIN} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> แสดงรหัสผ่าน
        </label>
        {msg && <div className={`alert alert-${msg.kind}`} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</div>}
        <button type="submit" className="btn-primary btn-block" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}</button>
      </form>
    </div>
  );
}
