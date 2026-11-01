---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: []
---

# Surface brief: dashboard (app/page.tsx)

Mode: Operate. One route, tabbed sections (Accuracy, Forecast vs actual, Rain, Live, Run health), shared filters in the URL.
Audience: lecturer grading on a laptop; screenshots pasted into a white Word report. Light theme (desk, daylight, white page).
Job: see how accurate the forecast is in seconds, then check the evidence (n, gaps, uptime).
Memorable moment: a changed or missing hour stays lit as a held amber row until read, like a gate change. Gaps are never filled.
Unresolved: none for layout; chart null-gap handling patched in the copied Bklit Line.

## Direction contract

THESIS: Every lead hour is a departure on a board. The forecast is judged row by row against what arrived. Refuses the SaaS KPI-tile dashboard and the weather-app card.

OWN-WORLD: White page, near-black ink (#111 family, tinted), one alert orange reserved for gaps, holds and warnings. A segmented boarding-pass strip (labelled cells separated by dashed tear lines, a barcode block as the only texture). Board table in tabular monospaced figures with ruled rows. Archivo for labels and headings, JetBrains Mono for figures only. No shadows, no gradients, hairline rules.

STORY: The visitor learns in one sentence how far off the forecast is at 1, 24 and 48 hours, sees the run behind it on the pass (window, scored, truth, run health), and trusts it because n and gaps sit beside every number.

FIRST VIEWPORT: Tab bar (product name left, five tabs, active tab underlined orange). Filter chips (dates, parameter, lead) and the "Synthetic demo data" tag when demo. One plain sentence heading with the headline error. Pass strip across the full width (Station, Window, Scored, Truth, Run health, barcode). A wide board listing lead hours 0 to 48 in steps of 6 with MAE per parameter, n and a status column (ON TIME or GAP). Under it, four small charts (temperature, humidity, wind, rain) of error by lead. Fills the whole viewport at 1440 by 900.

FORM: Boarding pass and gate board (catalog vernacular-ephemera-boarding-pass-and-gate-board), challenger, competitive verdict, layout B2 (wide board plus four small charts); seed: seed:19eda21a43154ba3

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
