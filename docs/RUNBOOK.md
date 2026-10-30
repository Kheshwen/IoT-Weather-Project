# Runbook

How the data collector works, how to set it up, how to check it, and what the ESP32 must send.

## 1. How the collector works

Two small API routes do all the data work. Nothing else writes to the database.

**`GET /api/collect`** runs every 15 minutes. cron-job.org calls it with the header `x-cron-secret`.

1. The route checks the secret. A wrong secret gets `401` and nothing runs.
2. It makes one request to Open-Meteo. The request asks for:
   - the last 12 slots of 15-minute data (3 hours back), and
   - the hourly forecast for the next 49 hours (lead 0 to 48).
3. It writes the 15-minute values to `observations`. A row that already exists is skipped (`ON CONFLICT DO NOTHING`). Because each run asks for 3 hours back, a failed run leaves a hole that the next run fills.
4. It writes the 49 forecast rows to `forecasts` with `issued_at` set to the current hour (UTC). The first run in an hour writes them. Later runs in the same hour hit the primary key and skip them. So the forecast is stored exactly as first issued.
5. It writes one row to `collector_log` with `ok` or `error`, the HTTP status, and a short message.
6. On an Open-Meteo error it replies `502`, so cron-job.org marks the run as failed and can email you.

**`POST /api/ingest`** runs every 5 minutes. The ESP32 calls it with the header `x-device-token`.

1. The route checks the token and the body (see section 5).
2. It writes one row to `device_readings`. The server sets the time, because the ESP32 has no clock.
3. It replies with `rain_flag`: true when the newest forecast rain chance for the next full hour is 60% or more.

**Verification** is plain SQL views in `schema.sql`. They pair each forecast with what happened at its target time:

| View | Compares | Truth |
|---|---|---|
| `v_verification` | forecast vs Open-Meteo observation | wind, rain amount (sum of the four 15-minute slots ending at the target hour) |
| `v_device_verification` | forecast vs ESP32 | temperature and humidity (mean within 30 min of the target hour), rain yes/no (rain plate wet at any time in the hour before the target) |
| `v_accuracy_by_lead` | bias, MAE, RMSE per lead hour | temp and humidity: ESP32. Wind and rain mm: Open-Meteo |
| `v_rain_contingency` | hits, misses, false alarms, POD, FAR, CSI, Brier | ESP32 rain plate |
| `v_truth_comparison` | temp and humidity MAE against both truths | both |

A rain total needs all four 15-minute slots. If one is missing, the result is `NULL`, not 0. A gap never counts as a dry hour.

## 2. First-time setup

1. **Neon.** Create a project. Create a branch called `dev`. Copy both pooled connection strings (the host contains `-pooler`).
2. **Local env.** Copy `.env.example` to `.env.local`. Put the **dev** branch URL in `DATABASE_URL`. Generate two secrets:
   ```bash
   openssl rand -hex 32   # CRON_SECRET
   openssl rand -hex 32   # DEVICE_TOKEN
   ```
3. **Create the tables** on each branch. The dev branch reads `.env.local`. For main, pass the URL on the command line, so the main URL is never saved in a local file:
   ```bash
   npm install
   npm run db:init                                  # dev branch (.env.local)
   DATABASE_URL="<main pooled url>" npm run db:init  # main branch
   ```
   The script is safe to run again. It never deletes table data. It rebuilds the views.
4. **Vercel.** Set `DATABASE_URL` (main branch URL), `CRON_SECRET` and `DEVICE_TOKEN` for Production **before the first build**. Do not set `NEXT_PUBLIC_DEMO` or `SEED_DB_MARKER` on Vercel. Deploy with `vercel deploy --prod` from the project folder. cron-job.org and the ESP32 must use the production alias (`YOUR-APP.vercel.app`), not a per-deployment URL.
5. **Check it is live** (replace the host):
   ```bash
   curl -i https://YOUR-APP.vercel.app/api/collect
   # expect 401 {"error":"unauthorized"}, not a Vercel login page
   curl -i https://YOUR-APP.vercel.app/api/collect -H "x-cron-secret: YOUR_CRON_SECRET"
   # expect 200 {"status":"ok","message":"+12 obs, +49 forecast rows"}
   ```

## 3. cron-job.org

1. Create a job.
   - URL: `https://YOUR-APP.vercel.app/api/collect`
   - Schedule: every 15 minutes
   - Request method: GET
   - Request timeout: 30 seconds
2. Advanced tab, Headers: add `x-cron-secret` with the value of `CRON_SECRET`.
3. Notifications: turn on "notify on failure".
4. Run the job once with "Test run". It must show HTTP 200.

## 4. Check the run

Run these in the Neon SQL editor on the **main** branch.

```sql
-- Last 10 collector runs (MYT)
SELECT run_time AT TIME ZONE 'Asia/Kuala_Lumpur' AS myt, status, http_status, message
FROM collector_log ORDER BY run_id DESC LIMIT 10;

-- Row counts
SELECT (SELECT count(*) FROM observations)    AS obs,
       (SELECT count(*) FROM forecasts)       AS forecasts,
       (SELECT count(*) FROM device_readings) AS device,
       (SELECT count(*) FROM collector_log)   AS runs;

-- Forecast issues per hour. Each should have 49 rows.
SELECT issued_at AT TIME ZONE 'Asia/Kuala_Lumpur' AS issued_myt, count(*)
FROM forecasts GROUP BY issued_at ORDER BY issued_at DESC LIMIT 6;

-- Gaps in the 15-minute observations
SELECT gap_start AT TIME ZONE 'Asia/Kuala_Lumpur' AS gap_start_myt, gap_end - gap_start AS gap
FROM (SELECT obs_time AS gap_start, lead(obs_time) OVER (ORDER BY obs_time) AS gap_end FROM observations) t
WHERE gap_end - gap_start > interval '15 minutes';

-- Last ESP32 post
SELECT max(recorded_at) AT TIME ZONE 'Asia/Kuala_Lumpur' AS last_post_myt, now() - max(recorded_at) AS age
FROM device_readings;
```

Healthy: 4 `ok` runs per hour, one new forecast issue per hour, an ESP32 post every 5 minutes.

After the first full hour, also check that the :00 slots arrive. This returns one row per completed hour (the views depend on it):

```sql
SELECT target_time AT TIME ZONE 'Asia/Kuala_Lumpur' AS myt, temp_obs, rain_obs_mm
FROM v_verification WHERE lead_hours = 0 ORDER BY target_time DESC LIMIT 3;
```

**After every production deploy** during the 72-hour run: a deploy also replaces `/api/collect` and `/api/ingest`. Call `/api/collect` once with the secret, then check `collector_log` within 15 minutes.

## 5. ESP32 contract (for the firmware owner)

The ESP32 no longer calls Open-Meteo. It posts its own readings and reads the rain flag from the reply.

**Request**

```
POST https://YOUR-APP.vercel.app/api/ingest
Content-Type: application/json
x-device-token: <DEVICE_TOKEN>

{"temperature_c": 29.4, "humidity_pct": 74, "pressure_hpa": 1008.2, "rain_pct": 3, "is_wet": false}
```

| Field | Type | Valid range |
|---|---|---|
| `temperature_c` | number | -40 to 85 |
| `humidity_pct` | number | 0 to 100 |
| `pressure_hpa` | number | 300 to 1100 |
| `rain_pct` | number | 0 to 100 |
| `is_wet` | boolean | `rain_pct > 35` (same threshold as the red alert) |

Any other body gets `400`. A wrong token gets `401`. Send every 5 minutes. Do not send a reading if the BME280 was not found or returned `NaN`.

**Reply (200)**

```json
{"rain_flag": false, "precip_prob_pct": 12, "target_time": "2026-10-30T04:00:00.000Z"}
```

`rain_flag` is true when the rain chance for the next full hour is 60% or more. `precip_prob_pct` is `null` before the first forecast exists.

**Firmware changes** in `esp32_weather_monitor.ino`:

1. Delete `apiUrl`, `fetchOpenMeteoForecast()`, `cloudPrecip` and the Open-Meteo `API_INTERVAL` use. Add:
   ```cpp
   const char* ingestUrl   = "https://YOUR-APP.vercel.app/api/ingest";
   const char* deviceToken = "PASTE_DEVICE_TOKEN";
   const unsigned long POST_INTERVAL = 5UL * 60 * 1000; // every 5 minutes
   bool rainFlag = false;
   ```
2. Add this function in place of `fetchOpenMeteoForecast()`:
   ```cpp
   void postReading() {
     if (WiFi.status() != WL_CONNECTED) { isOnline = false; return; }
     if (!bmeFound || isnan(localTemp) || isnan(localHumidity) || isnan(localPressure)) return;

     WiFiClientSecure client;
     client.setInsecure(); // same as before: no root certificate check
     HTTPClient http;
     http.setTimeout(8000);
     if (!http.begin(client, ingestUrl)) return;
     http.addHeader("Content-Type", "application/json");
     http.addHeader("x-device-token", deviceToken);

     JsonDocument body;
     body["temperature_c"] = localTemp;
     body["humidity_pct"]  = localHumidity;
     body["pressure_hpa"]  = localPressure;
     body["rain_pct"]      = localRainPercent;
     body["is_wet"]        = localRainPercent > 35;
     String payload;
     serializeJson(body, payload);

     int code = http.POST(payload);
     if (code == HTTP_CODE_OK) {
       JsonDocument reply;
       if (!deserializeJson(reply, http.getString())) {
         rainFlag         = reply["rain_flag"] | false;
         upcomingRainProb = reply["precip_prob_pct"] | 0;
         apiSuccess = true;
       }
     }
     http.end();
   }
   ```
3. Replace every `fetchOpenMeteoForecast()` call with `postReading()`, and use `POST_INTERVAL` where `API_INTERVAL` was. In `setup()`, call `readLocalSensors()` **before** the first `postReading()`, so the first post has real values.
4. In `updateAlertSystem()` and `renderScreen()`, replace `upcomingRainProb >= 60 || cloudPrecip > 0.5` and `upcomingRainProb >= 60` with `rainFlag`. Keep the rain-plate and offline logic unchanged. The offline fallback still works: with no Wi-Fi, `isOnline` is false and the plate alone drives the alert.
5. Flash the new firmware **before the 72-hour run starts**. Device ground truth exists only for the time the new firmware posts.
