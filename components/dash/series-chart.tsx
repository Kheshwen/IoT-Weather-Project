"use client";

import { curveLinear } from "@visx/curve";
import { Grid } from "@/components/charts/grid";
import { LineChart } from "@/components/charts/line-chart";
import { Line } from "@/components/charts/line";
import { ChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";

export type SeriesRow = { t: number; forecast: number | null; actual: number | null };

const mytLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

// Forecast vs actual over time. A null value breaks the line, so a missing hour is a visible gap.
export function SeriesChart({ rows, unit, actualName }: { rows: SeriesRow[]; unit: string; actualName: string }) {
  // The chart's y axis always starts at 0. Subtract a base so a 24 to 35 °C range fills the plot, and add it back in labels.
  const vals = rows.flatMap((r) => [r.forecast, r.actual]).filter((v): v is number => v !== null);
  const base = vals.length ? Math.floor(Math.min(...vals) * 0.98) : 0;
  const sh = (v: number | null) => (v === null ? null : v - base);
  const data = rows.map((r) => ({ date: new Date(r.t), forecast: sh(r.forecast), actual: sh(r.actual) }));
  const labels = rows.map((r) => mytLabel.format(r.t).replace(",", ""));
  const fmt = (v: unknown) => (v == null ? "no data" : `${((v as number) + base).toFixed(1)}${unit}`);
  return (
    <LineChart data={data} aspectRatio="" className="h-full" margin={{ top: 12, right: 16, bottom: 34, left: 48 }}>
      <Grid horizontal numTicksRows={4} />
      <Line dataKey="actual" curve={curveLinear} stroke="var(--ink)" strokeWidth={3} animate={false} fadeEdges={false} showHighlight={false} />
      <Line dataKey="forecast" curve={curveLinear} stroke="var(--forecast)" strokeWidth={2} animate={false} fadeEdges={false} showHighlight={false} />
      <XAxis numTicks={6} labels={labels} />
      <YAxis numTicks={4} formatValue={(v) => `${Number((v + base).toFixed(1))}${unit}`} />
      <ChartTooltip
        dateLabels={labels}
        showDatePill={false}
        rows={(p) => [
          { color: "var(--ink)", label: actualName, value: fmt(p.actual) },
          { color: "var(--forecast)", label: "Forecast", value: fmt(p.forecast) },
        ]}
      />
    </LineChart>
  );
}
