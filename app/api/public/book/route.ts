import { BookingError, createAppointment } from '@/lib/booking';
import { handle, readJson } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readJson(req);
    // honeypot กันบอท: ช่องนี้ซ่อนจากคน ถ้ามีค่าแปลว่าเป็นบอท
    if (b.website) throw new BookingError('bot', 'ไม่สามารถจองได้');
    const r = await createAppointment(
      { service_code: b.service_code, date: b.date, time: b.time, full_name: b.full_name, phone: b.phone, note: b.note, pdpa_consent: b.pdpa_consent },
      { source: 'online' },
    );
    // ไม่ส่งผลการจับคู่ลูกค้ากลับไปหน้าสาธารณะ (กันการสุ่มเบอร์เพื่อตรวจว่าเป็นลูกค้าร้านหรือไม่)
    return { ref_token: r.ref_token, queue_no: r.queue_no };
  });
}
