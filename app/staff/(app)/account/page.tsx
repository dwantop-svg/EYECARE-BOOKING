import { requireStaffPage } from '@/lib/auth';
import { PasswordForm } from './PasswordForm';
export const dynamic = 'force-dynamic';
export default async function AccountPage() {
  const staff = await requireStaffPage();
  return <PasswordForm username={staff.username} displayName={staff.display_name} />;
}
