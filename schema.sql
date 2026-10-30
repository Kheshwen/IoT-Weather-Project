-- Single DDL source. Idempotent: safe to re-run (scripts/db-init.ts).
-- Tables use IF NOT EXISTS. Views are dropped and rebuilt, they hold no data.

-- Open-Meteo 15-minute values (model output). precipitation_mm is the total
-- for the 15 minutes BEFORE obs_time.
CREATE TABLE IF NOT EXISTS observations (
    obs_time         TIMESTAMPTZ PRIMARY KEY,
    temperature_c    REAL,
    humidity_pct     REAL,
    precipitation_mm REAL,
    wind_speed_kmh   REAL,
    fetched_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ESP32 readings every 5 minutes. The server sets recorded_at.
CREATE TABLE IF NOT EXISTS device_readings (
    recorded_at   TIMESTAMPTZ PRIMARY KEY DEFAULT now(),
    temperature_c REAL,
    humidity_pct  REAL,
    pressure_hpa  REAL,
    rain_pct      SMALLINT,
    is_wet        BOOLEAN
);

-- Forecasts exactly as issued: one row per forecast hour per issue time.
CREATE TABLE IF NOT EXISTS forecasts (
    issued_at        TIMESTAMPTZ NOT NULL,   -- when the forecast was fetched (hour)
    target_time      TIMESTAMPTZ NOT NULL,   -- the hour being predicted
    lead_hours       SMALLINT    NOT NULL CHECK (lead_hours >= 0),
    temperature_c    REAL,
    humidity_pct     REAL,
    precipitation_mm REAL,                   -- total for the hour BEFORE target_time
    precip_prob_pct  REAL,
    wind_speed_kmh   REAL,
    PRIMARY KEY (issued_at, target_time)
);

CREATE INDEX IF NOT EXISTS idx_forecasts_target ON forecasts (target_time);
CREATE INDEX IF NOT EXISTS idx_forecasts_lead   ON forecasts (lead_hours);

-- One row per collector run, for uptime and gap tracking.
CREATE TABLE IF NOT EXISTS collector_log (
    run_id      BIGSERIAL PRIMARY KEY,
    run_time    TIMESTAMPTZ NOT NULL DEFAULT now(),
    job         TEXT NOT NULL,              -- 'collect'
    status      TEXT NOT NULL,              -- 'ok' or 'error'
    http_status INT,
    message     TEXT
);

DROP VIEW IF EXISTS v_truth_comparison;
DROP VIEW IF EXISTS v_rain_contingency;
DROP VIEW IF EXISTS v_accuracy_by_lead;
DROP VIEW IF EXISTS v_device_verification;
DROP VIEW IF EXISTS v_verification;

-- Forecast vs Open-Meteo. Temp, humidity and wind use the observation at the
-- target hour. Rain is the sum of the four 15-minute slots that end at the
-- target hour. NULL if a slot is missing, so a gap never counts as dry.
CREATE VIEW v_verification AS
SELECT
    f.target_time,
    f.issued_at,
    f.lead_hours,
    f.temperature_c                           AS temp_fc,
    o.temperature_c                           AS temp_obs,
    f.temperature_c - o.temperature_c         AS temp_err,
    f.humidity_pct                            AS hum_fc,
    o.humidity_pct                            AS hum_obs,
    f.humidity_pct - o.humidity_pct           AS hum_err,
    f.wind_speed_kmh                          AS wind_fc,
    o.wind_speed_kmh                          AS wind_obs,
    f.wind_speed_kmh - o.wind_speed_kmh       AS wind_err,
    f.precipitation_mm                        AS rain_fc_mm,
    r.rain_obs_mm,
    f.precipitation_mm - r.rain_obs_mm        AS rain_err_mm,
    f.precip_prob_pct,
    (f.precipitation_mm >= 0.1)               AS rain_fc_flag,
    (r.rain_obs_mm >= 0.1)                    AS rain_obs_flag
FROM forecasts f
JOIN observations o ON o.obs_time = f.target_time
LEFT JOIN LATERAL (
    SELECT sum(x.precipitation_mm) AS rain_obs_mm
    FROM observations x
    WHERE x.obs_time >  f.target_time - interval '1 hour'
      AND x.obs_time <= f.target_time
    HAVING count(x.precipitation_mm) = 4
) r ON true;

-- Forecast vs ESP32. Temp and humidity: mean of device rows within 30 minutes
-- of the target hour (the forecast is an instant value). Rain: wet at any time
-- in the hour before the target (matches the hourly accumulation).
-- Each window needs at least 6 of its 12 rows.
CREATE VIEW v_device_verification AS
SELECT
    f.target_time,
    f.issued_at,
    f.lead_hours,
    f.temperature_c                           AS temp_fc,
    d.temp_dev,
    f.temperature_c - d.temp_dev              AS temp_err,
    f.humidity_pct                            AS hum_fc,
    d.hum_dev,
    f.humidity_pct - d.hum_dev                AS hum_err,
    f.precip_prob_pct,
    (f.precipitation_mm >= 0.1)               AS rain_fc_flag,
    w.rain_obs_flag
FROM forecasts f
LEFT JOIN LATERAL (
    SELECT avg(x.temperature_c) AS temp_dev, avg(x.humidity_pct) AS hum_dev
    FROM device_readings x
    WHERE x.recorded_at >  f.target_time - interval '30 minutes'
      AND x.recorded_at <= f.target_time + interval '30 minutes'
    HAVING count(*) >= 6
) d ON true
LEFT JOIN LATERAL (
    SELECT bool_or(x.is_wet) AS rain_obs_flag
    FROM device_readings x
    WHERE x.recorded_at >  f.target_time - interval '1 hour'
      AND x.recorded_at <= f.target_time
    HAVING count(*) >= 6
) w ON true
WHERE d.temp_dev IS NOT NULL OR w.rain_obs_flag IS NOT NULL;

-- Accuracy per lead time (bias, MAE, RMSE). Temp and humidity are scored
-- against the ESP32 (n). Wind and rain amount are scored against Open-Meteo (n_api).
CREATE VIEW v_accuracy_by_lead AS
WITH d AS (
    SELECT
        lead_hours,
        count(temp_err)                     AS n,
        avg(temp_err)                       AS temp_bias,
        avg(abs(temp_err))                  AS temp_mae,
        sqrt(avg(temp_err * temp_err))      AS temp_rmse,
        avg(hum_err)                        AS hum_bias,
        avg(abs(hum_err))                   AS hum_mae,
        sqrt(avg(hum_err * hum_err))        AS hum_rmse
    FROM v_device_verification
    GROUP BY lead_hours
), a AS (
    SELECT
        lead_hours,
        count(wind_err)                         AS n_api,
        avg(wind_err)                           AS wind_bias,
        avg(abs(wind_err))                      AS wind_mae,
        sqrt(avg(wind_err * wind_err))          AS wind_rmse,
        avg(rain_err_mm)                        AS rain_bias,
        avg(abs(rain_err_mm))                   AS rain_mae,
        sqrt(avg(rain_err_mm * rain_err_mm))    AS rain_rmse
    FROM v_verification
    GROUP BY lead_hours
)
SELECT
    lead_hours,
    d.n, d.temp_bias, d.temp_mae, d.temp_rmse,
    d.hum_bias, d.hum_mae, d.hum_rmse,
    a.n_api, a.wind_bias, a.wind_mae, a.wind_rmse,
    a.rain_bias, a.rain_mae, a.rain_rmse
FROM d FULL JOIN a USING (lead_hours)
ORDER BY lead_hours;

-- Rain yes/no per lead time. Forecast flag = precipitation >= 0.1 mm/h.
-- Observed flag = ESP32 rain plate wet. Brier score uses the forecast probability.
CREATE VIEW v_rain_contingency AS
SELECT
    lead_hours,
    count(*) FILTER (WHERE rain_fc_flag AND rain_obs_flag)         AS hits,
    count(*) FILTER (WHERE NOT rain_fc_flag AND rain_obs_flag)     AS misses,
    count(*) FILTER (WHERE rain_fc_flag AND NOT rain_obs_flag)     AS false_alarms,
    count(*) FILTER (WHERE NOT rain_fc_flag AND NOT rain_obs_flag) AS correct_negatives,
    (count(*) FILTER (WHERE rain_fc_flag AND rain_obs_flag))::float
        / NULLIF(count(*) FILTER (WHERE rain_obs_flag), 0)         AS pod,
    (count(*) FILTER (WHERE rain_fc_flag AND NOT rain_obs_flag))::float
        / NULLIF(count(*) FILTER (WHERE rain_fc_flag), 0)          AS far,
    (count(*) FILTER (WHERE rain_fc_flag AND rain_obs_flag))::float
        / NULLIF(count(*) FILTER (WHERE rain_fc_flag OR rain_obs_flag), 0) AS csi,
    avg(power(precip_prob_pct / 100.0 - rain_obs_flag::int, 2))    AS brier_score
FROM v_device_verification
WHERE rain_fc_flag IS NOT NULL AND rain_obs_flag IS NOT NULL
GROUP BY lead_hours
ORDER BY lead_hours;

-- Secondary chart: temp and humidity MAE per lead against both truths, on the
-- same forecast rows so the two are comparable.
CREATE VIEW v_truth_comparison AS
SELECT
    a.lead_hours,
    count(*)                        AS n,
    avg(abs(d.temp_err))            AS temp_mae_device,
    avg(abs(a.temp_err))            AS temp_mae_api,
    avg(abs(d.hum_err))             AS hum_mae_device,
    avg(abs(a.hum_err))             AS hum_mae_api
FROM v_verification a
JOIN v_device_verification d USING (issued_at, target_time)
WHERE d.temp_err IS NOT NULL AND a.temp_err IS NOT NULL
GROUP BY a.lead_hours
ORDER BY a.lead_hours;
