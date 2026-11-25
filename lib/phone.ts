/** แปลงเบอร์เป็นตัวเลขล้วน รูปแบบ 0xxxxxxxxx (รองรับ +66 / ขีด / เว้นวรรค) */
export function normalizePhone(input: unknown): string {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.startsWith('66') && (d.length === 11 || d.length === 10)) d = '0' + d.slice(2);
  return d;
}

/** เบอร์มือถือ 10 หลัก หรือเบอร์บ้าน 9 หลัก ขึ้นต้นด้วย 0 */
export function isValidPhone(p: string): boolean {
  return /^0\d{8,9}$/.test(p);
}

export function formatPhone(p: string): string {
  if (p.length === 10) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
  if (p.length === 9) return `${p.slice(0, 2)}-${p.slice(2, 5)}-${p.slice(5)}`;
  return p;
}

export function maskPhone(p: string): string {
  return p.length >= 4 ? `${p.slice(0, 3)}-xxx-${p.slice(-4)}` : p;
}
