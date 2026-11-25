import { staffFromRequest } from '@/lib/auth';
import { createAppointment, listAppointments } from '@/lib/booking';
import { handle, readJson, unauthorized } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const staff = await staffFromRequest(req);
  if (!staff) return unauthorized();
  const p = new URL(req.url).searchParams;
  return handle(() => listAppointments(p.get('from') || '', p.get('to') || ''));
}
export async function POST(req: Request) {
  const staff = await staffFromRequest(req);
  if (!staff) return unauthorized();
  return handle(async () => {
    const b = await readJson(req);
    return createAppointment(
      { service_code: b.service_code, date: b.date, time: b.time, full_name: b.full_name, phone: b.phone, note: b.note, pdpa_consent: b.pdpa_consent },
      { source: 'staff', staffId: staff.id },
    );
  });
}
