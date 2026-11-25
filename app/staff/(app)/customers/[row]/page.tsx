import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCustomer, STATUS_TH, type Status } from '@/lib/booking';
import { formatPhone } from '@/lib/phone';
import { thaiDateShort } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function CustomerPage({ params }: { params: Promise<{ row: string }> }) {
  const row = Number((await params).row);
  if (!Number.isInteger(row) || row <= 0) notFound();
  const data = await getCustomer(row);
  if (!data) notFound();
  const { customer: c, appointments } = data;
  return (
    <div className="stack" style={{ gap: 14, maxWidth: 820 }}>
      <div className="row"><Link href="/staff" className="small">‹ กลับไปคิวนัดหมาย</Link></div>
      <div className="row" style={{ alignItems: 'baseline' }}>
        <h1>{c.first_name} {c.last_name}</h1>
        <span className="mono muted">{c.customer_code}</span>
        {c.member_type && <span className="badge m-matched">{c.member_type}</span>}
      </div>
      <section className="card">
        <h2>ข้อมูลลูกค้า (จากทะเบียนเดิม · อ่านอย่างเดียว)</h2>
        <dl className="dl">
          <dt>เบอร์โทร</dt><dd className="mono">{c.phone ? <a href={`tel:${c.phone}`}>{formatPhone(c.phone)}</a> : '—'}</dd>
          <dt>เพศ</dt><dd>{c.gender || '—'}</dd>
          <dt>แต้มสะสม</dt><dd className="mono">{Number(c.points).toLocaleString()} แต้ม</dd>
          <dt>ประวัติซื้อ / ค่าสายตา</dt><dd>{c.history ? <div className="history">{c.history}</div> : '—'}</dd>
          {c.check_note && (<><dt>ต้องตรวจสอบ</dt><dd><span className="badge st-pending">{c.check_note}</span></dd></>)}
        </dl>
      </section>
      <section className="card">
        <h2>ประวัติการจองคิว ({appointments.length})</h2>
        {appointments.length === 0 ? <p className="muted">ยังไม่มีการจอง</p> : (
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>วันที่</th><th>เวลา</th><th>คิว</th><th>บริการ</th><th>สถานะ</th><th>หมายเหตุ</th></tr></thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id}>
                    <td><Link href={`/staff?date=${a.appt_date}&view=day`}>{thaiDateShort(a.appt_date)}</Link></td>
                    <td className="mono">{a.start_time}</td>
                    <td className="mono">{a.queue_no}</td>
                    <td>{a.service_name}</td>
                    <td><span className={`badge st-${a.status}`}>{STATUS_TH[a.status as Status]}</span></td>
                    <td className="small">{a.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
