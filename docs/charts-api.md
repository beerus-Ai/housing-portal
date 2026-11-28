# Charts API

Contract for 2026-11-28, implemented in `charts.js` and drawn by `public/charts.js` on the committee **Reports** page (section **Trends**).

`GET /api/admin/charts?weeks=12` (committee only; `weeks` 4 to 26, default 12). Every bucket is returned even when empty, so charts have no gaps. Weeks start on Monday.

| Field | Shape | Chart |
|---|---|---|
| `requests_weekly` | `[{week, raised, resolved}]` | Line: requests raised and resolved per week |
| `sla_weekly` | `[{week, resolved, on_time, pct}]` (`pct` null when nothing was resolved) | Line: share resolved within `sla_hours` (env `SLA_HOURS`, default 48) |
| `open_by_category` | `[{category, n}]`, biggest first | Horizontal bars: open requests by category |
| `dues_monthly` | `[{month, billed, collected, outstanding}]`, the last 6 months by due date | Stacked bars: collected and still owed |
| `gate_daily` | `[{day, check_ins}]`, the last 14 days of card taps in | Bars: gate check-ins per day |

**How the charts are drawn (`HP.chart(el, spec)`)**
- Plain SVG with no library, so the CSP stays `'self'`, drawn at the card's real width.
- 2px lines with point markers.
- Bars with 4px rounded ends and a 2px gap between stacked parts.
- Recessive grid.
- A legend and direct line labels when there are two series.
- A hover tooltip, with a crosshair on line charts.
- A **Show as table** view.
- A message instead of an empty axis when there is no data.

**Colours:** the portal accent `#0088b0` and orange `#f47230`. The pair passes the colour-blind separation checks of the dataviz validator. The orange sits below 3:1 contrast on white, which is why legends, labels and the table view are always present.

Tests: `test/charts.test.js`, plus an access-matrix row.
