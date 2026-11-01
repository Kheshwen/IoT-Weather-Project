import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// A few connections per serverless instance, so the dashboard queries can run in parallel. Use Neon's pooled URL in DATABASE_URL.
// Neon suspends when idle, which kills idle sockets: drop idle clients early and
// log pool errors, because an unhandled 'error' event would crash the process.
const g = globalThis as { _pool?: Pool };
export const pool = (g._pool ??= (() => {
  const p = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, idleTimeoutMillis: 10_000 });
  p.on("error", (e) => console.error("pg pool error", e.message));
  return p;
})());

export const db = drizzle(pool);
