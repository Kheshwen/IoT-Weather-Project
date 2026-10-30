import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { nextHour } from "@/lib/open-meteo";
import type { Filters, Param } from "@/lib/filters";

// The windowed queries below repeat the maths of v_accuracy_by_lead and
// v_rain_contingency, but over a date window. They read the same two
// verification views, so the truth rules stay in schema.sql.

type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Row[];
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const win = (f: Filters) => sql`target_time >= ${f.start}::timestamptz AND target_time < ${f.end}::timestamptz`;

export type AccuracyRow = {
  lead: number;
  expected: number;
  missing: number;
  nDevice: number;
  nRain: number;
  tempMae: number | null;
  tempBias: number | null;
  tempRmse: number | null;
  humMae: number | null;
  humBias: number | null;
  windMae: number | null;
  windBias: number | null;
  rainMae: number | null;
  rainBias: number | null;
};

export async function accuracyByLead(f: Filters): Promise<AccuracyRow[]> {
  const r = await rows(sql`
    WITH d AS (
      SELECT lead_hours, count(temp_err) AS n_dev,
             avg(abs(temp_err)) AS temp_mae, avg(temp_err) AS temp_bias, sqrt(avg(temp_err * temp_err)) AS temp_rmse,
             avg(abs(hum_err)) AS hum_mae, avg(hum_err) AS hum_bias
      FROM v_device_verification WHERE ${win(f)} GROUP BY lead_hours
    ), a AS (
      SELECT lead_hours, count(rain_err_mm) AS n_rain,
             avg(abs(wind_err)) AS wind_mae, avg(wind_err) AS wind_bias,
             avg(abs(rain_err_mm)) AS rain_mae, avg(rain_err_mm) AS rain_bias
      FROM v_verification WHERE ${win(f)} GROUP BY lead_hours
    ), e AS (
      -- forecast hours that should be scorable by now (30 min allowance for the collector)
      SELECT f.lead_hours, count(*) AS expected, count(*) FILTER (WHERE v.rain_obs_mm IS NULL) AS missing
      FROM forecasts f LEFT JOIN v_verification v USING (issued_at, target_time)
      WHERE f.target_time >= ${f.start}::timestamptz AND f.target_time < ${f.end}::timestamptz AND f.target_time <= now() - interval '30 minutes'
      GROUP BY f.lead_hours
    )
    SELECT lead_hours, e.expected, e.missing, d.n_dev, a.n_rain, d.temp_mae, d.temp_bias, d.temp_rmse, d.hum_mae, d.hum_bias,
           a.wind_mae, a.wind_bias, a.rain_mae, a.rain_bias
    FROM e LEFT JOIN d USING (lead_hours) LEFT JOIN a USING (lead_hours)
    ORDER BY lead_hours`);
  return r.map((x) => ({
    lead: Number(x.lead_hours), expected: Number(x.expected), missing: Number(x.missing), nDevice: Number(x.n_dev ?? 0), nRain: Number(x.n_rain ?? 0),
    tempMae: n(x.temp_mae), tempBias: n(x.temp_bias), tempRmse: n(x.temp_rmse),
    humMae: n(x.hum_mae), humBias: n(x.hum_bias),
    windMae: n(x.wind_mae), windBias: n(x.wind_bias), rainMae: n(x.rain_mae), rainBias: n(x.rain_bias),
  }));
}

export async function truthComparison(f: Filters) {
  const r = await rows(sql`
    SELECT a.lead_hours, count(*) AS n, avg(abs(d.temp_err)) AS dev, avg(abs(a.temp_err)) AS api
    FROM v_verification a JOIN v_device_verification d USING (issued_at, target_time)
    WHERE a.target_time >= ${f.start}::timestamptz AND a.target_time < ${f.end}::timestamptz
      AND d.temp_err IS NOT NULL AND a.temp_err IS NOT NULL
    GROUP BY a.lead_hours ORDER BY a.lead_hours`);
  return r.map((x) => ({ lead: Number(x.lead_hours), n: Number(x.n), dev: n(x.dev), api: n(x.api) }));
}

export type RainRow = { lead: number; hits: number; misses: number; falseAlarms: number; correctNeg: number; pod: number | null; far: number | null; csi: number | null; brier: number | null };

export async function rainContingency(f: Filters): Promise<RainRow[]> {
  const r = await rows(sql`
    SELECT lead_hours,
      count(*) FILTER (WHERE rain_fc_flag AND rain_obs_flag) AS hits,
      count(*) FILTER (WHERE NOT rain_fc_flag AND rain_obs_flag) AS misses,
      count(*) FILTER (WHERE rain_fc_flag AND NOT rain_obs_flag) AS false_alarms,
      count(*) FILTER (WHERE NOT rain_fc_flag AND NOT rain_obs_flag) AS correct_neg,
      (count(*) FILTER (WHERE rain_fc_flag AND rain_obs_flag))::float / NULLIF(count(*) FILTER (WHERE rain_obs_flag), 0) AS pod,
      (count(*) FILTER (WHERE rain_fc_flag AND NOT rain_obs_flag))::float / NULLIF(count(*) FILTER (WHERE rain_fc_flag), 0) AS far,
      (count(*) FILTER (WHERE rain_fc_flag AND rain_obs_flag))::float / NULLIF(count(*) FILTER (WHERE rain_fc_flag OR rain_obs_flag), 0) AS csi,
      avg(power(precip_prob_pct / 100.0 - rain_obs_flag::int, 2)) AS brier
    FROM v_device_verification
    WHERE ${win(f)} AND rain_fc_flag IS NOT NULL AND rain_obs_flag IS NOT NULL
    GROUP BY lead_hours ORDER BY lead_hours`);
  return r.map((x) => ({
    lead: Number(x.lead_hours), hits: Number(x.hits), misses: Number(x.misses), falseAlarms: Number(x.false_alarms), correctNeg: Number(x.correct_neg),
    pod: n(x.pod), far: n(x.far), csi: n(x.csi), brier: n(x.brier),
  }));
}

export type SeriesPoint = { t: number; forecast: number | null; actual: number | null };

/** One row per hour in the window so a missing hour is a null (a visible gap), never a skipped point. */
export async function forecastVsActual(f: Filters, param: Param, lead: number): Promise<SeriesPoint[]> {
  const col = {
    temp: sql`dv.temp_fc AS fc, dv.temp_dev AS actual`,
    hum: sql`dv.hum_fc AS fc, dv.hum_dev AS actual`,
    wind: sql`av.wind_fc AS fc, av.wind_obs AS actual`,
    rain: sql`av.rain_fc_mm AS fc, av.rain_obs_mm AS actual`,
  }[param];
  const r = await rows(sql`
    WITH bounds AS (
      SELECT GREATEST(${f.start}::timestamptz, date_trunc('hour', (SELECT min(obs_time) FROM observations) + interval '59 minutes')) AS s,
             LEAST(${f.end}::timestamptz, date_trunc('hour', now())) AS e
    )
    SELECT g.t, ${col}
    FROM bounds, generate_series(bounds.s, bounds.e, interval '1 hour') AS g(t)
    LEFT JOIN (SELECT * FROM v_device_verification WHERE lead_hours = ${lead}) dv ON dv.target_time = g.t
    LEFT JOIN (SELECT * FROM v_verification WHERE lead_hours = ${lead}) av ON av.target_time = g.t
    ORDER BY g.t`);
  return r.map((x) => ({ t: new Date(x.t as string | Date).getTime(), forecast: n(x.fc), actual: n(x.actual) }));
}

export type HeatCell = { bucket: number; hour: number; mae: number; n: number };

/** Temperature error by lead bucket (6 h) and hour of day in Malaysia time. */
export async function errorHeatmap(f: Filters): Promise<HeatCell[]> {
  const r = await rows(sql`
    SELECT (lead_hours / 6) * 6 AS bucket,
           extract(hour FROM target_time AT TIME ZONE 'Asia/Kuala_Lumpur')::int AS hour,
           avg(abs(temp_err)) AS mae, count(temp_err) AS n
    FROM v_device_verification WHERE ${win(f)} AND temp_err IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2`);
  return r.map((x) => ({ bucket: Number(x.bucket), hour: Number(x.hour), mae: Number(x.mae), n: Number(x.n) }));
}

export async function windowSummary(f: Filters) {
  const [r] = await rows(sql`
    SELECT
      (SELECT count(*) FROM v_device_verification WHERE ${win(f)} AND temp_err IS NOT NULL) AS dev_pairs,
      (SELECT count(*) FROM v_verification WHERE ${win(f)}) AS api_pairs,
      (SELECT min(obs_time) FROM observations WHERE obs_time >= ${f.start}::timestamptz AND obs_time < ${f.end}::timestamptz) AS first_obs,
      (SELECT max(obs_time) FROM observations WHERE obs_time >= ${f.start}::timestamptz AND obs_time < ${f.end}::timestamptz) AS last_obs,
      (SELECT count(*) FROM collector_log WHERE status = 'ok' AND run_time >= ${f.start}::timestamptz AND run_time < ${f.end}::timestamptz) AS runs_ok,
      (SELECT count(*) FROM collector_log WHERE run_time >= ${f.start}::timestamptz AND run_time < ${f.end}::timestamptz) AS runs_all,
      (SELECT min(run_time) FROM collector_log WHERE run_time >= ${f.start}::timestamptz AND run_time < ${f.end}::timestamptz) AS first_run,
      (SELECT max(run_time) FROM collector_log WHERE run_time >= ${f.start}::timestamptz AND run_time < ${f.end}::timestamptz) AS last_run`);
  const first = r.first_run ? new Date(r.first_run as string) : null;
  const last = r.last_run ? new Date(r.last_run as string) : null;
  // Expected runs: one per 15 minutes from the first logged run to now (or the window end), so a stopped collector lowers uptime.
  const end = Math.min(Date.now(), f.end.getTime());
  const ok = Number(r.runs_ok);
  // Manual runs fall off the 15-minute grid, so expected is never below the runs that succeeded.
  const expected = first && last ? Math.max(ok, 1, Math.floor((end - first.getTime()) / 900_000) + 1) : 0;
  const firstObs = r.first_obs ? new Date(r.first_obs as string) : null;
  const lastObs = r.last_obs ? new Date(r.last_obs as string) : null;
  return {
    devPairs: Number(r.dev_pairs), apiPairs: Number(r.api_pairs),
    hours: firstObs && lastObs ? Math.round((lastObs.getTime() - firstObs.getTime()) / 3_600_000) : 0,
    uptime: expected > 0 ? Math.min(1, ok / expected) : null,
    runsOk: ok, runsAll: Number(r.runs_all), expectedRuns: expected,
  };
}

export async function liveNow() {
  const [dev] = await rows(sql`SELECT recorded_at, temperature_c, humidity_pct, pressure_hpa, rain_pct, is_wet FROM device_readings ORDER BY recorded_at DESC LIMIT 1`);
  const [obs] = await rows(sql`SELECT obs_time, temperature_c, humidity_pct, precipitation_mm, wind_speed_kmh FROM observations ORDER BY obs_time DESC LIMIT 1`);
  const [fc] = await rows(sql`
    SELECT target_time, issued_at, precip_prob_pct, precipitation_mm FROM forecasts
    WHERE target_time = ${nextHour()}::timestamptz ORDER BY issued_at DESC LIMIT 1`);
  return { dev, obs, fc, nowMs: Date.now() };
}

export async function runHealth(f: Filters) {
  const gaps = await rows(sql`
    SELECT gap_start, gap_end FROM (
      SELECT obs_time AS gap_start, lead(obs_time) OVER (ORDER BY obs_time) AS gap_end FROM observations
      WHERE obs_time >= ${f.start}::timestamptz AND obs_time < ${f.end}::timestamptz
    ) t WHERE gap_end - gap_start > interval '15 minutes' ORDER BY gap_start DESC LIMIT 10`);
  const errors = await rows(sql`
    SELECT run_time, http_status, message FROM collector_log
    WHERE status <> 'ok' AND run_time >= ${f.start}::timestamptz AND run_time < ${f.end}::timestamptz ORDER BY run_time DESC LIMIT 8`);
  const [dev] = await rows(sql`
    SELECT count(*) AS n, min(recorded_at) AS first, max(recorded_at) AS last FROM device_readings
    WHERE recorded_at >= ${f.start}::timestamptz AND recorded_at < ${f.end}::timestamptz`);
  const [lastRun] = await rows(sql`SELECT run_time, status, message FROM collector_log ORDER BY run_id DESC LIMIT 1`);
  const nDev = Number(dev.n);
  const first = dev.first ? new Date(dev.first as string) : null;
  const last = dev.last ? new Date(dev.last as string) : null;
  // Same rule as the collector: count the time since the last reading, so an offline ESP32 lowers uptime.
  const endDev = Math.min(Date.now(), f.end.getTime());
  const expectedDev = first && last ? Math.max(1, Math.floor((endDev - first.getTime()) / 300_000) + 1) : 0;
  return {
    gaps: gaps.map((g) => ({ start: new Date(g.gap_start as string), end: new Date(g.gap_end as string) })),
    errors: errors.map((e) => ({ time: new Date(e.run_time as string), http: n(e.http_status), message: String(e.message ?? "") })),
    device: { n: nDev, expected: expectedDev, uptime: expectedDev ? Math.min(1, nDev / expectedDev) : null, last },
    lastRun: lastRun ? { time: new Date(lastRun.run_time as string), status: String(lastRun.status), message: String(lastRun.message ?? "") } : null,
  };
}
