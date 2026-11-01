// Pure parsing of one Open-Meteo response into DB rows. No I/O, so it is testable.

export const OPEN_METEO_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=4.3597&longitude=100.9782&timeformat=unixtime" +
  "&minutely_15=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m" +
  "&past_minutely_15=12&forecast_minutely_15=0" + // 12 past 15-min slots = 3 h of gap fill
  "&hourly=temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m" +
  "&forecast_hours=49"; // lead 0..48

export const MAX_LEAD_HOURS = 48;

type Series = Record<string, (number | null)[]>;
export type OpenMeteoJson = { minutely_15?: Series; hourly?: Series };

export type ObservationRow = {
  obsTime: Date;
  temperatureC: number | null;
  humidityPct: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
};

export type ForecastRow = {
  issuedAt: Date;
  targetTime: Date;
  leadHours: number;
  temperatureC: number | null;
  humidityPct: number | null;
  precipitationMm: number | null;
  precipProbPct: number | null;
  windSpeedKmh: number | null;
};

const HOUR_MS = 3_600_000;

/** The next full hour. The ESP32 flag and the Live tab both read the forecast for this hour. */
export const nextHour = (now = Date.now()) => new Date(Math.floor(now / HOUR_MS) * HOUR_MS + HOUR_MS);

export function parseOpenMeteo(json: OpenMeteoJson, now: Date) {
  const nowMs = now.getTime();
  const issuedAt = new Date(Math.floor(nowMs / HOUR_MS) * HOUR_MS);

  const m = json.minutely_15;
  const observations: ObservationRow[] = [];
  for (let i = 0; m && i < (m.time?.length ?? 0); i++) {
    const t = m.time[i]! * 1000;
    if (t > nowMs) continue; // never store a slot that has not happened yet
    observations.push({
      obsTime: new Date(t),
      temperatureC: m.temperature_2m?.[i] ?? null,
      humidityPct: m.relative_humidity_2m?.[i] ?? null,
      precipitationMm: m.precipitation?.[i] ?? null,
      windSpeedKmh: m.wind_speed_10m?.[i] ?? null,
    });
  }

  const h = json.hourly;
  const forecasts: ForecastRow[] = [];
  for (let i = 0; h && i < (h.time?.length ?? 0); i++) {
    const t = h.time[i]! * 1000;
    const leadHours = Math.round((t - issuedAt.getTime()) / HOUR_MS);
    if (leadHours < 0 || leadHours > MAX_LEAD_HOURS) continue;
    forecasts.push({
      issuedAt,
      targetTime: new Date(t),
      leadHours,
      temperatureC: h.temperature_2m?.[i] ?? null,
      humidityPct: h.relative_humidity_2m?.[i] ?? null,
      precipitationMm: h.precipitation?.[i] ?? null,
      precipProbPct: h.precipitation_probability?.[i] ?? null,
      windSpeedKmh: h.wind_speed_10m?.[i] ?? null,
    });
  }

  return { issuedAt, observations, forecasts };
}
