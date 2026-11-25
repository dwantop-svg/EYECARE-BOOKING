'use client';
import { useState } from 'react';
import { GlassesIcon } from '@/components/Brand';

export function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const r = await fetch('/api/staff/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || 'เข้าสู่ระบบไม่สำเร็จ'); setBusy(false); return; }
    window.location.href = '/staff';
  }
  return (
    <main className="wrap" style={{ maxWidth: 400, paddingTop: 64 }}>
      <form className="card stack" onSubmit={submit}>
        <div className="brand"><GlassesIcon /><div><div className="brand-name">Eyecare Optic ลำปาง</div><div className="muted small">ระบบพนักงาน</div></div></div>
        <h1 style={{ fontSize: '1.3rem' }}>เข้าสู่ระบบ</h1>
        <label className="field">ชื่อผู้ใช้<input type="text" name="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></label>
        <label className="field">รหัสผ่าน<input type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {err && <div className="alert alert-error" role="alert">{err}</div>}
        <button type="submit" className="btn-primary btn-block" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
      </form>
    </main>
  );
}
