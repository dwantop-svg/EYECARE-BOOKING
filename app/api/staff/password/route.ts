import { changePassword, staffFromRequest } from '@/lib/auth';
import { handle, json, readJson, unauthorized } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const staff = await staffFromRequest(req);
  if (!staff) return unauthorized();
  return handle(async () => {
    const b = await readJson(req);
    const r = await changePassword(staff.id, b.current as string, b.next as string);
    return r.ok ? { ok: true } : json({ error: r.message, code: 'password' }, 400);
  });
}
