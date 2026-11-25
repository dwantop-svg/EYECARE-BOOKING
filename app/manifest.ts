import type { MetadataRoute } from 'next';

// แอปบนหน้าจอมือถือสำหรับลูกค้า (เปิดหน้าจองคิว)
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/book',
    name: 'จองคิว Eyecare Optic ลำปาง',
    short_name: 'จองคิว Eyecare',
    description: 'จองคิววัดสายตา ตัดแว่น เปลี่ยนเลนส์ และบริการอื่น ๆ ที่ Eyecare Optic ลำปาง',
    start_url: '/book',
    scope: '/',
    display: 'standalone',
    background_color: '#f3f5f6',
    theme_color: '#0f6e7a',
    lang: 'th',
    icons: [
      { src: '/icons/book-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/book-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/book-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
