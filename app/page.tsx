import { connection } from "next/server";
import { FilterBar } from "@/components/dash/filter-bar";
import { Accuracy, Health, Live, Rain, Series } from "@/components/dash/sections";
import { href, parseFilters, TABS } from "@/lib/filters";
import { windowSummary } from "@/lib/queries";

// Dynamic on purpose: the CSP nonce is made per request, and the data is live.
const mytDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(d);

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const f = parseFilters(await searchParams);
  const s = await windowSummary(f);

  const today = new Date();
  const ago = (days: number) => mytDay(new Date(today.getTime() - days * 86_400_000));
  const presets = [
    { label: "All data", to: href(f, { from: null, to: null }), current: !f.from && !f.to },
    { label: "Last 3 days", to: href(f, { from: ago(3), to: null }), current: f.from === ago(3) && !f.to },
    { label: "Today", to: href(f, { from: ago(0), to: null }), current: f.from === ago(0) && !f.to },
  ];

  return (
    <div className="screen">
      <header className="topbar">
        <span className="brand">FORECAST CHECK · SERI ISKANDAR</span>
        <nav aria-label="Sections">
          {TABS.map(([key, label]) => (
            <a key={key} className="tab" href={href(f, { tab: key })} aria-current={f.tab === key ? "page" : undefined}>{label}</a>
          ))}
        </nav>
      </header>
      <FilterBar f={f} presets={presets} demo={process.env.NEXT_PUBLIC_DEMO === "1"} />
      <main className="body">
        {f.tab === "accuracy" && <Accuracy f={f} s={s} />}
        {f.tab === "series" && <Series f={f} />}
        {f.tab === "rain" && <Rain f={f} s={s} />}
        {f.tab === "live" && <Live />}
        {f.tab === "health" && <Health f={f} s={s} />}
      </main>
    </div>
  );
}
