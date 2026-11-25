"""Reads docs/requirements.md, docs/user-stories.md and docs/testing/test-cases.md
and writes data.json: the single source for the Word, PDF, PowerPoint and Excel files.
Personas' narrative (name, quote) lives here because the Markdown keeps only the table."""
import json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"


def rows(lines):
    """Yield cell lists for a Markdown table (skips header and divider)."""
    out = []
    for ln in lines:
        if not ln.startswith("|"):
            break
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if set("".join(cells)) <= set("-: "):
            continue
        out.append(cells)
    return out[1:]


def clean(s):
    return re.sub(r"\*([^*]+)\*", r"\1", s).replace("**", "")


req = (DOCS / "requirements.md").read_text(encoding="utf-8").splitlines()

frs, nfrs, area, sub = [], [], None, None
for i, ln in enumerate(req):
    if ln.startswith("### 3."):
        area, sub = re.sub(r"^### 3\.\d+ ", "", ln).strip(), None
    elif re.match(r"^\*\*3\.\d .+\*\*$", ln):
        sub = ln.strip("*")
    elif ln.startswith("| ID |") and area and "Priority" in ln:
        for c in rows(req[i:]):
            text = clean(c[1])
            low = c[1].lower()
            status = ("Partly built" if "online payment not built" in low
                      else "Not built" if ("not built" in low or "not connected" in low) else "Built")
            frs.append({"id": c[0], "area": area, "sub": sub, "text": text, "role": c[2], "priority": c[3],
                        "status": status})
    elif ln.startswith("| ID | Area |"):
        for c in rows(req[i:]):
            nfrs.append({"id": c[0], "area": c[1], "text": clean(re.sub(r"\(\[([^\]]+)\]\([^)]+\)\)", r"(\1)", c[2]))})
    if ln.startswith("## 4."):
        area = None

# FR -> user stories
stories = {}
us_md = (DOCS / "user-stories.md").read_text(encoding="utf-8")
story_list = []
role_name = None
for ln in us_md.splitlines():
    m = re.match(r"^### 3\.\d (.+)", ln)
    if m:
        role_name = m.group(1)
    m = re.match(r"^\| (US-[A-Z]+-\d+) \| (.+?) \| (.+?) \| (.+?) \|$", ln)
    if m:
        sid, want, why, src = m.groups()
        story_list.append({"id": sid, "role": role_name, "want": want, "why": why, "source": src})
        for fr in re.findall(r"(?:FR-[A-Z]{2}-\d+|NFR-\d+)", src):
            stories.setdefault(fr, []).append(sid)

# FR -> test cases ("FR-AU-01/03" means FR-AU-01 and FR-AU-03)
tests = {}
for ln in (DOCS / "testing" / "test-cases.md").read_text(encoding="utf-8").splitlines():
    m = re.match(r"^\| (TC-[A-Z]+-\d+) \| ([^|]+)\|", ln)
    if not m:
        continue
    tc, area_txt = m.group(1), m.group(2)
    # "FR-AU-01/03", "FR-SM-01, 02" and "FR-SM-03..05" all name several requirements.
    for prefix, first, rest in re.findall(r"(FR-[A-Z]{2}-|NFR-)(\d+)((?:(?:/|, ?|\.\.)\d+)*)", area_txt):
        nums, prev = [first], int(first)
        for sep, n in re.findall(r"(/|, ?|\.\.)(\d+)", rest):
            if sep == "..":
                nums += [f"{i:02d}" for i in range(prev + 1, int(n) + 1)]
            else:
                nums.append(n)
            prev = int(n)
        for n in nums:
            tests.setdefault(prefix + n, []).append(tc)


# Short labels for slides and charts (the full wording stays in requirements.md).
SHORT = {
 "FR-ON-01": "Register with flat, phone and consent", "FR-ON-02": "Committee approves or rejects",
 "FR-ON-03": "Committee told of each registration", "FR-ON-04": "Owner adds family and tenants",
 "FR-ON-05": "Tenant lease on record", "FR-AU-01": "Secure email sign-in",
 "FR-AU-02": "Role check on every action", "FR-AU-03": "Lock out repeated failed sign-ins",
 "FR-AU-07": "Password reset signs out everywhere", "FR-AU-08": "Google sign-in (off by default)",
 "FR-WR-01": "Raise a request with a photo", "FR-WR-13": "Raise a request on Telegram",
 "FR-WR-07": "Raise a request on WhatsApp", "FR-WR-12": "Sort messages: request, unsure, chatter",
 "FR-WR-14": "Free LLM sorting with rules fallback", "FR-NO-06": "One-tap emergency; contacts",
 "FR-NO-07": "Emergency words raise an alert", "FR-WR-08": "AI suggests category and vendor",
 "FR-WR-09": "AI suggests, a person confirms", "FR-WR-15": "Approve AI suggestion in one click",
 "FR-RL-04": "Assign to a vendor or staff member", "FR-WR-06": "Vendor directory",
 "FR-RL-07": "Head approves costs over Rs 10,000", "FR-WR-02": "Forward-only stages",
 "FR-WR-03": "Stage history and comments", "FR-WR-04": "Residents see own flat; committee all",
 "FR-NO-01": "Notify on every change", "FR-NO-03": "Live screen updates",
 "FR-WR-10": "Escalate after 48 hours", "FR-WR-11": "Updates in the resident's chat",
 "FR-RL-05": "Take up a job, post progress", "FR-RL-06": "Punch in/out and hand-over",
 "FR-WR-05": "Rate closed work once", "FR-RL-08": "Reopen within 7 days",
 "FR-AD-01": "Open-requests dashboard", "FR-AD-02": "Estate overview",
 "FR-RL-09": "Monthly report", "FR-AD-04": "CSV export", "FR-NO-05": "Weekly AI digest",
 "FR-NO-02": "Notices to residents", "FR-NO-04": "AI-drafted notices",
 "FR-RL-10": "Notices on Telegram", "FR-AD-03": "Audit trail of every change",
 "FR-WR-16": "Act from email buttons", "FR-NO-08": "Email when nobody is online",
 "FR-RL-01": "Head or admin control settings", "FR-RL-02": "Accounts for every role",
 "FR-AU-04": "Edit resident permissions", "FR-AU-05": "Feature switches",
 "FR-RL-03": "Staff see only their jobs", "FR-AU-06": "Guards see only the gate",
 "FR-AD-05": "Gate passes and gate log", "FR-RL-11": "Support tickets",
 "FR-RL-12": "Help guides per role", "FR-RL-13": "Upgrades and maintenance", "FR-RL-14": "IT overview",
 "FR-SM-01": "Set up amenities", "FR-SM-02": "Book and cancel amenity slots",
 "FR-SM-03": "Raise monthly dues", "FR-SM-04": "Record payments",
 "FR-SM-05": "Residents see their dues", "FR-SM-06": "Inventory with reorder alerts",
 "FR-SM-07": "Waste pickup schedule", "FR-SM-08": "Log waste collected (kg)",
 "FR-SM-09": "Report a missed pickup", "FR-SM-10": "Calm dashboard with a For you list",
 "FR-SV-01": "Tuck shop ordering", "FR-SV-02": "Shop order flow", "FR-SV-03": "Book a laundry pickup", "FR-SV-04": "Laundry progress",
 "FR-SV-05": "Parcel desk at the gate", "FR-SV-06": "Community events",
 "FR-GT-01": "Register NFC gate cards", "FR-GT-02": "Card taps check in and out", "FR-RL-15": "Staff see only their department",
 "FR-SM-11": "A dashboard per role",
}
NFR_SHORT = {
 "NFR-01": "Hashed passwords, role checks, safe SQL, CSP", "NFR-02": "Consent, minimum data, synthetic test data",
 "NFR-03": "HTTPS and secure cookies", "NFR-04": "Health check and backups",
 "NFR-05": "Keyboard use, labelled inputs", "NFR-06": "Desktop, phone and app",
 "NFR-07": "Tests for every story, CI", "NFR-08": "SQLite now, PostgreSQL-ready",
 "NFR-09": "No personal data to AI; AI only suggests", "NFR-10": "Who, what and when for every change",
 "NFR-11": "Sign-in throttling, webhook secrets", "NFR-12": "No load target yet",
 "NFR-13": "Signed 7-day links, confirm first", "NFR-14": "Persistent database for production",
}

for f in frs:
    f["short"] = SHORT[f["id"]]
    f["stories"] = stories.get(f["id"], [])
    f["tests"] = tests.get(f["id"], [])
for n in nfrs:
    n["short"] = NFR_SHORT[n["id"]]
    n["tests"] = tests.get(n["id"], [])

personas = [
    {"role": "Resident", "name": "Meera Kulkarni", "who": "Flat owner, B-wing; also tenants and family",
     "quote": "I posted about the leak three times on WhatsApp. Nobody told me who was coming.",
     "goals": ["Report a problem once", "See who is on it and when", "Rate the work", "Book the clubhouse, see dues"],
     "pains": ["Complaints lost in group chats", "No status, unanswered calls"], "icon": "home"},
    {"role": "Committee Member", "name": "Rahul Deshpande", "who": "Elected volunteer, works full time",
     "quote": "I need one list of what is open, not forty messages.",
     "goals": ["Verify new residents", "Allocate work to staff or vendors", "Broadcast notices", "See what is pending"],
     "pains": ["No single list of open work", "Chasing vendors by phone"], "icon": "users"},
    {"role": "Head of Committee", "name": "Sunita Rao", "who": "Chair; answers to the general body",
     "quote": "Every big spend should have my name on it, and a record.",
     "goals": ["Approve costly work", "Set rules and access", "Report to the general body"],
     "pains": ["Spending decided informally", "No audit trail"], "icon": "award"},
    {"role": "Staff", "name": "Ganesh Patil", "who": "Society plumber; guards at the gate",
     "quote": "Tell me the flat and the problem before I climb four floors.",
     "goals": ["Take up assigned work", "Update progress with photos", "Punch in and out"],
     "pains": ["Jobs given verbally", "No record of work done"], "icon": "tool"},
    {"role": "Admin", "name": "Anil Joshi", "who": "Society office manager",
     "quote": "When someone moves out, their access should go with them.",
     "goals": ["Manage accounts for every role", "Control settings and features"],
     "pains": ["User lists on paper", "Access never revoked"], "icon": "settings"},
    {"role": "IT Staff", "name": "Kavya Iyer", "who": "Part-time support for the portal",
     "quote": "Problems should reach me as tickets, not phone calls at night.",
     "goals": ["Answer support queries", "Train users", "Keep the system healthy and upgraded"],
     "pains": ["No channel for issues", "No backups"], "icon": "cpu"},
]

scope = {
    "problem": "The society (several hundred flats) runs on WhatsApp groups, paper registers and phone calls. "
               "Residents cannot track complaints, the committee cannot see what is pending, and records are scattered.",
    "goal": "One portal to know who lives in the society, resolve their requests and communicate reliably, "
            "with less manual effort and clearer accountability.",
    "core": [("Resident onboarding", "Register owners, tenants and family; the committee approves"),
             ("Work requests", "Assign, track, close and rate"),
             ("Communication", "Notices and notifications to residents"),
             ("Visibility", "Role-based views and an open-requests dashboard"),
             ("Accountability", "Audit trail of who did what and when")],
    "layers": [("Channels", ["Website", "Mobile app", "Telegram", "Committee email"]),
               ("Business modules", ["On-boarding", "User management", "Request management", "Workforce management",
                                     "Amenity management", "Financial management", "Inventory management",
                                     "Waste management", "Visitor management"]),
               ("Resident services", ["Tuck shop", "Laundry", "Parcel desk", "Events"]),
               ("Ancillary", ["Notifications", "Reports", "AI assist (suggests only)"]),
               ("Interfaces", ["Payment gateway (planned)"])],
    "out": ["Online payments", "Medical services", "IoT and biometrics", "Polls",
            "AI acting without a person confirming"],
    "assumptions": ["The society gives written permission before testing with residents",
                    "A resident's registered phone is their identity on messaging",
                    "The committee owns every decision that costs money or reaches all residents"],
}

process = [
    {"n": "1", "name": "On-boarding and verification", "roles": "Resident, Committee"},
    {"n": "2", "name": "Raise a request", "roles": "Resident"},
    {"n": "3.1", "name": "Allocation", "roles": "Committee, Head"},
    {"n": "3.2", "name": "Track", "roles": "Resident, Committee"},
    {"n": "3.3", "name": "Execution", "roles": "Staff"},
    {"n": "3.4", "name": "Feedback", "roles": "Resident"},
]

ROLES = {"cols": ["Owner", "Tenant", "Family member", "Committee member"], "rows": [["Who", "Owns the flat", "Rents the flat from the owner", "Lives in the flat with the owner", "Resident elected to run the society"], ["Account", "Resident", "Resident", "Resident", "Committee (position member; head and admin are senior positions)"], ["Raise and track requests", "Yes, for the whole flat", "Yes, for the flat", "Yes, for the flat", "Sees and handles everyone's requests"], ["Rate finished work", "Yes, also for the family", "Yes, own requests", "No (the owner rates)", "No"], ["Add family or tenants", "Yes (committee approves)", "No", "No", "Approves new residents (Verification)"], ["Lease", "-", "Reads own lease", "-", "Records tenants' leases"], ["Money", "The flat's dues and shop/laundry credit", "Same flat account (shared)", "Same flat account (shared)", "Raises bills and records payments for all flats"], ["Runs the society", "No", "No", "No", "Assigns work, notices, reports, monitoring"]], "note": "Head of committee: everything a member does plus approving costs above the limit (default Rs 10,000) and governing settings and accounts. Admin: accounts for every role, settings, access rules and system health. What each resident type may do is a default the committee can change in Settings > Access."}

STACK = {"tiers": [["Clients", "Web app (vanilla JavaScript, no build step) at / ; installable phone app (PWA) at /m/ ; Android wrapper (Capacitor) ; Flutter app ; React + TypeScript app (migration target)"], ["API", "One REST API with JSON over HTTPS: Node 22 + Express (system of record). A Java Spring Boot API with the same URLs and JSON is the migration target"], ["Security", "Session cookie (httpOnly, SameSite, Secure in production) after POST /api/login; role check on every route; strict allow-lists for guard, staff, IT, shop and laundry; CSRF origin check; strict Content Security Policy"], ["Data", "SQLite (node:sqlite) for the Node API; PostgreSQL 16 for the Java API and production; photos in an upload folder"], ["Integrations", "Telegram Bot API (message intake), n8n workflows (free LLM gate, Gmail email desk), optional Anthropic API for triage, Web NFC / USB readers for cards"], ["Hosting", "Render (Docker), deployed from GitHub; CI runs Node, Java (H2 and PostgreSQL), React, Docker and Flutter checks on every pull request"]], "flow": ["The browser or app signs in with POST /api/login and receives a session cookie.", "Every screen calls the REST API with fetch (JSON); the cookie identifies the person and the server checks the role.", "The API reads and writes the database and records every change in the audit trail.", "Changes notify people (in-app notifications, Telegram, email) and the screens refresh within seconds by polling /api/pulse.", "The same API serves every client, so the web app, phone app and Flutter app always show the same data."], "apis": [["Sign-in and profile", "/api/login, /api/logout, /api/register, /api/me", "All", "app.js"], ["Requests (lifecycle)", "/api/requests, /api/requests/:id/status, /assign, /rate, /reopen", "Resident, committee, staff", "app.js, roles.js"], ["Committee administration", "/api/admin/users, /api/admin/stats, /api/admin/settings, /api/admin/access, /api/admin/audit", "Committee", "app.js"], ["Roles, staff and IT", "/api/admin/accounts, /api/staff/*, /api/admin/approvals, /api/admin/reports/monthly, /api/support, /api/it/*", "Committee, staff, IT", "roles-api.md"], ["Notices and alerts", "/api/notices, /api/notifications, /api/emergencies, /api/pulse", "All", "app.js"], ["Gate and visitors", "/api/gate/passes, /api/gate/verify, /api/gate/log, /api/parcels", "Resident, guard, committee", "app.js, services-api.md"], ["Community cards (NFC)", "/api/gate/cards, /api/gate/tap, /api/gate/presence, /api/admin/users/:id/card, /api/me/card", "Guard, committee, everyone (own card)", "nfc-api.md"], ["Society modules", "/api/amenities, /api/bookings, /api/dues, /api/admin/dues, /api/inventory, /api/waste/*", "Resident, committee, staff", "modules-api.md"], ["Resident services", "/api/shop/*, /api/laundry/*, /api/events, /api/credit, /api/services/summary", "Resident, shop, laundry, committee", "services-api.md"], ["Message intake", "/api/telegram/webhook, /api/whatsapp/webhook (secret-checked)", "Telegram, WhatsApp provider", "app.js"], ["Email desk", "/desk/:token (signed 7-day links)", "Committee by email", "email-desk.js"]]}

data = {"version": "2.0", "date": "25 November 2026", "scope": scope, "personas": personas,
        "process": process, "roles": ROLES, "stack": STACK, "frs": frs, "nfrs": nfrs, "stories": story_list}
(pathlib.Path(__file__).parent / "data.json").write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
print(f"{len(frs)} FRs, {len(nfrs)} NFRs, {len(story_list)} stories, "
      f"{sum(1 for f in frs if f['tests'])} FRs with tests")
