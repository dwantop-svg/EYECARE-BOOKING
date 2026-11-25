import QRCode from 'qrcode';
import { staffFromRequest } from '@/lib/auth';
import { publicBookingUrl } from '@/lib/site';
import { unauthorized } from '@/lib/http';
export const dynamic = 'force-dynamic';
// ดาวน์โหลด QR Code เป็นไฟล์ PNG สำหรับแปะในโพสต์ Facebook / TikTok
export async function GET(req: Request) {
  const staff = await staffFromRequest(req);
  if (!staff) return unauthorized();
  const url = await publicBookingUrl();
  const png = await QRCode.toBuffer(url, { type: 'png', width: 1024, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0f3f46', light: '#ffffff' } });
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Content-Disposition': 'attachment; filename="eyecare-booking-qr.png"', 'Cache-Control': 'no-store' },
  });
}
