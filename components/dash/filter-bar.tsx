"use client";

import { useRouter } from "next/navigation";
import { href, LEADS, PARAMS, type Filters } from "@/lib/filters";

type Link = { label: string; to: string; current: boolean };

// The URL is the state. Every change pushes a new URL, and the server page renders from it.
export function FilterBar({ f, presets, demo }: { f: Filters; presets: Link[]; demo: boolean }) {
  const router = useRouter();
  const go = (over: Parameters<typeof href>[1]) => router.push(href(f, over));
  const showLead = f.tab === "series" || f.tab === "rain";
  return (
    <div className="filters" role="group" aria-label="Filters">
      {presets.map((p) => (
        <a key={p.label} className="chip" href={p.to} aria-current={p.current}>{p.label}</a>
      ))}
      <label>From <input type="date" value={f.from ?? ""} onChange={(e) => go({ from: e.target.value || null })} /></label>
      <label>To <input type="date" value={f.to ?? ""} onChange={(e) => go({ to: e.target.value || null })} /></label>
      {f.tab === "series" && (
        <label>Parameter
          <select value={f.param} onChange={(e) => go({ param: e.target.value as Filters["param"] })}>
            {PARAMS.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
          </select>
        </label>
      )}
      {showLead && (
        <label>Hours ahead
          <select value={f.lead} onChange={(e) => go({ lead: Number(e.target.value) })}>
            {LEADS.map((l) => <option key={l} value={l}>{l} h</option>)}
          </select>
        </label>
      )}
      {demo && <span className="tag">SYNTHETIC DEMO DATA</span>}
    </div>
  );
}
