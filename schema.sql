
CREATE TABLE IF NOT EXISTS observations (
    obs_time         TIMESTAMPTZ PRIMARY KEY,
    temperature_c    REAL,
    humidity_pct     REAL,
    precipitation_mm REAL,
    wind_speed_kmh   REAL,
    fetched_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Forecasts exactly as issued: one row per forecast hour per issue time.
CREATE TABLE IF NOT EXISTS forecasts (
    issued_at        TIMESTAMPTZ NOT NULL,   -- when the forecast was fetched (hour)
    target_time      TIMESTAMPTZ NOT NULL,   -- the hour being predicted
    lead_hours       SMALLINT    NOT NULL CHECK (lead_hours >= 0),
    temperature_c    REAL,
    humidity_pct     REAL,
    precipitation_mm REAL,
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
    job         TEXT NOT NULL,              -- 'observation' or 'forecast'
    status      TEXT NOT NULL,              -- 'ok' or 'error'
    http_status INT,
    message     TEXT
);


CREATE OR REPLACE VIEW v_verification AS
SELECT
    f.target_time,
    f.issued_at,
    f.lead_hours,
    f.temperature_c                 AS temp_fc,
    o.temperature_c                 AS temp_obs,
    f.temperature_c - o.temperature_c         AS temp_err,
    f.humidity_pct                  AS hum_fc,
    o.humidity_pct                  AS hum_obs,
    f.humidity_pct - o.humidity_pct           AS hum_err,
    f.wind_speed_kmh                AS wind_fc,
    o.wind_speed_kmh                AS wind_obs,
    f.wind_speed_kmh - o.wind_speed_kmh       AS wind_err,
    f.precipitation_mm              AS rain_fc_mm,
    o.precipitation_mm              AS rain_obs_mm,
    f.precipitation_mm - o.precipitation_mm   AS rain_err_mm,
    f.precip_prob_pct,
    (f.precipitation_mm >= 0.1)     AS rain_fc_flag,
    (o.precipitation_mm >= 0.1)     AS rain_obs_flag
FROM forecasts f
JOIN observations o
  ON o.obs_time = f.target_time
 AND o.obs_time = date_trunc('hour', o.obs_time);

-- Continuous-variable accuracy per lead time (bias, MAE, RMSE).
CREATE OR REPLACE VIEW v_accuracy_by_lead AS
SELECT
    lead_hours,
    count(*) AS n,
    avg(temp_err)                       AS temp_bias,
    avg(abs(temp_err))                  AS temp_mae,
    sqrt(avg(temp_err * temp_err))      AS temp_rmse,
    avg(hum_err)                        AS hum_bias,
    avg(abs(hum_err))                   AS hum_mae,
    sqrt(avg(hum_err * hum_err))        AS hum_rmse,
    avg(wind_err)                       AS wind_bias,
    avg(abs(wind_err))                  AS wind_mae,
    sqrt(avg(wind_err * wind_err))      AS wind_rmse,
    avg(rain_err_mm)                    AS rain_bias,
    avg(abs(rain_err_mm))               AS rain_mae,
    sqrt(avg(rain_err_mm * rain_err_mm)) AS rain_rmse
FROM v_verification
GROUP BY lead_hours
ORDER BY lead_hours;

-- Rain event verification per lead time (threshold 0.1 mm/h) and Brier score.
CREATE OR REPLACE VIEW v_rain_contingency AS
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
FROM v_verification
GROUP BY lead_hours
ORDER BY lead_hours;
