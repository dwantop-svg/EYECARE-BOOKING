import pg from 'pg';
export function makePool() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('ต้องตั้งค่า DATABASE_URL'); process.exit(1); }
  const local = /localhost|127\.0\.0\.1/.test(url);
  return new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 3 });
}
