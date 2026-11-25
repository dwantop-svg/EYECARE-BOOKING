import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'จองคิว · Eyecare Optic ลำปาง',
  description: 'จองคิววัดสายตา รับแว่น ปรับ-ซ่อมแว่น และปรึกษาเลนส์ ที่ Eyecare Optic ลำปาง',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f6e7a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Anuphan:wght@500;600;700&family=IBM+Plex+Sans+Thai:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
