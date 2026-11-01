# IoT Weather Project

Forecast-accuracy dashboard for Seri Iskandar, Perak (TFB2093 Embedded Systems). Open-Meteo forecasts are stored as issued, then scored against an ESP32 station and Open-Meteo observations.

- `app/api/collect` - cron-job.org calls it every 15 minutes (Open-Meteo to Neon).
- `app/api/ingest` - the ESP32 posts a reading every 5 minutes and gets the rain flag back.
- `app/page.tsx` - the dashboard.
- `schema.sql` - tables and verification views. `npm run db:init` applies it.
- `esp32_weather_monitor/` - firmware. See `docs/RUNBOOK.md` for the changes it needs.

Setup, cron-job.org, checks and the ESP32 contract: [docs/RUNBOOK.md](docs/RUNBOOK.md).

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, CRON_SECRET, DEVICE_TOKEN
npm run db:init
npm run dev
npm test
```
