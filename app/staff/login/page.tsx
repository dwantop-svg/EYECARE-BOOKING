import { LoginForm } from './LoginForm';
import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'เข้าสู่ระบบพนักงาน · Eyecare Optic ลำปาง',
  robots: { index: false },
  manifest: '/staff-app.webmanifest',
  icons: { icon: '/icons/staff-192.png', apple: '/icons/staff-apple.png' },
  appleWebApp: { capable: true, title: 'คิวร้าน', statusBarStyle: 'default' },
};
export default function LoginPage() {
  return <LoginForm />;
}
