import { staffFromRequest } from '@/lib/auth';
import { getCustomersByRows, searchCustomers } from '@/lib/booking';
import { handle, unauthorized } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const staff = await staffFromRequest(req);
  if (!staff) return unauthorized();
  const p = new URL(req.url).searchParams;
  const rows = p.get('rows');
  if (rows) return handle(() => getCustomersByRows(rows.split(',').map(Number).filter(Number.isInteger).slice(0, 20)));
  return handle(() => searchCustomers(p.get('q') || ''));
}
