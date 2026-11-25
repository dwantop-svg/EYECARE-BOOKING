import QRCode from 'qrcode';
import { publicBookingUrl } from '@/lib/site';
import { CopyButton } from './CopyButton';

export const dynamic = 'force-dynamic';

export default async function SharePage() {
  const url = await publicBookingUrl();
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f3f46', light: '#ffffff' } });
  return (
    <div className="stack" style={{ gap: 14, maxWidth: 720 }}>
      <h1>ลิงก์ & QR Code จองคิว</h1>
      <p className="muted" style={{ margin: 0 }}>นำลิงก์หรือ QR Code นี้ไปแปะในเพจ Facebook, TikTok (ใส่ในลิงก์ไบโอ) หรือพิมพ์ติดหน้าร้าน ลูกค้าจองได้โดยไม่ต้องล็อกอิน</p>
      <section className="card stack">
        <h2>ลิงก์จองคิว</h2>
        <div className="linkbox" data-testid="public-url">{url}</div>
        <div className="row">
          <CopyButton text={url} />
          <a className="btn" href={url} target="_blank" rel="noreferrer">เปิดหน้าจองคิว</a>
        </div>
      </section>
      <section className="card stack">
        <h2>QR Code</h2>
        <div className="qr-box" role="img" aria-label={`QR Code ไปที่ ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="row">
          <a className="btn btn-primary" href="/api/staff/qr" download>ดาวน์โหลด QR (PNG 1024px)</a>
        </div>
        <p className="muted small" style={{ margin: 0 }}>ข้อความแนะนำสำหรับโพสต์: “จองคิววัดสายตา/รับแว่น/ซ่อมแว่น ล่วงหน้าได้แล้ว ไม่ต้องรอคิว จองที่ {url}”</p>
      </section>
    </div>
  );
}
