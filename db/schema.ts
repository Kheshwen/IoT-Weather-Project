import {
  bigint, boolean, doublePrecision, index, integer, pgTable, pgView, primaryKey,
  real, smallint, text, timestamp, bigserial,
} from "drizzle-orm/pg-core";

// Mirrors schema.sql, which stays the DDL source. Views are typed reads only.
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const observations = pgTable("observations", {
  obsTime: ts("obs_time").primaryKey(),
  temperatureC: real("temperature_c"),
  humidityPct: real("humidity_pct"),
  precipitationMm: real("precipitation_mm"),
  windSpeedKmh: real("wind_speed_kmh"),
  fetchedAt: ts("fetched_at").notNull().defaultNow(),
});

export const deviceReadings = pgTable("device_readings", {
  recordedAt: ts("recorded_at").primaryKey().defaultNow(),
  temperatureC: real("temperature_c"),
  humidityPct: real("humidity_pct"),
  pressureHpa: real("pressure_hpa"),
  rainPct: smallint("rain_pct"),
  isWet: boolean("is_wet"),
});

export const forecasts = pgTable(
  "forecasts",
  {
    issuedAt: ts("issued_at").notNull(),
    targetTime: ts("target_time").notNull(),
    leadHours: smallint("lead_hours").notNull(),
    temperatureC: real("temperature_c"),
    humidityPct: real("humidity_pct"),
    precipitationMm: real("precipitation_mm"),
    precipProbPct: real("precip_prob_pct"),
    windSpeedKmh: real("wind_speed_kmh"),
  },
  (t) => [
    primaryKey({ columns: [t.issuedAt, t.targetTime] }),
    index("idx_forecasts_target").on(t.targetTime),
    index("idx_forecasts_lead").on(t.leadHours),
  ],
);

export const collectorLog = pgTable("collector_log", {
  runId: bigserial("run_id", { mode: "number" }).primaryKey(),
  runTime: ts("run_time").notNull().defaultNow(),
  job: text("job").notNull(),
  status: text("status").notNull(),
  httpStatus: integer("http_status"),
  message: text("message"),
});

const dp = (n: string) => doublePrecision(n);
const count = (n: string) => bigint(n, { mode: "number" });

export const vAccuracyByLead = pgView("v_accuracy_by_lead", {
  leadHours: smallint("lead_hours"),
  n: count("n"),
  tempBias: dp("temp_bias"), tempMae: dp("temp_mae"), tempRmse: dp("temp_rmse"),
  humBias: dp("hum_bias"), humMae: dp("hum_mae"), humRmse: dp("hum_rmse"),
  nApi: count("n_api"),
  windBias: dp("wind_bias"), windMae: dp("wind_mae"), windRmse: dp("wind_rmse"),
  rainBias: dp("rain_bias"), rainMae: dp("rain_mae"), rainRmse: dp("rain_rmse"),
}).existing();

export const vRainContingency = pgView("v_rain_contingency", {
  leadHours: smallint("lead_hours"),
  hits: count("hits"), misses: count("misses"),
  falseAlarms: count("false_alarms"), correctNegatives: count("correct_negatives"),
  pod: dp("pod"), far: dp("far"), csi: dp("csi"), brierScore: dp("brier_score"),
}).existing();

export const vTruthComparison = pgView("v_truth_comparison", {
  leadHours: smallint("lead_hours"),
  n: count("n"),
  tempMaeDevice: dp("temp_mae_device"), tempMaeApi: dp("temp_mae_api"),
  humMaeDevice: dp("hum_mae_device"), humMaeApi: dp("hum_mae_api"),
}).existing();

export const vVerification = pgView("v_verification", {
  targetTime: ts("target_time"), issuedAt: ts("issued_at"), leadHours: smallint("lead_hours"),
  tempFc: real("temp_fc"), tempObs: real("temp_obs"), tempErr: dp("temp_err"),
  humFc: real("hum_fc"), humObs: real("hum_obs"), humErr: dp("hum_err"),
  windFc: real("wind_fc"), windObs: real("wind_obs"), windErr: dp("wind_err"),
  rainFcMm: real("rain_fc_mm"), rainObsMm: real("rain_obs_mm"), rainErrMm: dp("rain_err_mm"),
  precipProbPct: real("precip_prob_pct"),
  rainFcFlag: boolean("rain_fc_flag"), rainObsFlag: boolean("rain_obs_flag"),
}).existing();

export const vDeviceVerification = pgView("v_device_verification", {
  targetTime: ts("target_time"), issuedAt: ts("issued_at"), leadHours: smallint("lead_hours"),
  tempFc: real("temp_fc"), tempDev: dp("temp_dev"), tempErr: dp("temp_err"),
  humFc: real("hum_fc"), humDev: dp("hum_dev"), humErr: dp("hum_err"),
  precipProbPct: real("precip_prob_pct"),
  rainFcFlag: boolean("rain_fc_flag"), rainObsFlag: boolean("rain_obs_flag"),
}).existing();
