# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Next.js (App Router, TypeScript, Tailwind v4) on Vercel Hobby, Drizzle over Neon Postgres. Decided by the team before design work. Charts: Bklit UI (visx + Motion, shadcn registry).

## Users
Primary: the lecturer who grades the TFB2093 Embedded Systems group project. They open the public URL on a laptop, and they see the same charts as screenshots in the report and as a 2-minute demo video. Secondary: the team members, who check that the collector and the ESP32 are alive during the 72-hour run.

## Product Purpose
Show how accurate the Open-Meteo hourly forecast is for Seri Iskandar, Perak. Every forecast is stored as issued. Each one is later compared with what happened, measured by an ESP32 station (temperature, humidity, rain plate) and by Open-Meteo itself (wind, rain amount). Success: the first screen answers "how accurate is the forecast" in a few seconds, and every number can be traced to a run with enough samples.

## Positioning
A forecast-accuracy record, not a weather app. It is built on forecasts frozen at issue time and scored by lead time (0 to 48 hours), with a physical sensor as ground truth. A weather app shows tomorrow; this shows how wrong yesterday's tomorrow was.

## Operating Context
- Data window: 72 hours or more of continuous collection, about 31 Oct to 8 Nov 2026. Report is due 8 Nov.
- Collector: cron-job.org calls `/api/collect` every 15 minutes. ESP32 posts to `/api/ingest` every 5 minutes.
- All displayed times are Malaysia time (MYT, UTC+8).
- Report sections 3 and 4 are final and name the tables, views, and metrics (MAE, RMSE, bias, POD, FAR, CSI, Brier score).
- Screenshots go into a Word report (white page), so the interface must read well in light theme.

## Capabilities and Constraints
- Metrics per lead hour: bias, MAE, RMSE for temperature, humidity, wind, rain amount; rain yes/no scores (hits, misses, false alarms, POD, FAR, CSI, Brier).
- Ground truth split: temperature and humidity vs ESP32; wind and rain amount vs Open-Meteo; rain yes/no vs the rain plate. No toggle on headline numbers.
- Free tiers only (Vercel Hobby, Neon free, cron-job.org). Public read-only URL, no accounts.
- Gaps in collection must show as gaps, never as zero.
- Sample size (n) must be visible next to every accuracy number.

## Brand Commitments
Must not feel like a generic SaaS admin template, a weather-app clone, or too scientific to read fast. No logo or brand assets exist.

## Evidence on Hand
Real data starts when the collector goes live. Until then, a synthetic 72-hour seed (Neon dev branch, labelled "Synthetic demo data") stands in for screenshots. No real results exist yet; do not invent numbers.

## Product Principles
1. Answer the headline question first: how accurate is the forecast, in plain words.
2. Show how much data stands behind a number (n, gaps, uptime).
3. Plain language beside every technical metric.
4. Honest about missing data: gaps are visible, never filled.
5. Shareable state: filters live in the URL.

## Accessibility & Inclusion
Legible on a projector and when pasted into a printed report. Do not rely on colour alone to separate series. Respect reduced motion.
