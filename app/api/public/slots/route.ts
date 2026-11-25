import { getDaySlots } from '@/lib/booking';
import { handle } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get('date') || '';
  // หน้าสาธารณะเห็นเฉพาะ ว่าง/เต็ม และจำนวนที่เหลือ ไม่เห็นข้อมูลผู้จอง
  return handle(async () => {
    const r = await getDaySlots(date);
    return { ...r, slots: r.slots.map(({ time, remaining, available, reason }) => ({ time, remaining, available, reason })) };
  });
}
