// Synthetic 72 h of data for the dashboard: npm run seed
// DEV ONLY. It empties the four data tables first. It refuses to run unless
// the DATABASE_URL host contains SEED_DB_MARKER (the Neon dev branch endpoint id).
import { collectorLog, deviceReadings, forecasts, observations } from "@/db/schema";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const MIN = 60_000;
const HOUR = 60 * MIN;

// Deterministic random numbers, so a re-seed gives the same charts.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261030);
const normal = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

const now = Math.floor(Date.now() / (15 * MIN)) * 15 * MIN;
const start = Math.floor((now - 72 * HOUR) / HOUR) * HOUR;
const endForecast = Math.floor(now / HOUR) * HOUR + 48 * HOUR;

// Afternoon showers: one per day, most days. Time is hours since `start`.
type Shower = { centre: number; half: number; peak: number };
const showers: Shower[] = [];
for (let day = -1; day <= 5; day++) {
  if (rand() < 0.2) continue; // a dry day
  const midnightMyt = Math.floor((start + 8 * HOUR) / (24 * HOUR)) * 24 * HOUR - 8 * HOUR + day * 24 * HOUR;
  showers.push({
    centre: (midnightMyt + (15 + rand() * 3) * HOUR - start) / HOUR,
    half: 0.6 + rand() * 0.7,
    peak: 3 + rand() * 9,
  });
}

// mm/h at hour h (since start), optionally with a forecast timing shift and scale.
const intensity = (h: number, shift = 0, scale = 1) =>
  showers.reduce((s, x) => {
    const u = (h - shift - x.centre) / x.half;
    return s + (Math.abs(u) < 1 ? x.peak * scale * (1 - u * u) : 0);
  }, 0);
// mm over [h0, h1], midpoint rule in 5 min steps
const mmBetween = (h0: number, h1: number, shift = 0, scale = 1) => {
  let s = 0;
  const step = 5 / 60;
  for (let h = h0 + step / 2; h < h1; h += step) s += intensity(h, shift, scale) * step;
  return s;
};

const hoursSince = (t: number) => (t - start) / HOUR;
const hourMyt = (t: number) => ((t + 8 * HOUR) % (24 * HOUR)) / HOUR;

function truthTemp(t: number) {
  const diurnal = 28.5 + 4.5 * Math.sin((2 * Math.PI * (hourMyt(t) - 9)) / 24);
  return diurnal - Math.min(3.5, intensity(hoursSince(t)) * 0.9);
}
function truthHum(t: number) {
  const base = 98 - 2.3 * (truthTemp(t) - 24);
  return clamp(base + (intensity(hoursSince(t)) > 0.1 ? 8 : 0), 52, 99);
}
function truthWind(t: number) {
  return Math.max(0.5, 6 + 3.5 * Math.sin((2 * Math.PI * (hourMyt(t) - 10)) / 24) + intensity(hoursSince(t)) * 0.8);
}

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "postgres://missing");
  const marker = process.env.SEED_DB_MARKER;
  if (!marker || !url.host.includes(marker)) {
    throw new Error(`Refusing to seed: host "${url.host}" does not contain SEED_DB_MARKER. This script is for the dev branch only.`);
  }

  // Observations every 15 min. Three slots go missing before one hour: that hour's rain total must be NULL.
  const gapHour = Math.floor((now - 30 * HOUR) / HOUR) * HOUR;
  const gap = new Set([gapHour - 45 * MIN, gapHour - 30 * MIN, gapHour - 15 * MIN]);
  const obs: (typeof observations.$inferInsert)[] = [];
  // start 3 h early, like the collector's first run (12 past slots), so the first forecast hour has all four rain slots
  for (let t = start - 3 * HOUR; t <= now; t += 15 * MIN) {
    if (gap.has(t)) continue;
    const h = hoursSince(t);
    obs.push({
      obsTime: new Date(t),
      temperatureC: round(truthTemp(t) + normal() * 0.2),
      humidityPct: Math.round(clamp(truthHum(t) + normal() * 1.2, 40, 100)),
      precipitationMm: round(Math.max(0, mmBetween(h - 0.25, h) * (1 + normal() * 0.1)), 2),
      windSpeedKmh: round(truthWind(t) + normal() * 0.5),
    });
  }

  // Forecasts: one issue per hour, leads 0..48. Error grows with lead time.
  const fc: (typeof forecasts.$inferInsert)[] = [];
  for (let issued = start; issued <= Math.floor(now / HOUR) * HOUR; issued += HOUR) {
    const issueBias = normal() * 0.35; // an issue is wrong in a correlated way
    const timing = normal(); // shower timing error for this issue
    const strength = Math.exp(normal() * 0.25);
    for (let lead = 0; lead <= 48; lead++) {
      const target = issued + lead * HOUR;
      if (target > endForecast) break;
      const h = hoursSince(target);
      const sigma = 0.35 + 0.05 * lead;
      const shift = timing * 0.12 * Math.sqrt(lead);
      const fcMm = mmBetween(h - 1, h, shift, strength);
      const wide = mmBetween(h - 2.5, h + 1, shift, strength) / 3.5;
      fc.push({
        issuedAt: new Date(issued),
        targetTime: new Date(target),
        leadHours: lead,
        temperatureC: round(truthTemp(target) + 0.3 + issueBias + normal() * sigma),
        humidityPct: Math.round(clamp(truthHum(target) - 1 + issueBias * 3 + normal() * (2 + 0.35 * lead), 35, 100)),
        precipitationMm: round(Math.max(0, fcMm), 1),
        precipProbPct: Math.round(clamp(4 + 92 * (1 - Math.exp(-1.6 * wide)) + normal() * (3 + 0.25 * lead), 0, 100)),
        windSpeedKmh: round(Math.max(0, truthWind(target) + normal() * (0.8 + 0.12 * lead))),
      });
    }
  }

  // ESP32 every 5 min, small sensor bias, plate stays wet a while after rain. One 55 min outage.
  const outageStart = Math.floor((now - 50 * HOUR) / HOUR) * HOUR + 10 * MIN;
  const dev: (typeof deviceReadings.$inferInsert)[] = [];
  let wet = 0;
  for (let t = start + 3 * MIN; t <= now; t += 5 * MIN) {
    wet = Math.max(clamp(intensity(hoursSince(t)) / 2, 0, 1), wet * 0.8);
    if (t >= outageStart && t < outageStart + 55 * MIN) continue;
    const rainPct = Math.round(clamp(wet * 100 + normal() * 2, 0, 100));
    dev.push({
      recordedAt: new Date(t),
      temperatureC: round(truthTemp(t) + 0.4 + normal() * 0.15),
      humidityPct: round(clamp(truthHum(t) - 2 + normal() * 0.8, 20, 100)),
      pressureHpa: round(1008 + 1.8 * Math.sin((2 * Math.PI * hourMyt(t)) / 12) + normal() * 0.2),
      rainPct,
      isWet: rainPct > 35,
    });
  }

  // Collector log: every 15 min ok; errors where the gap is, plus two stray failures.
  const stray = new Set([start + 21 * HOUR, start + 40 * HOUR + 15 * MIN].map((t) => Math.floor(t / (15 * MIN)) * 15 * MIN));
  const logs: (typeof collectorLog.$inferInsert)[] = [];
  for (let t = start; t <= now; t += 15 * MIN) {
    const bad = gap.has(t) || stray.has(t);
    logs.push({
      runTime: new Date(t + 20_000),
      job: "collect",
      status: bad ? "error" : "ok",
      httpStatus: bad ? 503 : 200,
      message: bad ? "Open-Meteo returned HTTP 503" : t === start ? "+12 obs, +49 forecast rows" : "+1 obs",
    });
  }

  await db.execute(sql`TRUNCATE observations, device_readings, forecasts, collector_log RESTART IDENTITY`);
  const chunk = async <T>(rows: T[], insert: (r: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += 500) await insert(rows.slice(i, i + 500));
  };
  await chunk(obs, (r) => db.insert(observations).values(r));
  await chunk(fc, (r) => db.insert(forecasts).values(r));
  await chunk(dev, (r) => db.insert(deviceReadings).values(r));
  await chunk(logs, (r) => db.insert(collectorLog).values(r));
  console.log(
    `seeded ${obs.length} observations, ${fc.length} forecasts, ${dev.length} device rows, ${logs.length} log rows on ${url.host}`,
  );
  console.log(`gap hour (rain total must be NULL): ${new Date(gapHour).toISOString()}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
