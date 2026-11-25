import { NextResponse } from 'next/server';
import { BookingError } from './booking';

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function handle(fn: () => Promise<unknown>) {
  try {
    const r = await fn();
    return r instanceof Response ? r : json(r);
  } catch (e) {
    if (e instanceof BookingError) return json({ error: e.message, code: e.code }, e.status);
    console.error(e);
    return json({ error: 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง', code: 'server' }, 500);
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? b : {};
  } catch {
    throw new BookingError('bad_json', 'ข้อมูลไม่ถูกต้อง');
  }
}

export const unauthorized = () => json({ error: 'กรุณาเข้าสู่ระบบ', code: 'auth' }, 401);
