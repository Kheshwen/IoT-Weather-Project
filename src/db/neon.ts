import { defineConfig } from "@neon/config/v1";

// Postgres only. No branch TTL: the dev branch holds the demo seed until the report is submitted.
export default defineConfig({
  auth: false,
});
