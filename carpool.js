// Carpool (2026-11-28, contract docs/carpool-api.md). A resident offers a ride (where to, when, seats, optional cost
// share per seat, settled between neighbours: no payment in the portal); other residents ask for a seat and the driver
// accepts or declines. Phone numbers are shared only between a driver and riders they accepted. The committee sees
// every ride and can take one down. Times are India time (YYYY-MM-DDTHH:MM). Every change is audited.

const DT = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
const money = v => Math.round(Number(v) * 100) / 100;

module.exports = function mountCarpool(app, c) {
  const { q, one, run, log, notify, auth, str, istNow } = c;
  const clock = c.clock || (() => new Date());
  const nowLocal = () => { const n = istNow(clock()); return `${n.date}T${n.time}`; };
  const bad = (res, error) => res.status(400).json({ error });
  const resident = (req, res, next) => (req.user.role === 'resident' && req.user.flat ? next() : res.status(403).json({ error: 'Residents with a flat only' }));
  const residentOrCommittee = (req, res, next) => (['resident', 'admin'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed for this account' }));
  const seatsTaken = rideId => one("SELECT COALESCE(SUM(seats),0) AS n FROM carpool_requests WHERE ride_id=? AND status='accepted'", rideId).n;
  const when = dt => String(dt).replace('T', ' at ');
  const route = r => `${r.from_place} → ${r.to_place}`;

  // Upcoming rides (and the caller's own rides and seats from the last day, so a ride does not vanish mid-trip).
  app.get('/api/carpool', auth, residentOrCommittee, (req, res) => {
    const me = req.user, isAdmin = me.role === 'admin';
    const since = (() => { const n = istNow(new Date(clock().getTime() - 864e5)); return `${n.date}T${n.time}`; })();
    const rides = q(`SELECT r.*, u.name AS driver_name, u.flat AS driver_flat, u.phone AS driver_phone FROM carpool_rides r JOIN users u ON u.id=r.driver_id
      WHERE r.depart_at >= ? AND (r.status='open' OR r.driver_id=? OR ?) ORDER BY r.depart_at, r.id LIMIT 200`, since, me.id, isAdmin ? 1 : 0);
    const out = rides.map(r => {
      const mine = r.driver_id === me.id;
      const reqs = q(`SELECT x.id, x.rider_id, x.seats, x.status, x.created_at, u.name, u.flat, u.phone FROM carpool_requests x JOIN users u ON u.id=x.rider_id
        WHERE x.ride_id=? ORDER BY x.id`, r.id);
      const myReq = reqs.find(x => x.rider_id === me.id) || null;
      const taken = reqs.filter(x => x.status === 'accepted').reduce((t, x) => t + x.seats, 0);
      return {
        id: r.id, from_place: r.from_place, to_place: r.to_place, depart_at: r.depart_at, seats: r.seats, seats_left: Math.max(0, r.seats - taken),
        cost_per_seat: r.cost_per_seat, note: r.note, status: r.status, past: r.depart_at < nowLocal(), mine,
        driver: { id: r.driver_id, name: r.driver_name, flat: r.driver_flat, phone: mine || (myReq && myReq.status === 'accepted') ? r.driver_phone || null : null },
        my_request: myReq && { id: myReq.id, seats: myReq.seats, status: myReq.status },
        // The driver (and the committee) see who asked; riders' phones only for accepted riders, and only to the driver.
        requests: mine || isAdmin ? reqs.map(x => ({ id: x.id, name: x.name, flat: x.flat, seats: x.seats, status: x.status, created_at: x.created_at, phone: mine && x.status === 'accepted' ? x.phone || null : null })) : undefined,
      };
    });
    res.json(out);
  });

  app.post('/api/carpool', auth, resident, (req, res) => {
    const b = req.body || {}, to = str(b.to_place, 80), from = str(b.from_place, 80) || 'Sahyadri Heights';
    if (!to) return bad(res, 'Where are you going?');
    if (!DT.test(b.depart_at || '') || b.depart_at <= nowLocal()) return bad(res, 'Choose a departure date and time in the future');
    const seats = Number(b.seats);
    if (!Number.isInteger(seats) || seats < 1 || seats > 6) return bad(res, 'Offer 1 to 6 seats');
    const cost = b.cost_per_seat === undefined || b.cost_per_seat === null || b.cost_per_seat === '' ? null : money(b.cost_per_seat);
    if (cost !== null && (!(cost >= 0) || cost > 5000)) return bad(res, 'Cost per seat must be between ₹0 and ₹5,000');
    if (one("SELECT id FROM carpool_rides WHERE driver_id=? AND depart_at=? AND status='open'", req.user.id, b.depart_at)) return res.status(409).json({ error: 'You already offer a ride at that time' });
    const r = run('INSERT INTO carpool_rides(driver_id,from_place,to_place,depart_at,seats,cost_per_seat,note) VALUES(?,?,?,?,?,?,?)', req.user.id, from, to, b.depart_at, seats, cost, str(b.note, 300) || null);
    log(req.user.id, 'carpool_ride', r.lastInsertRowid, 'offered', `${from} -> ${to} on ${b.depart_at}, ${seats} seats`);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  // Driver cancels their ride; the committee can take any ride down. Riders with a pending or accepted seat are told.
  app.post('/api/carpool/:id/cancel', auth, residentOrCommittee, (req, res) => {
    const r = one('SELECT * FROM carpool_rides WHERE id=?', req.params.id);
    if (!r || (r.driver_id !== req.user.id && req.user.role !== 'admin')) return res.status(404).json({ error: 'Ride not found' });
    if (r.status === 'cancelled') return res.status(409).json({ error: 'This ride is already cancelled' });
    run("UPDATE carpool_rides SET status='cancelled' WHERE id=?", r.id);
    const riders = q("SELECT rider_id FROM carpool_requests WHERE ride_id=? AND status IN ('pending','accepted')", r.id);
    run("UPDATE carpool_requests SET status='cancelled', decided_at=datetime('now') WHERE ride_id=? AND status IN ('pending','accepted')", r.id);
    const byCommittee = r.driver_id !== req.user.id;
    log(req.user.id, 'carpool_ride', r.id, byCommittee ? 'removed' : 'cancelled', route(r) + (byCommittee ? ' (by the committee)' : ''));
    for (const x of riders) notify(x.rider_id, `Carpool to ${r.to_place} on ${when(r.depart_at)} was cancelled${byCommittee ? ' by the committee' : ' by the driver'}`);
    if (byCommittee) notify(r.driver_id, `The committee took down your carpool to ${r.to_place} on ${when(r.depart_at)}`);
    res.json({ ok: true });
  });

  app.post('/api/carpool/:id/request', auth, resident, (req, res) => {
    const r = one('SELECT * FROM carpool_rides WHERE id=?', req.params.id);
    if (!r || r.status !== 'open') return res.status(404).json({ error: 'Ride not found' });
    if (r.driver_id === req.user.id) return res.status(409).json({ error: 'This is your own ride' });
    if (r.depart_at <= nowLocal()) return res.status(409).json({ error: 'This ride has already left' });
    const seats = (req.body || {}).seats === undefined ? 1 : Number(req.body.seats);
    if (!Number.isInteger(seats) || seats < 1 || seats > 6) return bad(res, 'Ask for 1 to 6 seats');
    const left = r.seats - seatsTaken(r.id);
    if (seats > left) return res.status(409).json({ error: left ? `Only ${left} seat${left === 1 ? '' : 's'} left` : 'This ride is full' });
    const prev = one('SELECT * FROM carpool_requests WHERE ride_id=? AND rider_id=?', r.id, req.user.id);
    if (prev && ['pending', 'accepted'].includes(prev.status)) return res.status(409).json({ error: 'You already asked for a seat on this ride' });
    if (prev && prev.status === 'declined') return res.status(409).json({ error: 'The driver declined your request for this ride' });
    let id;
    if (prev) { run("UPDATE carpool_requests SET seats=?, status='pending', created_at=datetime('now'), decided_at=NULL WHERE id=?", seats, prev.id); id = prev.id; }
    else id = Number(run('INSERT INTO carpool_requests(ride_id,rider_id,seats) VALUES(?,?,?)', r.id, req.user.id, seats).lastInsertRowid);
    log(req.user.id, 'carpool_request', id, 'requested', `${seats} seat(s) on ride ${r.id}`);
    notify(r.driver_id, `${req.user.name} (Flat ${req.user.flat}) asks for ${seats} seat${seats === 1 ? '' : 's'} to ${r.to_place} on ${when(r.depart_at)}`);
    res.status(201).json({ id, status: 'pending' });
  });

  // The driver accepts or declines a pending request.
  app.post('/api/carpool/requests/:id/decide', auth, resident, (req, res) => {
    const x = one('SELECT x.*, r.driver_id, r.seats AS ride_seats, r.status AS ride_status, r.to_place, r.depart_at FROM carpool_requests x JOIN carpool_rides r ON r.id=x.ride_id WHERE x.id=?', req.params.id);
    if (!x || x.driver_id !== req.user.id) return res.status(404).json({ error: 'Request not found' });
    const d = (req.body || {}).decision;
    if (!['accept', 'decline'].includes(d)) return bad(res, 'Decision must be accept or decline');
    if (x.status !== 'pending' || x.ride_status !== 'open') return res.status(409).json({ error: 'This request is no longer waiting for you' });
    if (d === 'accept') {
      const left = x.ride_seats - seatsTaken(x.ride_id);
      if (x.seats > left) return res.status(409).json({ error: left ? `Only ${left} seat${left === 1 ? '' : 's'} left` : 'This ride is full' });
    }
    const status = d === 'accept' ? 'accepted' : 'declined';
    run("UPDATE carpool_requests SET status=?, decided_at=datetime('now') WHERE id=?", status, x.id);
    log(req.user.id, 'carpool_request', x.id, status, `ride ${x.ride_id}`);
    notify(x.rider_id, d === 'accept'
      ? `Your seat to ${x.to_place} on ${when(x.depart_at)} is confirmed. The driver's phone is on the Carpool page.`
      : `The driver could not take you to ${x.to_place} on ${when(x.depart_at)}`);
    res.json({ ok: true, status });
  });

  // The rider withdraws (pending or accepted); the driver is told.
  app.post('/api/carpool/requests/:id/cancel', auth, resident, (req, res) => {
    const x = one('SELECT x.*, r.driver_id, r.to_place, r.depart_at FROM carpool_requests x JOIN carpool_rides r ON r.id=x.ride_id WHERE x.id=?', req.params.id);
    if (!x || x.rider_id !== req.user.id) return res.status(404).json({ error: 'Request not found' });
    if (!['pending', 'accepted'].includes(x.status)) return res.status(409).json({ error: 'Nothing to cancel' });
    run("UPDATE carpool_requests SET status='cancelled', decided_at=datetime('now') WHERE id=?", x.id);
    log(req.user.id, 'carpool_request', x.id, 'cancelled', `ride ${x.ride_id}`);
    notify(x.driver_id, `${req.user.name} (Flat ${req.user.flat}) no longer needs a seat to ${x.to_place} on ${when(x.depart_at)}`);
    res.json({ ok: true });
  });
};
