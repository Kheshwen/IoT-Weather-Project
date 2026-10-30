import { collectorLog, forecasts, observations } from "@/db/schema";
import { safeEqual } from "@/lib/auth";
import { db } from "@/lib/db";
import { OPEN_METEO_URL, parseOpenMeteo } from "@/lib/open-meteo";

export const dynamic = "force-dynamic";

// Called by cron-job.org every 15 minutes with the x-cron-secret header.
export async function GET(request: Request) {
  if (!safeEqual(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let httpStatus: number | null = null;
  let status = "ok";
  let message = "";
  try {
    const res = await fetch(OPEN_METEO_URL, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    httpStatus = res.status;
    if (!res.ok) throw new Error(`Open-Meteo returned HTTP ${res.status}`);

    const { observations: obs, forecasts: fc } = parseOpenMeteo(await res.json(), new Date());
    // ON CONFLICT DO NOTHING: a repeat run never overwrites. The first forecast of an hour is kept as issued.
    const newObs = obs.length ? await db.insert(observations).values(obs).onConflictDoNothing().returning({ t: observations.obsTime }) : [];
    const newFc = fc.length ? await db.insert(forecasts).values(fc).onConflictDoNothing().returning({ t: forecasts.targetTime }) : [];
    message = `+${newObs.length} obs, +${newFc.length} forecast rows`;
  } catch (e) {
    status = "error";
    message = e instanceof Error ? e.message : String(e);
  }

  try {
    await db.insert(collectorLog).values({ job: "collect", status, httpStatus, message });
  } catch (e) {
    console.error("collector_log insert failed", e);
    return Response.json({ status, message, log: "failed" }, { status: 500 });
  }
  // Non-2xx on error so cron-job.org marks the run as failed.
  return Response.json({ status, message }, { status: status === "ok" ? 200 : 502 });
}
