// Run schema.sql against DATABASE_URL: npm run db:init
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (use .env.local)");
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(readFileSync(join(process.cwd(), "schema.sql"), "utf8"));
  await client.end();
  console.log("schema.sql applied to", new URL(url).host);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
