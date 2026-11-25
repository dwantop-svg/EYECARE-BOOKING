import { requireStaffPage } from '@/lib/auth';
import { StaffNav } from '@/components/StaffNav';
export const dynamic = 'force-dynamic';
import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'คิวนัดหมาย · Eyecare Optic ลำปาง',
  robots: { index: false },
  manifest: '/staff-app.webmanifest',
  icons: { icon: '/icons/staff-192.png', apple: '/icons/staff-apple.png' },
  appleWebApp: { capable: true, title: 'คิวร้าน', statusBarStyle: 'default' },
};
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaffPage();
  return (
    <>
      <StaffNav name={staff.display_name} />
      <div className="staff-wrap">{children}</div>
    </>
  );
}
