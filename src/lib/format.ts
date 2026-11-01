// All times are shown in Malaysia time (MYT, UTC+8).
const tz = "Asia/Kuala_Lumpur";
const dt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const day = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short" });
const hm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });

export const fmtDateTime = (d: Date | string | null) => (d ? dt.format(new Date(d)).replace(",", "") : "none");
export const fmtDay = (d: Date | string) => day.format(new Date(d));
export const fmtHM = (d: Date | string) => hm.format(new Date(d));
export const num = (v: unknown, digits = 1) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "-" : Number(v).toFixed(digits));
export const pct = (v: unknown) => (v === null || v === undefined ? "-" : `${Math.round(Number(v) * 100)}%`);
export const ago = (d: Date | string | null, now = Date.now()) => {
  if (!d) return "never";
  const m = Math.max(0, Math.round((now - new Date(d).getTime()) / 60_000));
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
};
