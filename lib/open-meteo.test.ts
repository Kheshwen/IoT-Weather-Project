import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOpenMeteo } from "./open-meteo";

const T0 = Date.UTC(2026, 9, 30, 3, 0, 0) / 1000; // 03:00 UTC = 11:00 MYT
const now = new Date((T0 + 10 * 60) * 1000); // 03:10 UTC

const fixture = {
  minutely_15: {
    // 12 past slots 00:15..03:00 plus one future slot 03:15 that must be dropped
    time: Array.from({ length: 13 }, (_, i) => T0 + 900 - (12 - i) * 900),
    temperature_2m: Array(13).fill(28),
    relative_humidity_2m: Array(13).fill(80),
    precipitation: Array(13).fill(0.1),
    wind_speed_10m: Array(13).fill(5),
  },
  hourly: {
    // one stale hour (02:00), 03:00..05:00+48h (50 more), so 0..48 cut is exercised
    time: Array.from({ length: 52 }, (_, i) => T0 + (i - 1) * 3600),
    temperature_2m: Array(52).fill(30),
    relative_humidity_2m: Array(52).fill(70),
    precipitation: Array(52).fill(0),
    precipitation_probability: Array(52).fill(40),
    wind_speed_10m: Array(52).fill(7),
  },
};

test("issued_at is the UTC hour; unixtime becomes the right instant", () => {
  const { issuedAt, forecasts } = parseOpenMeteo(fixture, now);
  assert.equal(issuedAt.toISOString(), "2026-10-30T03:00:00.000Z");
  assert.equal(forecasts[0]!.targetTime.toISOString(), "2026-10-30T03:00:00.000Z");
});

test("forecast leads are 0..48 and the past hour is dropped", () => {
  const { forecasts } = parseOpenMeteo(fixture, now);
  assert.equal(forecasts.length, 49);
  assert.equal(forecasts[0]!.leadHours, 0);
  assert.equal(forecasts.at(-1)!.leadHours, 48);
  assert.ok(forecasts.every((f) => f.precipProbPct === 40));
});

test("observations in the future are dropped", () => {
  const { observations } = parseOpenMeteo(fixture, now);
  assert.equal(observations.length, 12);
  assert.equal(observations.at(-1)!.obsTime.toISOString(), "2026-10-30T03:00:00.000Z");
});

test("missing series give empty arrays, not a crash", () => {
  const r = parseOpenMeteo({}, now);
  assert.deepEqual([r.observations.length, r.forecasts.length], [0, 0]);
});
