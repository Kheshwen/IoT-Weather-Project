import { desc, eq } from "drizzle-orm";
import { deviceReadings, forecasts } from "@/db/schema";
import { safeEqual } from "@/lib/auth";
import { db } from "@/lib/db";
import { nextHour } from "@/lib/open-meteo";

export const dynamic = "force-dynamic";

const RAIN_PROB_THRESHOLD = 60;

const num = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

// ESP32 posts a reading every 5 minutes with the x-device-token header.
export async function POST(request: Request) {
  if (!safeEqual(request.headers.get("x-device-token"), process.env.DEVICE_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const b = await request.json().catch(() => null);
  if (
    !b ||
    !num(b.temperature_c, -40, 85) || // BME280 operating range
    !num(b.humidity_pct, 0, 100) ||
    !num(b.pressure_hpa, 300, 1100) ||
    !num(b.rain_pct, 0, 100) ||
    typeof b.is_wet !== "boolean"
  ) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  // Server sets recorded_at (the ESP32 has no clock).
  await db
    .insert(deviceReadings)
    .values({
      temperatureC: b.temperature_c,
      humidityPct: b.humidity_pct,
      pressureHpa: b.pressure_hpa,
      rainPct: Math.round(b.rain_pct),
      isWet: b.is_wet,
    })
    .onConflictDoNothing();

  // Same slot the old sketch read as precipitation_probability[1]: the next full hour.
  const target = nextHour();
  // The reading is already stored. If the lookup fails, answer "no flag" instead of a 500,
  // or the ESP32 retries and stores the same reading twice.
  let prob: number | null = null;
  try {
    const [latest] = await db
      .select({ p: forecasts.precipProbPct })
      .from(forecasts)
      .where(eq(forecasts.targetTime, target))
      .orderBy(desc(forecasts.issuedAt))
      .limit(1);
    prob = latest?.p ?? null;
  } catch (e) {
    console.error("forecast lookup failed", e);
  }

  return Response.json({
    rain_flag: prob !== null && prob >= RAIN_PROB_THRESHOLD,
    precip_prob_pct: prob,
    target_time: target.toISOString(),
  });
}
