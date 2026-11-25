import { headers } from 'next/headers';
export async function siteOrigin(): Promise<string> {
  const env = process.env.PUBLIC_BASE_URL;
  if (env) return env.replace(/\/+$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
export async function publicBookingUrl(): Promise<string> {
  return `${await siteOrigin()}/book`;
}
