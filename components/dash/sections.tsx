import { AutoRefresh } from "@/components/dash/auto-refresh";
import { LeadChart } from "@/components/dash/lead-chart";
import { SeriesChart } from "@/components/dash/series-chart";
import { PARAMS, type Filters } from "@/lib/filters";
import { ago, fmtDateTime, fmtDay, fmtHM, num, pct } from "@/lib/format";
import * as q from "@/lib/queries";

type Summary = Awaited<ReturnType<typeof q.windowSummary>>;
const BOARD_LEADS = [0, 6, 12, 18, 24, 30, 36, 42, 48];
const asDate = (v: unknown) => (v ? new Date(String(v).replace(" ", "T").replace(/\+00$/, "Z")) : null);

export function Pass({ s, f }: { s: Summary; f: Filters }) {
  const window = f.from || f.to ? `${f.from ? fmtDay(`${f.from}T00:00:00+08:00`) : "start"} to ${f.to ? fmtDay(`${f.to}T00:00:00+08:00`) : "now"}` : "all data";
  return (
    <div className="pass" role="group" aria-label="Run summary">
      <div><small>Station</small><strong>Seri Iskandar</strong></div>
      <div><small>Window</small><strong>{s.hours ? `${s.hours} h` : "none"}</strong><span className="note"> {window}</span></div>
      <div><small>Scored pairs</small><strong>{(s.devPairs + s.apiPairs).toLocaleString("en-GB")}</strong></div>
      <div><small>Truth</small><strong>ESP32</strong><span className="note"> + Open-Meteo</span></div>
      <div><small>Collector uptime</small><strong>{s.uptime === null ? "-" : pct(s.uptime)}</strong></div>
      <div className="code" aria-hidden />
    </div>
  );
}

function verdict(rows: q.AccuracyRow[]) {
  const at = (l: number) => rows.find((r) => r.lead === l);
  const a = at(6), b = at(24), c = at(48);
  if (b?.tempMae != null) {
    const parts = [a, b, c].filter((r): r is q.AccuracyRow => !!r && r.tempMae != null);
    return (
      <>Compared with the ESP32, the temperature forecast is off by{" "}
        {parts.map((r, i) => (
          <span key={r.lead}>{i > 0 && (i === parts.length - 1 ? " and " : ", ")}<span className="num mono">{num(r.tempMae)}&nbsp;°C</span> at {r.lead}&nbsp;h</span>
        ))}. At 24&nbsp;h that is the average of {b.nDevice} readings.</>
    );
  }
  const w = at(24);
  if (w?.windMae != null) return <>No ESP32 readings are scored yet. Against Open-Meteo, the 24 h wind forecast is off by <span className="num mono">{num(w.windMae)} km/h</span>.</>;
  return <>Nothing is scored yet. The first forecast is scored about an hour after it was issued, once its hour has passed.</>;
}

export async function Accuracy({ f, s }: { f: Filters; s: Summary }) {
  const [rows, heat, truth] = await Promise.all([q.accuracyByLead(f), q.errorHeatmap(f), q.truthComparison(f)]);
  const board = BOARD_LEADS.map((l) => rows.find((r) => r.lead === l)).filter((r): r is q.AccuracyRow => !!r);
  const maxT = Math.max(0.01, ...board.map((r) => r.tempMae ?? 0));
  const series = (pick: (r: q.AccuracyRow) => number | null) => rows.map((r) => ({ lead: r.lead, value: pick(r) }));
  return (
    <>
      <h1 className="verdict">{verdict(rows)}</h1>
      <Pass s={s} f={f} />
      {board.length === 0 ? (
        <div className="empty">No forecast hours fall in this window yet. Widen the dates, or wait for the collector to run for an hour.</div>
      ) : (
        <>
          <div className="board">
            <table>
              <caption className="sr-only">Forecast error by hours ahead</caption>
              <thead>
                <tr>
                  <th>Hours ahead</th>
                  <th>Temp error<small>°C, vs ESP32</small></th>
                  <th className="r">Humidity error<small>%, vs ESP32</small></th>
                  <th className="r">Wind error<small>km/h, vs Open-Meteo</small></th>
                  <th className="r">Rain error<small>mm/h, vs Open-Meteo</small></th>
                  <th className="r">n ESP32</th>
                  <th className="r">n Open-Meteo</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {board.map((r, i) => {
                  const missing = r.missing;
                  return (
                    <tr key={r.lead} style={{ "--i": i } as React.CSSProperties} className={missing > 0 && missing / r.expected >= 0.1 ? "hold" : ""}>
                      <td>{String(r.lead).padStart(2, "0")} h</td>
                      <td><span className="bar" style={{ width: `${((r.tempMae ?? 0) / maxT) * 7}rem` }} />{num(r.tempMae, 2)}</td>
                      <td className="r">{num(r.humMae)}</td>
                      <td className="r">{num(r.windMae)}</td>
                      <td className="r">{num(r.rainMae, 2)}</td>
                      <td className="r">{r.nDevice}</td>
                      <td className="r">{r.nRain}</td>
                      <td className={missing > 0 ? "hold-cell" : ""}>{missing > 0 ? `${missing} h MISSING` : "ON TIME"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="note">Each figure is the mean absolute error: the average size of the miss, ignoring direction. Status counts forecast hours with no rain total because Open-Meteo data was missing. Those hours are left out, not counted as dry. Any missing hour lights its status cell orange. The whole row turns orange when 10% or more are missing.</p>
          <div className="charts">
            <div className="chart-cell"><h2 className="h">Temperature</h2><div className="plot"><LeadChart points={series((r) => r.tempMae)} unit=" °C" name="Temperature error" /></div></div>
            <div className="chart-cell"><h2 className="h">Humidity</h2><div className="plot"><LeadChart points={series((r) => r.humMae)} unit=" %" name="Humidity error" /></div></div>
            <div className="chart-cell"><h2 className="h">Wind</h2><div className="plot"><LeadChart points={series((r) => r.windMae)} unit=" km/h" name="Wind error" /></div></div>
            <div className="chart-cell"><h2 className="h">Rain amount</h2><div className="plot"><LeadChart points={series((r) => r.rainMae)} unit=" mm" digits={2} name="Rain error" /></div></div>
          </div>
        </>
      )}
      <Heat cells={heat} />
      <TruthTable truth={truth} />
    </>
  );
}

function Heat({ cells }: { cells: q.HeatCell[] }) {
  if (cells.length === 0) return null;
  const buckets = [0, 6, 12, 18, 24, 30, 36, 42, 48];
  const max = Math.max(...cells.map((c) => c.mae), 0.01);
  const by = new Map(cells.map((c) => [`${c.bucket}-${c.hour}`, c]));
  return (
    <section>
      <h2 className="h">Temperature error by hours ahead and time of day (Malaysia time)</h2>
      <div className="heat" role="img" aria-label="Heatmap of temperature error by hours ahead and hour of day">
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={h} className="h">{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>)}
        {buckets.map((b) => (
          <Row key={b} bucket={b} by={by} max={max} />
        ))}
      </div>
      <p className="note">Darker is a bigger average error. Striped cells have no data. Hours ahead are grouped in sixes.</p>
    </section>
  );
}

function Row({ bucket, by, max }: { bucket: number; by: Map<string, q.HeatCell>; max: number }) {
  return (
    <>
      <span className="h">{bucket === 48 ? "48 h" : `${bucket}-${bucket + 5} h`}</span>
      {Array.from({ length: 24 }, (_, h) => {
        const c = by.get(`${bucket}-${h}`);
        if (!c) return <span key={h} className="c none" title={`${bucket}-${bucket + 5} h ahead, ${String(h).padStart(2, "0")}:00: no data`} />;
        const k = c.mae / max;
        return (
          <span key={h} className="c" title={`${bucket}-${bucket + 5} h ahead, ${String(h).padStart(2, "0")}:00: ${c.mae.toFixed(2)} °C, n ${c.n}`}
            style={{ background: `color-mix(in oklch, var(--ink) ${Math.round(8 + k * 82)}%, var(--paper))`, color: k > 0.55 ? "var(--paper)" : "var(--ink)" }}>
            {c.mae.toFixed(1)}
          </span>
        );
      })}
    </>
  );
}

function TruthTable({ truth }: { truth: Awaited<ReturnType<typeof q.truthComparison>> }) {
  const pick = truth.filter((t) => [0, 12, 24, 36, 48].includes(t.lead));
  if (pick.length === 0) return null;
  return (
    <section>
      <h2 className="h">Does the choice of truth matter? Temperature error, same forecasts</h2>
      <div className="board" style={{ maxWidth: "46rem" }}>
        <table>
          <thead><tr><th>Hours ahead</th><th className="r">Vs ESP32 (°C)</th><th className="r">Vs Open-Meteo (°C)</th><th className="r">n</th></tr></thead>
          <tbody>{pick.map((t) => <tr key={t.lead}><td>{t.lead} h</td><td className="r">{num(t.dev, 2)}</td><td className="r">{num(t.api, 2)}</td><td className="r">{t.n}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="note">If the two columns are close, the ESP32 agrees with the model about what happened. A wide gap means the sensor reads differently from the model.</p>
    </section>
  );
}

export async function Series({ f }: { f: Filters }) {
  const all = await q.forecastVsActual(f, f.param, f.lead);
  const used = all.map((r, i) => (r.actual !== null || r.forecast !== null ? i : -1)).filter((i) => i >= 0);
  const rows = used.length ? all.slice(used[0], used[used.length - 1] + 1) : [];
  const meta = {
    temp: { unit: " °C", actual: "ESP32" },
    hum: { unit: " %", actual: "ESP32" },
    wind: { unit: " km/h", actual: "Open-Meteo" },
    rain: { unit: " mm", actual: "Open-Meteo" },
  }[f.param];
  const name = PARAMS.find(([k]) => k === f.param)![1];
  const have = rows.filter((r) => r.actual !== null && r.forecast !== null).length;
  return (
    <>
      <h1 className="verdict">{name}: the forecast issued {f.lead}&nbsp;h ahead, against what was measured.</h1>
      <div className="legend">
        <span><i style={{ borderColor: "var(--ink)" }} />Actual ({meta.actual})</span>
        <span><i style={{ borderColor: "var(--forecast)" }} />Forecast made {f.lead} h earlier</span>
        <span>{have} matched hours. A break in a line is missing data.</span>
      </div>
      {have === 0 ? (
        <div className="empty">No matched hours yet for this window and lead time. A {f.lead} h forecast can only be scored {f.lead} h after it was first issued.</div>
      ) : (
        <div style={{ height: "min(62vh, 36rem)", minHeight: "22rem" }}>
          <SeriesChart rows={rows} unit={meta.unit} actualName={`Actual (${meta.actual})`} />
        </div>
      )}
    </>
  );
}

export async function Rain({ f, s }: { f: Filters; s: Summary }) {
  const rows = await q.rainContingency(f);
  const sel = rows.find((r) => r.lead === f.lead);
  const total = rows.reduce((a, r) => a + r.hits + r.misses + r.falseAlarms + r.correctNeg, 0);
  return (
    <>
      <h1 className="verdict">
        {sel && sel.hits + sel.misses > 0 ? (
          <>At {f.lead} h ahead, the forecast caught <span className="num mono">{sel.hits}</span> of <span className="num mono">{sel.hits + sel.misses}</span> rainy hours.</>
        ) : (
          <>Rain is scored as wet or dry. Forecast: 0.1 mm/h or more. Observed: the ESP32 rain plate was wet.</>
        )}
      </h1>
      <Pass s={s} f={f} />
      {total === 0 ? (
        <div className="empty">No rain hours are scored yet. This needs ESP32 rain-plate readings that cover an hour with a forecast.</div>
      ) : (
        <>
          <div className="board">
            <table>
              <thead>
                <tr><th>Hours ahead</th><th className="r">Hits</th><th className="r">Misses</th><th className="r">False alarms</th><th className="r">Correct dry</th><th className="r">POD</th><th className="r">FAR</th><th className="r">CSI</th><th className="r">Brier</th></tr>
              </thead>
              <tbody>
                {rows.filter((r) => [0, 1, 3, 6, 12, 18, 24, 36, 48].includes(r.lead)).map((r) => (
                  <tr key={r.lead} className={r.lead === f.lead ? "sel" : ""}>
                    <td>{String(r.lead).padStart(2, "0")} h</td><td className="r">{r.hits}</td><td className="r">{r.misses}</td><td className="r">{r.falseAlarms}</td><td className="r">{r.correctNeg}</td>
                    <td className="r">{pct(r.pod)}</td><td className="r">{pct(r.far)}</td><td className="r">{pct(r.csi)}</td><td className="r">{num(r.brier, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="readings">
            <div><dt>POD (probability of detection): {sel ? pct(sel.pod) : "-"}</dt><dd>Of the hours it rained, the share the forecast warned about. Higher is better.</dd></div>
            <div><dt>FAR (false alarm ratio): {sel ? pct(sel.far) : "-"}</dt><dd>Of the hours the forecast said rain, the share that stayed dry. Lower is better.</dd></div>
            <div><dt>CSI (critical success index): {sel ? pct(sel.csi) : "-"}</dt><dd>Hits out of all hours with forecast or observed rain. One number for both mistakes. Higher is better.</dd></div>
            <div><dt>Brier score: {sel ? num(sel.brier, 3) : "-"}</dt><dd>Error of the rain chance in percent. 0 is perfect, 0.25 is a coin toss. Lower is better.</dd></div>
          </dl>
          <div className="charts" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))", flex: "none", height: "14rem" }}>
            <div className="chart-cell"><h2 className="h">CSI by hours ahead (0 to 1)</h2><div className="plot"><LeadChart points={rows.map((r) => ({ lead: r.lead, value: r.csi }))} unit="" digits={2} name="CSI" /></div></div>
            <div className="chart-cell"><h2 className="h">Brier score by hours ahead</h2><div className="plot"><LeadChart points={rows.map((r) => ({ lead: r.lead, value: r.brier }))} unit="" digits={3} name="Brier" /></div></div>
          </div>
        </>
      )}
    </>
  );
}

export async function Live() {
  const { dev, obs, fc, nowMs } = await q.liveNow();
  const devTime = asDate(dev?.recorded_at);
  const prob = fc ? Number(fc.precip_prob_pct) : null;
  const rainFlag = prob !== null && prob >= 60;
  const stale = devTime ? nowMs - devTime.getTime() > 15 * 60_000 : true;
  return (
    <>
      <AutoRefresh />
      <h1 className="verdict">{!dev ? "The ESP32 has not posted yet." : rainFlag ? "Rain is likely in the next hour." : "No rain is expected in the next hour."}</h1>
      <div className="pass" role="group" aria-label="ESP32 now">
        <div><small>ESP32 temperature</small><strong>{dev ? `${num(dev.temperature_c)} °C` : "-"}</strong></div>
        <div><small>ESP32 humidity</small><strong>{dev ? `${num(dev.humidity_pct, 0)} %` : "-"}</strong></div>
        <div><small>Pressure</small><strong>{dev ? `${num(dev.pressure_hpa, 0)} hPa` : "-"}</strong></div>
        <div><small>Rain plate</small><strong>{dev ? (dev.is_wet ? "WET" : "DRY") : "-"}</strong><span className="note"> {dev ? `${dev.rain_pct} %` : ""}</span></div>
        <div className={stale ? "stale" : ""}><small>Last ESP32 post</small><strong>{devTime ? ago(devTime, nowMs) : "never"}</strong></div>
      </div>
      <div className="pass" role="group" aria-label="Open-Meteo now">
        <div><small>Open-Meteo temperature</small><strong>{obs ? `${num(obs.temperature_c)} °C` : "-"}</strong></div>
        <div><small>Open-Meteo humidity</small><strong>{obs ? `${num(obs.humidity_pct, 0)} %` : "-"}</strong></div>
        <div><small>Wind</small><strong>{obs ? `${num(obs.wind_speed_kmh)} km/h` : "-"}</strong></div>
        <div><small>Rain, last 15 min</small><strong>{obs ? `${num(obs.precipitation_mm, 2)} mm` : "-"}</strong></div>
        <div><small>As of</small><strong>{obs ? fmtHM(asDate(obs.obs_time)!) : "-"}</strong></div>
      </div>
      <div className="pass" role="group" aria-label="Rain flag">
        <div><small>Rain flag (next hour)</small><strong>{fc ? (rainFlag ? "RAIN" : "NO RAIN") : "-"}</strong></div>
        <div><small>Chance of rain</small><strong>{prob === null ? "-" : `${prob} %`}</strong></div>
        <div><small>For the hour ending</small><strong>{fc ? fmtHM(asDate(fc.target_time)!) : "-"}</strong></div>
        <div><small>Forecast issued</small><strong>{fc ? fmtDateTime(asDate(fc.issued_at)) : "-"}</strong></div>
      </div>
      <p className="note">This is the flag the ESP32 receives. The flag is on when the chance of rain is 60% or more. The page refreshes every minute. Times are Malaysia time.</p>
    </>
  );
}

export async function Health({ f, s }: { f: Filters; s: Summary }) {
  const h = await q.runHealth(f);
  const lastRunOk = h.lastRun?.status === "ok";
  return (
    <>
      <AutoRefresh />
      <h1 className="verdict">
        {s.expectedRuns === 0 ? "The collector has not run in this window." : <>The collector ran <span className="num mono">{s.runsOk}</span> of <span className="num mono">{s.expectedRuns}</span> expected times.</>}
      </h1>
      <div className="pass" role="group" aria-label="Run health">
        <div><small>Collector uptime</small><strong>{s.uptime === null ? "-" : pct(s.uptime)}</strong></div>
        <div><small>ESP32 uptime</small><strong>{h.device.uptime === null ? "-" : pct(h.device.uptime)}</strong><span className="note"> {h.device.n} of {h.device.expected}</span></div>
        <div className={lastRunOk ? "" : "stale"}><small>Last collector run</small><strong>{h.lastRun ? ago(h.lastRun.time) : "never"}</strong><span className="note"> {h.lastRun?.status ?? ""}</span></div>
        <div><small>Last ESP32 post</small><strong>{h.device.last ? ago(h.device.last) : "never"}</strong></div>
      </div>
      <section>
        <h2 className="h">Gaps in the 15-minute data</h2>
        {h.gaps.length === 0 ? <p className="note">No gaps in this window.</p> : (
          <div className="board" style={{ maxWidth: "46rem" }}><table>
            <thead><tr><th>Last data before</th><th>Next data</th><th className="r">Missing</th></tr></thead>
            <tbody>{h.gaps.map((g) => (
              <tr key={g.start.toISOString()} className="hold"><td>{fmtDateTime(g.start)}</td><td>{fmtDateTime(g.end)}</td><td className="r">{Math.round((g.end.getTime() - g.start.getTime()) / 60_000) - 15} min</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      <section>
        <h2 className="h">Failed collector runs</h2>
        {h.errors.length === 0 ? <p className="note">No failed runs in this window.</p> : (
          <div className="board" style={{ maxWidth: "56rem" }}><table>
            <thead><tr><th>Time</th><th className="r">HTTP</th><th>Message</th></tr></thead>
            <tbody>{h.errors.map((e) => <tr key={e.time.toISOString()} className="hold"><td>{fmtDateTime(e.time)}</td><td className="r">{e.http ?? "-"}</td><td>{e.message}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
