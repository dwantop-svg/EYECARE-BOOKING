import { staffFromRequest } from '@/lib/auth';
import { addHoliday, listHolidays, removeHoliday } from '@/lib/booking';
import { handle, readJson, unauthorized } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const staff = await staffFromRequest(req);
  if (!staff) return unauthorized();
  return handle(async () => {
    const b = await readJson(req);
    const r = await addHoliday(String(b.date || ''), String(b.note || ''));
    return { ...r, holidays: await listHolidays() };
  });
}
export async function DELETE(req: Request) {
  const staff = await staffFromRequest(req);
  if (!staff) return unauthorized();
  return handle(async () => {
    await removeHoliday(new URL(req.url).searchParams.get('date') || '');
    return { holidays: await listHolidays() };
  });
}
