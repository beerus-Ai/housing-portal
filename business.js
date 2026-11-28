// Neighbourhood business directory (2026-11-28, contract docs/business-api.md). A resident lists a small business,
// their own or a nearby one they trust. A listing goes live only when a committee member approves it; the committee can
// also reject it (with a reason) or take a live listing down. Owners edit or withdraw their own; an edit to a live or
// rejected listing goes back for review. Residents browse live listings by category and search, and leave one 1-5 star
// rating with an optional short review per listing (editable). Phones are shown on live listings because businesses
// publish them. Every change is audited.

const CATEGORIES = ['food', 'tutoring', 'tailoring', 'beauty', 'repairs', 'home services', 'health', 'other'];
const PHONE = /^\+?[\d\s-]{6,20}$/;
const URL_OK = /^https?:\/\/[^\s<>"']+\.[^\s<>"']+$/i;

module.exports = function mountBusiness(app, c) {
  const { q, one, run, log, notify, auth, admin, str, committeeIds } = c;
  const bad = (res, error) => res.status(400).json({ error });
  const resident = (req, res, next) => (req.user.role === 'resident' && req.user.flat ? next() : res.status(403).json({ error: 'Residents with a flat only' }));
  const residentOrCommittee = (req, res, next) => (['resident', 'admin'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed for this account' }));
  const notifyCommittee = msg => { for (const id of committeeIds()) notify(id, msg); };

  // Validates a submission or an edit; returns [error] or [null, fields].
  const parse = b => {
    const name = str(b.name, 80), category = str(b.category, 30).toLowerCase(), description = str(b.description, 500);
    const phone = str(b.phone, 20), hours = str(b.hours, 80), website = str(b.website, 200);
    if (!name) return ['Give the business a name'];
    if (!CATEGORIES.includes(category)) return ['Choose a category from the list'];
    if (!description) return ['Describe what the business offers'];
    if (!PHONE.test(phone) || phone.replace(/\D/g, '').length < 6) return ['Give a phone number for the business'];
    if (!hours) return ['Give the opening hours'];
    if (website && !URL_OK.test(website)) return ['The website must start with http:// or https://'];
    return [null, { name, category, description, phone, hours, website: website || null, run_by_resident: b.run_by_resident ? 1 : 0 }];
  };

  const rating = id => {
    const r = one('SELECT COUNT(*) AS n, AVG(stars) AS avg FROM business_reviews WHERE listing_id=?', id);
    return { count: r.n, average: r.n ? Math.round(r.avg * 10) / 10 : null };
  };

  // Live listings for everyone; your own in any state; the committee also sees pending (and, with ?status=all, every state).
  app.get('/api/business', auth, residentOrCommittee, (req, res) => {
    const me = req.user, isAdmin = me.role === 'admin';
    const cat = str(req.query.category, 30).toLowerCase(), term = str(req.query.q, 60);
    const where = ['1=1'], args = [];
    if (isAdmin) { if (req.query.status !== 'all') where.push("b.status IN ('approved','pending')"); }
    else { where.push("(b.status='approved' OR (b.owner_id=? AND b.status<>'withdrawn'))"); args.push(me.id); }
    if (cat) { where.push('b.category=?'); args.push(cat); }
    if (term) {
      const like = '%' + term.replace(/[\\%_]/g, m => '\\' + m) + '%';
      where.push("(b.name LIKE ? ESCAPE '\\' OR b.description LIKE ? ESCAPE '\\' OR b.category LIKE ? ESCAPE '\\')"); args.push(like, like, like);
    }
    const rows = q(`SELECT b.*, u.name AS owner_name, u.flat AS owner_flat FROM business_listings b JOIN users u ON u.id=b.owner_id
      WHERE ${where.join(' AND ')} ORDER BY CASE b.status WHEN 'pending' THEN 0 ELSE 1 END, b.name COLLATE NOCASE, b.id LIMIT 300`, ...args);
    res.json(rows.map(b => {
      const mine = b.owner_id === me.id;
      const reviews = q(`SELECT r.user_id, r.stars, r.review, r.updated_at, u.name, u.flat FROM business_reviews r JOIN users u ON u.id=r.user_id
        WHERE r.listing_id=? ORDER BY r.updated_at DESC, r.user_id LIMIT 50`, b.id);
      const myReview = reviews.find(r => r.user_id === me.id);
      return {
        id: b.id, name: b.name, category: b.category, description: b.description, hours: b.hours, website: b.website,
        // Businesses publish their phone; it is shown on live listings (and to the owner and the committee for review).
        phone: b.status === 'approved' || mine || isAdmin ? b.phone : null,
        run_by_resident: !!b.run_by_resident, status: b.status, reason: mine || isAdmin ? b.reason : null, mine,
        listed_by: { name: b.owner_name, flat: b.owner_flat }, created_at: b.created_at, updated_at: b.updated_at,
        rating: rating(b.id), my_review: myReview ? { stars: myReview.stars, review: myReview.review } : null,
        reviews: reviews.map(r => ({ name: r.name, flat: r.flat, stars: r.stars, review: r.review, updated_at: r.updated_at })),
      };
    }));
  });

  app.get('/api/business/categories', auth, residentOrCommittee, (req, res) => res.json(CATEGORIES));

  app.post('/api/business', auth, resident, (req, res) => {
    const [err, f] = parse(req.body || {});
    if (err) return bad(res, err);
    if (one("SELECT id FROM business_listings WHERE owner_id=? AND name=? COLLATE NOCASE AND status IN ('pending','approved')", req.user.id, f.name)) return res.status(409).json({ error: 'You already listed a business with that name' });
    const r = run('INSERT INTO business_listings(owner_id,name,category,description,phone,hours,website,run_by_resident) VALUES(?,?,?,?,?,?,?,?)',
      req.user.id, f.name, f.category, f.description, f.phone, f.hours, f.website, f.run_by_resident);
    log(req.user.id, 'business', r.lastInsertRowid, 'submitted', `${f.name} (${f.category})`);
    notifyCommittee(`New business listing to review: ${f.name} (${f.category}), from Flat ${req.user.flat}`);
    res.status(201).json({ id: Number(r.lastInsertRowid), status: 'pending' });
  });

  // The owner edits their listing. A live or rejected listing goes back to the committee for review.
  app.put('/api/business/:id', auth, resident, (req, res) => {
    const b = one('SELECT * FROM business_listings WHERE id=?', req.params.id);
    if (!b || b.owner_id !== req.user.id || b.status === 'withdrawn') return res.status(404).json({ error: 'Listing not found' });
    if (b.status === 'removed') return res.status(409).json({ error: 'The committee took this listing down' });
    const [err, f] = parse(req.body || {});
    if (err) return bad(res, err);
    run("UPDATE business_listings SET name=?, category=?, description=?, phone=?, hours=?, website=?, run_by_resident=?, status='pending', reason=NULL, updated_at=datetime('now') WHERE id=?",
      f.name, f.category, f.description, f.phone, f.hours, f.website, f.run_by_resident, b.id);
    log(req.user.id, 'business', b.id, 'edited', `${f.name}: back for review`);
    notifyCommittee(`Business listing edited, to review again: ${f.name} (${f.category})`);
    res.json({ ok: true, status: 'pending' });
  });

  // The owner withdraws their listing.
  app.delete('/api/business/:id', auth, resident, (req, res) => {
    const b = one('SELECT * FROM business_listings WHERE id=?', req.params.id);
    if (!b || b.owner_id !== req.user.id || b.status === 'withdrawn') return res.status(404).json({ error: 'Listing not found' });
    run("UPDATE business_listings SET status='withdrawn', updated_at=datetime('now') WHERE id=?", b.id);
    log(req.user.id, 'business', b.id, 'withdrawn', b.name);
    res.json({ ok: true });
  });

  // Committee moderation: approve or reject (with a reason) a pending listing.
  app.post('/api/business/:id/decide', auth, admin, (req, res) => {
    const b = one('SELECT * FROM business_listings WHERE id=?', req.params.id);
    if (!b || b.status === 'withdrawn') return res.status(404).json({ error: 'Listing not found' });
    const d = (req.body || {}).decision, reason = str((req.body || {}).reason, 300);
    if (!['approve', 'reject'].includes(d)) return bad(res, 'Decision must be approve or reject');
    if (d === 'reject' && !reason) return bad(res, 'Give a reason for rejecting the listing');
    if (b.status !== 'pending') return res.status(409).json({ error: 'This listing is not waiting for review' });
    const status = d === 'approve' ? 'approved' : 'rejected';
    run("UPDATE business_listings SET status=?, reason=?, decided_by=?, decided_at=datetime('now') WHERE id=?", status, d === 'reject' ? reason : null, req.user.id, b.id);
    log(req.user.id, 'business', b.id, status, d === 'reject' ? `${b.name}: ${reason}` : b.name);
    notify(b.owner_id, d === 'approve' ? `Your business listing "${b.name}" is live in the directory` : `Your business listing "${b.name}" was not approved: ${reason}`);
    res.json({ ok: true, status });
  });

  // Committee takes a live listing down (with a reason); the owner is told.
  app.post('/api/business/:id/remove', auth, admin, (req, res) => {
    const b = one('SELECT * FROM business_listings WHERE id=?', req.params.id);
    if (!b || b.status === 'withdrawn') return res.status(404).json({ error: 'Listing not found' });
    const reason = str((req.body || {}).reason, 300);
    if (!reason) return bad(res, 'Give a reason for taking the listing down');
    if (b.status !== 'approved') return res.status(409).json({ error: 'Only a live listing can be taken down' });
    run("UPDATE business_listings SET status='removed', reason=?, decided_by=?, decided_at=datetime('now') WHERE id=?", reason, req.user.id, b.id);
    log(req.user.id, 'business', b.id, 'removed', `${b.name}: ${reason}`);
    notify(b.owner_id, `The committee took down your business listing "${b.name}": ${reason}`);
    res.json({ ok: true });
  });

  // One rating (1-5 stars, optional short review) per resident per live listing; sending again edits it.
  app.put('/api/business/:id/review', auth, resident, (req, res) => {
    const b = one('SELECT * FROM business_listings WHERE id=?', req.params.id);
    if (!b || b.status !== 'approved') return res.status(404).json({ error: 'Listing not found' });
    if (b.owner_id === req.user.id) return res.status(409).json({ error: 'You cannot rate your own listing' });
    const stars = Number((req.body || {}).stars), review = str((req.body || {}).review, 300) || null;
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return bad(res, 'Rate from 1 to 5 stars');
    const prev = one('SELECT stars FROM business_reviews WHERE listing_id=? AND user_id=?', b.id, req.user.id);
    if (prev) run("UPDATE business_reviews SET stars=?, review=?, updated_at=datetime('now') WHERE listing_id=? AND user_id=?", stars, review, b.id, req.user.id);
    else run('INSERT INTO business_reviews(listing_id,user_id,stars,review) VALUES(?,?,?,?)', b.id, req.user.id, stars, review);
    log(req.user.id, 'business_review', b.id, prev ? 'review_edited' : 'reviewed', `${b.name}: ${stars} stars`);
    res.json({ ok: true, rating: rating(b.id) });
  });
};
module.exports.CATEGORIES = CATEGORIES;
