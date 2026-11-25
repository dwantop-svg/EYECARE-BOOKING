import { staffFromRequest } from '@/lib/auth';
import { BookingError, setCustomerLink, updateStatus } from '@/lib/booking';
import { handle, readJson, unauthorized } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const staff = await staffFromRequest(req);
  if (!staff) return unauthorized();
  const id = Number((await ctx.params).id);
  return handle(async () => {
    if (!Number.isInteger(id) || id <= 0) throw new BookingError('bad_id', 'ไม่พบคิวนี้', 404);
    const b = await readJson(req);
    if (typeof b.status === 'string') return updateStatus(id, b.status, staff.id);
    if ('customer_row' in b) {
      const row = b.customer_row === null ? null : Number(b.customer_row);
      if (row !== null && !Number.isInteger(row)) throw new BookingError('bad_customer', 'ข้อมูลลูกค้าไม่ถูกต้อง');
      return setCustomerLink(id, row, staff.id);
    }
    throw new BookingError('bad_request', 'ไม่มีข้อมูลที่จะแก้ไข');
  });
}
