import { NextResponse } from 'next/server';
import { login, makeSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { handle, json, readJson } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readJson(req);
    const r = await login(String(b.username || ''), String(b.password || ''));
    if (!r.ok) return json({ error: r.message }, 401);
    const res = NextResponse.json({ ok: true, display_name: r.staff.display_name });
    res.cookies.set(SESSION_COOKIE, makeSessionToken(r.staff.id), sessionCookieOptions());
    return res;
  });
}
