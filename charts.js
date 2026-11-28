// Charts for the committee (2026-11-28, contract docs/charts-api.md): one read-only endpoint with the series behind the
// Reports page charts. Weeks start on Monday; every bucket is returned even when empty, so the charts have no gaps.

module.exports = function mountCharts(app, c) {
  const { q, auth, admin } = c;
  const clock = c.clock || (() => new Date());
  const SLA_HOURS = c.slaHours || 48;
  const ymd = d => d.toISOString().slice(0, 10);
  const addDays = (s, n) => ymd(new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5));
  const monday = s => { const d = new Date(s + 'T00:00:00Z'); return addDays(s, -((d.getUTCDay() + 6) % 7)); };

  app.get('/api/admin/charts', auth, admin, (req, res) => {
    const today = ymd(clock());
    const weeks = Math.min(26, Math.max(4, Number(req.query.weeks) || 12));
    const w0 = addDays(monday(today), -7 * (weeks - 1));
    const weekKeys = Array.from({ length: weeks }, (_, i) => addDays(w0, 7 * i));
    const wk = s => monday(String(s).slice(0, 10));
    const count = (rows, key) => { const m = {}; for (const r of rows) { const k = key(r); m[k] = (m[k] || 0) + 1; } return m; };

    // Requests raised and resolved per week, and the share resolved within the SLA (hours from raised to resolved).
    const raised = count(q('SELECT created_at FROM requests WHERE date(created_at) >= ?', w0), r => wk(r.created_at));
    const closedRows = q("SELECT created_at, closed_at, (julianday(closed_at)-julianday(created_at))*24 AS hrs FROM requests WHERE closed_at IS NOT NULL AND date(closed_at) >= ?", w0);
    const resolved = count(closedRows, r => wk(r.closed_at));
    const onTime = count(closedRows.filter(r => r.hrs <= SLA_HOURS), r => wk(r.closed_at));
    const requestsWeekly = weekKeys.map(w => ({ week: w, raised: raised[w] || 0, resolved: resolved[w] || 0 }));
    const slaWeekly = weekKeys.map(w => ({ week: w, resolved: resolved[w] || 0, on_time: onTime[w] || 0, pct: resolved[w] ? Math.round(100 * (onTime[w] || 0) / resolved[w]) : null }));

    // Open requests by category (biggest first).
    const byCategory = q("SELECT category, COUNT(*) AS n FROM requests WHERE status != 'closed' GROUP BY category ORDER BY n DESC, category");

    // Maintenance dues per month of the due date (last 6 months): billed, collected (payments on those dues), still owed.
    const m0 = (() => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 5); return ymd(d).slice(0, 7); })();
    const monthKeys = Array.from({ length: 6 }, (_, i) => { const d = new Date(m0 + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + i); return ymd(d).slice(0, 7); });
    const dues = q(`SELECT substr(d.due_date,1,7) AS month, SUM(d.amount) AS billed,
      SUM(MIN(d.amount, (SELECT COALESCE(SUM(p.amount),0) FROM due_payments p WHERE p.due_id=d.id))) AS collected
      FROM dues d WHERE substr(d.due_date,1,7) >= ? GROUP BY month`, m0);
    const dm = Object.fromEntries(dues.map(r => [r.month, r]));
    const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
    const duesMonthly = monthKeys.map(m => { const r = dm[m] || {}; const billed = r2(r.billed), collected = r2(r.collected); return { month: m, billed, collected, outstanding: r2(billed - collected) }; });

    // Gate check-ins per day (card taps "in"), last 14 days.
    const d0 = addDays(today, -13);
    const taps = count(q("SELECT at FROM gate_presence WHERE direction='in' AND date(at) >= ?", d0), r => String(r.at).slice(0, 10));
    const gateDaily = Array.from({ length: 14 }, (_, i) => { const d = addDays(d0, i); return { day: d, check_ins: taps[d] || 0 }; });

    res.json({ generated_at: clock().toISOString(), sla_hours: SLA_HOURS, requests_weekly: requestsWeekly, sla_weekly: slaWeekly, open_by_category: byCategory, dues_monthly: duesMonthly, gate_daily: gateDaily });
  });
};
