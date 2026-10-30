---
name: Forecast Check
description: A boarding pass and gate board that judges the Open-Meteo forecast against what the ESP32 and Open-Meteo measured.
colors:
  ink: "oklch(0.18 0.012 270)"
  ink-soft: "oklch(0.42 0.012 270)"
  paper: "oklch(1 0 0)"
  wash: "oklch(0.975 0.004 270)"
  rule: "oklch(0.88 0.006 270)"
  primary-accent: "oklch(0.45 0.09 195)"
  amber: "oklch(0.7 0.19 48)"
  amber-ink: "oklch(0.48 0.14 48)"
  amber-wash: "oklch(0.96 0.045 65)"
  forecast: "oklch(0.5 0.15 255)"
typography:
  verdict:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.2rem, 1.7vw, 1.65rem)"
    fontWeight: 700
    lineHeight: 1.25
  pass-value:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.45rem"
    fontWeight: 800
    lineHeight: 1.2
  brand:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 800
    letterSpacing: "0.02em"
  heading:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 700
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  note:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.88rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 600
    letterSpacing: "0.1em"
  board-figure:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.98rem"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  hairline: "2px"
  tag: "4px"
  control: "6px"
  panel: "8px"
  pass: "10px"
spacing:
  xs: "0.4rem"
  sm: "0.6rem"
  md: "1rem"
  lg: "1.6rem"
  tab-gap: "2.2rem"
  page-gutter: "clamp(1rem, 3vw, 3rem)"
components:
  topbar:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    height: "3.6rem"
  tab-active:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
  chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.4rem 0.7rem"
  chip-current:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
  tag-demo:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tag}"
    padding: "0.35rem 0.7rem"
  pass-strip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pass}"
    padding: "0.5rem 1.1rem"
  pass-cell-stale:
    backgroundColor: "{colors.amber-wash}"
    textColor: "{colors.amber-ink}"
  board-row-hold:
    backgroundColor: "{colors.amber-wash}"
    textColor: "{colors.amber-ink}"
    typography: "{typography.board-figure}"
  board-cell-hold:
    backgroundColor: "{colors.amber-wash}"
    textColor: "{colors.amber-ink}"
  empty-note:
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.panel}"
    padding: "1.2rem 1.4rem"
---

# Design System: Forecast Check

## Overview

**Creative North Star: "The Gate Board"**

Every forecast lead hour is a departure on a board. The page judges each row against what arrived. It reads like a boarding pass pinned above a departures table, on a white page that survives being pasted into a Word report. The reader is a lecturer at a desk. The theme is light, only light.

The system is flat and ruled. Depth comes from rules, dashed tear lines and weight, never from shadow or gradient. Figures are monospaced and tabular so columns align. Archivo carries every label and sentence. JetBrains Mono carries figures only. One orange marks the places where data is missing or late. A deep teal marks the current place. The only texture is the barcode block at the end of the pass strip.

Every number sits beside its n and its gaps. Missing data is shown as missing. It is never filled, smoothed or counted as zero.

**Key Characteristics:**
- White paper, tinted near-black ink, one alert orange.
- Segmented pass strip with dashed tear lines and a barcode block.
- Board tables with tabular mono figures and ruled rows.
- Hairline rules, heavy 3px ink rule under the top bar. No shadows, no gradients.
- A plain-sentence verdict heading leads each tab.

## Colors

A near-monochrome ink-on-paper palette with a teal primary, one alert orange and one blue. The blue exists only to separate the forecast line from the actual line.

### Primary
- **Gate Ink** (oklch(0.18 0.012 270)): text, the actual-data line, borders on the pass strip, the selected chip fill, heatmap fill, bars.
- **Deep Teal** (oklch(0.45 0.09 195)): the primary accent. Active tab underline, focus ring, text selection.
- **Alert Orange** (oklch(0.7 0.19 48)): gap and hold markers and the bar in a held row. Nothing else.

### Secondary
- **Forecast Blue** (oklch(0.5 0.15 255)): the forecast line and its legend swatch on the forecast-versus-actual chart. Nothing else.

### Neutral
- **Soft Ink** (oklch(0.42 0.012 270)): labels, notes, inactive tabs, chart axis text, crosshair.
- **Paper** (oklch(1 0 0)): page and control background.
- **Wash** (oklch(0.975 0.004 270)): stripe in no-data heatmap cells.
- **Rule** (oklch(0.88 0.006 270)): hairlines, dashed tear lines, row dividers, chart grid.
- **Hold Wash** (oklch(0.96 0.045 65)) and **Hold Ink** (oklch(0.48 0.14 48)): background and text of a held row or cell and of a stale pass cell.

### Named Rules
**The One Alert Rule.** Orange means a gap, a hold, a stale reading or a warning. Teal marks the current place (active tab, focus, selection). Neither decorates and neither encodes a good value.

**The Held Row Rule.** A row with any missing hour lights its status cell in Hold Wash. A row with 10% or more missing lights the whole row. Missing is never hidden and never counted as dry.

**The Two Lines Rule.** Actual is ink, forecast is blue. No third chart color exists.

## Typography

**Display Font:** Archivo (with system-ui, sans-serif)
**Body Font:** Archivo
**Label/Mono Font:** JetBrains Mono (with ui-monospace), figures only

**Character:** Archivo is a plain, sturdy grotesque, heavy at 700 to 800 for sentences and values. JetBrains Mono gives the board its departures-sign figures. The whole page uses tabular numerals.

### Hierarchy
- **Verdict** (700, clamp(1.2rem, 1.7vw, 1.65rem), 1.25): one plain sentence at the top of each tab, max 64rem, balanced wrap. Inline figures are mono.
- **Pass value** (800, 1.45rem): the big value in each pass cell.
- **Brand** (800, 1.1rem, 0.02em): the uppercase product name in the top bar.
- **Heading** (700, 1.05rem): section and chart headings.
- **Body** (400, 1rem): default text and tab labels (600).
- **Note** (400, 0.88rem, max 60ch, Soft Ink): the sentence that explains a table or chart.
- **Label** (600, 0.72rem, 0.1em, uppercase): the cell caption inside a pass cell and the table column header (0.08em). Used only as a caption bound to a value or column. Table header sub-lines are 400, no case.
- **Board figure** (mono, 0.98rem, tabular): table cells. Heatmap cells use mono at 0.68rem.

### Named Rules
**The Figures Only Rule.** Mono is for numbers and nothing else. Words stay in Archivo.

**The Sentence First Rule.** Each tab opens with a full-sentence verdict. No title-case page title, no small caps line above it.

## Layout

One route, one full-height column. The top bar, the filter row, then the body. The body is a vertical stack with a 1rem gap and a page gutter of clamp(1rem, 3vw, 3rem). The first viewport at 1440 by 900 holds verdict, pass strip, board and the four lead charts.

The pass strip is an auto-fit grid, cells at least 9rem wide, equal share. The four lead charts sit in a four-column grid with a 1.6rem gap, two columns under 1100px and one under 640px. Rain tab charts use auto-fit at 18rem. Readings use auto-fit at 16rem with a 1.4rem by 2rem gap.

Tables scroll sideways inside their own wrapper. Secondary tables cap at 46rem or 56rem. On narrow screens the tab row scrolls sideways and heatmap type drops to 0.55rem. Horizontal overflow on the screen is clipped.

Spacing is rem-based and tight: 0.32 to 0.7rem inside tables and controls, 1rem between blocks, 1.6rem between charts.

## Elevation & Depth

Flat. There are no shadows and no gradients. Depth is carried by weight and rules: a 3px ink rule under the top bar, a 2px ink frame on the pass strip, 2px ink under table headers, 1px rule between rows, dashed tear lines between pass cells.

Two decorative-looking treatments are structural. The active tab underline is an inset box-shadow (0 -4px 0 in teal), used as a line, not as a shadow. The selected rain row has a 2px ink inset line. The barcode block is a repeating ink and paper stripe, the only texture.

### Named Rules
**The Flat Rule.** No blur shadow, no glow, no gradient fill. A repeating stripe is allowed for the barcode and for no-data heatmap cells, and for nothing else.

## Shapes

Small, nearly square corners. The pass strip is the roundest at 10px. Panels such as the empty note are 8px, controls 6px, the demo tag 4px, heat cells 2px. Tables have no radius. Borders are 1px Rule on controls, 2px Gate Ink on the pass strip, 3px Gate Ink under the top bar. The empty state uses a 1px dashed Soft Ink border.

Bars inside the first board column are flat rectangles 0.55rem tall, sized to the value, ink by default and orange in a held row.

## Components

### Top bar
Brand left, five text tabs right of it, 3px ink rule below, min height 3.6rem. Tabs are Soft Ink at weight 600. The current tab turns Gate Ink and gains a 4px teal underline drawn as an inset box-shadow. On narrow screens the nav scrolls sideways.

### Filter row
- **Chips:** 1px Rule border, 6px radius, paper fill, 0.9rem text. The current chip fills with Gate Ink and paper text.
- **Date and select fields:** same border, radius and size as chips, with a Soft Ink label beside them.
- **Demo tag:** paper fill, 2px Gate Ink outline, Gate Ink text, 800, 0.8rem, 0.06em, uppercase, pushed to the right. Shows only on synthetic data.

### Pass strip
A framed row of labelled cells. Each cell has a caption (Label style), a value (Pass value style) and an optional note. Cells are divided by 2px dashed Rule lines. A stale or failed cell uses Hold Wash and Hold Ink. The strip may end with a barcode block, 5rem minimum, aria-hidden.

### Board table
The signature component. Full-width table in mono tabular figures. Header row in Archivo Label style with a 2px ink underline and an optional small unit line. Rows have a 1px Rule divider. Numeric columns are right aligned. A status column reads ON TIME or "N h MISSING". A missing count lights that cell. A held row lights the whole row.

### Lead chart
A small line chart of error by hours ahead. A single ink line at 2.5px, three horizontal Rule grid lines, three y ticks, up to five x ticks labelled "N h", the 0 h x label left blank so it does not collide with the y zero, linear curve, no animation, no highlight dot. The tooltip shows the series name and value, or "no data".

### Series chart
Actual in ink at 3px, forecast in Forecast Blue at 2px. A null value breaks the line, so a missing hour is a visible gap. A legend line above lists both swatches and the matched-hour count.

### Heatmap
24 hour columns by lead buckets. Cell fill mixes Gate Ink into paper from 8% to 90% by error size, and cell text flips to paper above 55%. No-data cells are a diagonal wash and paper stripe.

### Empty state and notes
An empty state is a dashed-border box in Soft Ink that says what is missing and what to do. Notes are plain sentences in Soft Ink under the thing they explain.

## Do's and Don'ts

### Do:
- **Do** write the verdict as one plain sentence with the headline figure in mono.
- **Do** show n and missing count beside every error figure.
- **Do** leave missing data as a gap, a stripe or the word "no data".
- **Do** use Gate Ink for the actual line and Forecast Blue for the forecast line.
- **Do** keep the 3px teal focus ring (2px offset) on every focusable element.
- **Do** keep figures in tabular mono and right align numeric columns.
- **Do** honor reduced motion. Animations and transitions are off under `prefers-reduced-motion`.

### Don't:
- **Don't** use orange for anything good, neutral or decorative. It marks gaps, holds and warnings only.
- **Don't** add shadows, gradients or glow.
- **Don't** build KPI tiles, rounded cards on grey, or weather-app cards with icons.
- **Don't** fill, interpolate or zero a missing hour.
- **Don't** put mono type on words.
- **Don't** add a dark theme. The page is a white report page.
- **Don't** put small uppercase label lines above headings or verdicts. Uppercase tracked labels belong inside pass cells and table headers only.
