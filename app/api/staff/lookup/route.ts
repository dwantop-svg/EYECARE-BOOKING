import { staffFromRequest } from '@/lib/auth';
import { getCustomersByRows, matchCustomer } from '@/lib/booking';
import { pool } from '@/lib/db';
import { handle, unauthorized } from '@/lib/http';
import { isValidPhone, normalizePhone } from '@/lib/phone';
export const dynamic = 'force-dynamic';
// พนักงานพิมพ์เบอร์ตอนเพิ่มคิว → แสดงว่าเป็นลูกค้าเดิมคนไหน
export async function GET(req: Request) {
  const staff = await staffFromRequest(req);
  if (!staff) return unauthorized();
  const phone = normalizePhone(new URL(req.url).searchParams.get('phone'));
  return handle(async () => {
    if (!isValidPhone(phone)) return { match_status: 'invalid', customers: [] };
    const m = await matchCustomer(pool(), phone);
    return { match_status: m.match_status, customers: await getCustomersByRows(m.candidates) };
  });
}
