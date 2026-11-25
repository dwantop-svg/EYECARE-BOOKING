import { notFound } from 'next/navigation';
import { Brand } from '@/components/Brand';
import { getAppointmentByToken, loadConfig, STATUS_TH, type Status } from '@/lib/booking';
import { maskPhone } from '@/lib/phone';
import { fromMin, thaiDateLong, toMin } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'จองคิวสำเร็จ · Eyecare Optic ลำปาง', robots: { index: false } };

export default async function DonePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const a = await getAppointmentByToken(token);
  if (!a) notFound();
  const { settings } = await loadConfig();
  const end = fromMin(toMin(a.start_time) + a.slot_minutes);
  const cancelled = a.status === 'cancelled';
  return (
    <main className="wrap narrow stack" style={{ gap: 18 }}>
      <Brand name={settings.shop_name} />
      <section className="card stack" style={{ gap: 14, textAlign: 'center' }}>
        {cancelled ? (
          <div className="alert alert-warn">คิวนี้ถูกยกเลิกแล้ว</div>
        ) : (
          <div className="alert alert-ok" role="status">จองคิวสำเร็จ</div>
        )}
        <div>
          <div className="muted small">เลขคิวของคุณ</div>
          <div className="queue-big" data-testid="queue-no">{a.queue_no}</div>
        </div>
        <div className="muted small">กรุณาแคปหน้าจอนี้ไว้ แล้วแสดงเลขคิวกับพนักงานเมื่อมาถึงร้าน</div>
      </section>
      <section className="card">
        <dl className="summary">
          <dt>บริการ</dt><dd>{a.service_name}</dd>
          <dt>วันที่</dt><dd>{thaiDateLong(a.appt_date)}</dd>
          <dt>เวลา</dt><dd className="mono">{a.start_time}–{end} น.</dd>
          <dt>ชื่อผู้จอง</dt><dd>{a.full_name}</dd>
          <dt>เบอร์โทร</dt><dd className="mono">{maskPhone(a.phone)}</dd>
          {a.note && (<><dt>หมายเหตุ</dt><dd>{a.note}</dd></>)}
          <dt>สถานะ</dt><dd><span className={`badge st-${a.status}`}>{STATUS_TH[a.status as Status]}</span></dd>
        </dl>
      </section>
      <p className="muted small" style={{ margin: 0 }}>
        ร้านจะโทรยืนยันคิวอีกครั้ง หากต้องการเลื่อนหรือยกเลิก กรุณาโทรแจ้งร้าน{settings.shop_phone ? ` ${settings.shop_phone}` : ''}
      </p>
      <a className="btn btn-ghost" href="/book">จองคิวเพิ่ม</a>
    </main>
  );
}
