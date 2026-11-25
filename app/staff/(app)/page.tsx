import { loadConfig } from '@/lib/booking';
import { bkkNow } from '@/lib/time';
import { QueueBoard } from './QueueBoard';

export const dynamic = 'force-dynamic';

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  const sp = await searchParams;
  const cfg = await loadConfig();
  const today = bkkNow().date;
  return (
    <QueueBoard
      today={today}
      initialDate={sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today}
      initialView={sp.view === 'week' ? 'week' : 'day'}
      services={cfg.services.filter((s) => s.active).map((s) => ({ code: s.code, name_th: s.name_th }))}
      weekly={cfg.weekly}
      holidays={Object.fromEntries(cfg.holidays)}
    />
  );
}
