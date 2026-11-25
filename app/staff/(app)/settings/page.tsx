import { listHolidays, loadConfig } from '@/lib/booking';
import { bkkNow } from '@/lib/time';
import { SettingsForm } from './SettingsForm';
export const dynamic = 'force-dynamic';
export default async function SettingsPage() {
  const cfg = await loadConfig();
  return <SettingsForm settings={cfg.settings} weekly={cfg.weekly} services={cfg.services} holidays={await listHolidays()} today={bkkNow().date} />;
}
