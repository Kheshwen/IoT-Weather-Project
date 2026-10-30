// URL search params are the dashboard state, so any view can be shared as a link.
export const TABS = [
  ["accuracy", "Accuracy"],
  ["series", "Forecast vs actual"],
  ["rain", "Rain"],
  ["live", "Live"],
  ["health", "Run health"],
] as const;
export type Tab = (typeof TABS)[number][0];

export const PARAMS = [
  ["temp", "Temperature"],
  ["hum", "Humidity"],
  ["wind", "Wind"],
  ["rain", "Rain"],
] as const;
export type Param = (typeof PARAMS)[number][0];

export const LEADS = [1, 3, 6, 12, 24, 48] as const;

export type Filters = {
  tab: Tab;
  param: Param;
  lead: number;
  from: string | null; // YYYY-MM-DD, Malaysia date
  to: string | null;
  /** Window as instants. Open-ended when the date is not set. */
  start: Date;
  end: Date;
};

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const isDate = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export function parseFilters(sp: SP): Filters {
  const tab = TABS.find(([k]) => k === one(sp.tab))?.[0] ?? "accuracy";
  const param = PARAMS.find(([k]) => k === one(sp.param))?.[0] ?? "temp";
  const leadN = Number(one(sp.lead));
  const lead = (LEADS as readonly number[]).includes(leadN) ? leadN : 24;
  const f = one(sp.from);
  const t = one(sp.to);
  const from = isDate(f) ? f : null;
  const to = isDate(t) ? t : null;
  const start = from ? new Date(`${from}T00:00:00+08:00`) : new Date(0);
  const end = to ? new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 24 * 3_600_000) : new Date("2100-01-01T00:00:00Z");
  return { tab, param, lead, from, to, start, end };
}

/** Query string for a link, keeping the current filters and overriding some. */
export function href(f: Filters, over: Partial<Pick<Filters, "tab" | "param" | "lead" | "from" | "to">> = {}) {
  const m = { ...f, ...over };
  const q = new URLSearchParams();
  if (m.tab !== "accuracy") q.set("tab", m.tab);
  if (m.tab === "series" && m.param !== "temp") q.set("param", m.param);
  if ((m.tab === "series" || m.tab === "rain") && m.lead !== 24) q.set("lead", String(m.lead));
  if (m.from) q.set("from", m.from);
  if (m.to) q.set("to", m.to);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}
