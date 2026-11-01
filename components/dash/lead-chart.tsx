"use client";

import { curveLinear } from "@visx/curve";
import { Grid } from "@/components/charts/grid";
import { LineChart } from "@/components/charts/line-chart";
import { Line } from "@/components/charts/line";
import { ChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";

export type LeadPoint = { lead: number; value: number | null };

// Bklit draws time series, so a lead time of N hours is plotted as N hours after the epoch.
// The 0 h label is blank so it does not collide with the y-axis 0; the tooltip still says "0 h".
// Axis and tooltip labels are replaced with "N h", so no date is ever shown.
export function LeadChart({ points, unit, digits = 1, name }: { points: LeadPoint[]; unit: string; digits?: number; name: string }) {
  const rows = points.map((p) => ({ date: new Date(p.lead * 3_600_000), value: p.value }));
  const labels = points.map((p) => `${p.lead} h`);
  const max = Math.max(0, ...points.map((p) => p.value ?? 0));
  return (
    <LineChart
      data={rows}
      aspectRatio=""
      className="h-full"
      margin={{ top: 10, right: 12, bottom: 30, left: 58 }}
      yScaleDomainMax={max || 1}
    >
      <Grid horizontal numTicksRows={3} />
      <Line dataKey="value" curve={curveLinear} stroke="var(--ink)" strokeWidth={2.5} animate={false} fadeEdges={false} showHighlight={false} />
      <XAxis numTicks={5} labels={labels.map((l, i) => (i === 0 ? "" : l))} />
      <YAxis numTicks={3} formatValue={(v) => (v === 0 ? "0" : `${Number(v.toFixed(2))}${unit}`)} />
      <ChartTooltip
        dateLabels={labels}
        showDatePill={false}
        rows={(p) => [{ color: "var(--ink)", label: name, value: p.value == null ? "no data" : `${(p.value as number).toFixed(digits)}${unit}` }]}
      />
    </LineChart>
  );
}
