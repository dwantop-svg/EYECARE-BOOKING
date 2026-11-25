import { staffFromRequest } from '@/lib/auth';
import { listHolidays, loadConfig, saveSettings, type SettingsInput } from '@/lib/booking';
import { handle, readJson, unauthorized } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const staff = await staffFromRequest(req);
  if (!staff) return unauthorized();
  return handle(async () => {
    const c = await loadConfig();
    return { settings: c.settings, weekly: c.weekly, services: c.services, holidays: await listHolidays() };
  });
}
export async function PUT(req: Request) {
  const staff = await staffFromRequest(req);
  if (!staff) return unauthorized();
  return handle(async () => {
    await saveSettings((await readJson(req)) as unknown as SettingsInput);
    return { ok: true };
  });
}
