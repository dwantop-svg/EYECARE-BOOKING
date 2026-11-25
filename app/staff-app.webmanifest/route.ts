// แอปบนหน้าจอสำหรับพนักงาน (เปิดหน้าคิวนัดหมาย)
export const dynamic = 'force-static';
export function GET() {
  return Response.json(
    {
      id: '/staff',
      name: 'คิวร้าน Eyecare Optic ลำปาง',
      short_name: 'คิวร้าน',
      start_url: '/staff',
      scope: '/staff',
      display: 'standalone',
      background_color: '#f3f5f6',
      theme_color: '#17232b',
      lang: 'th',
      icons: [
        { src: '/icons/staff-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/staff-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/staff-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
}
