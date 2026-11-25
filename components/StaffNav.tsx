'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GlassesIcon } from './Brand';

const ITEMS = [
  { href: '/staff', label: 'คิวนัดหมาย' },
  { href: '/staff/customers', label: 'ค้นหาลูกค้า' },
  { href: '/staff/settings', label: 'ตั้งค่าการจอง' },
  { href: '/staff/share', label: 'ลิงก์ & QR Code' },
];

export function StaffNav({ name }: { name: string }) {
  const path = usePathname();
  const active = (h: string) => (h === '/staff' ? path === '/staff' : path.startsWith(h));
  return (
    <header className="topnav">
      <div className="inner">
        <div className="brand"><GlassesIcon size={24} /><span className="brand-name">Eyecare Optic ลำปาง</span></div>
        <nav aria-label="เมนูพนักงาน">
          {ITEMS.map((i) => (
            <Link key={i.href} href={i.href} aria-current={active(i.href) ? 'page' : undefined}>{i.label}</Link>
          ))}
        </nav>
        <span className="spacer" />
        <span className="muted small">{name}</span>
        <form action="/api/staff/logout" method="post"><button type="submit" className="btn-sm">ออกจากระบบ</button></form>
      </div>
    </header>
  );
}
