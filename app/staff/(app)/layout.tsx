import { requireStaffPage } from '@/lib/auth';
import { StaffNav } from '@/components/StaffNav';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'คิวนัดหมาย · Eyecare Optic', robots: { index: false } };
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaffPage();
  return (
    <>
      <StaffNav name={staff.display_name} />
      <div className="staff-wrap">{children}</div>
    </>
  );
}
