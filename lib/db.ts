import pg from 'pg';

// คืนค่า date/time เป็นสตริงตรง ๆ (ไม่แปลงโซนเวลา) — ร้านอยู่โซนเวลาไทยเท่านั้น
pg.types.setTypeParser(1082, (v) => v); // date
pg.types.setTypeParser(1083, (v) => v); // time

const g = globalThis as unknown as { __ecPool?: pg.Pool };

export function pool(): pg.Pool {
  if (!g.__ecPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    const local = /localhost|127\.0\.0\.1/.test(url);
    g.__ecPool = new pg.Pool({
      connectionString: url,
      ssl: local ? false : { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL_MAX || 5),
    });
  }
  return g.__ecPool;
}

export type Queryable = pg.Pool | pg.PoolClient;

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
