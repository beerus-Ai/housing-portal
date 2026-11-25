"""Builds jira.json (epics, stories, sprints) from data.json and docs/testing/test-cases.md.
One Jira story per functional requirement and per non-functional requirement, so Jira matches the
Requirements Document one to one. Loaded into Jira by jira_load.js (run in a signed-in Jira tab)."""
import json, re, pathlib
from stories_text import S

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
d = json.loads((HERE / "data.json").read_text(encoding="utf-8"))

# Test cases: ID -> (steps, expected)
TC = {}
for ln in (ROOT / "docs" / "testing" / "test-cases.md").read_text(encoding="utf-8").splitlines():
    m = re.match(r"^\| (TC-[A-Z]+-\d+) \|([^|]*)\|([^|]*)\|([^|]*)\|", ln)
    if m:
        TC[m.group(1)] = (m.group(3).strip().replace("`", ""), m.group(4).strip().replace("`", ""))

MANUAL_AC = {
    "FR-ON-03": [("a new resident registers", "the registration is saved", "every committee member gets a notification and the email desk is alerted")],
    "FR-AU-08": [("Google sign-in is switched on and the resident already has an account", "they choose Sign in with Google", "they are signed in; an unknown Google account is refused")],
    "FR-WR-12": [("a Telegram message arrives from a linked resident", "the gate classifies it", "a request is created, an unsure message goes to Needs review, and chatter is ignored")],
    "FR-WR-11": [("a request raised by message changes stage", "the stage is saved", "the resident gets the update in the same chat (WhatsApp not connected yet)")],
}
ROLE = {"All": "user", "Resident": "resident", "Committee Member": "committee member", "Head of Committee": "head of committee",
        "Admin": "admin", "Staff": "staff member", "Staff (guard)": "guard", "IT Staff": "IT staff member"}
PRIORITY = {"M": "High", "S": "Medium", "C": "Low"}
MOSCOW = {"M": "Must", "S": "Should", "C": "Could"}
POINTS = {"M": 5, "S": 3, "C": 2}
STATUS = {"Built": "Done", "Partly built": "In Progress", "Not built": "To Do"}

EPICS = [
    ("Process 1", "Process 1 · User on-boarding and verification", "Residents register with consent; the committee verifies them; everyone signs in securely.", 1),
    ("Process 2", "Process 2 · Raise a request", "Residents report a problem from the portal, the app or Telegram; messages are sorted; emergencies raise an alert.", 2),
    ("Process 3", "Process 3 · Lifecycle of a resident request", "3.1 Allocation, 3.2 Track, 3.3 Execution, 3.4 Feedback.", 2),
    ("Committee", "Committee Member · dashboard, reports, broadcast, monitoring", "What the committee needs to see, report, announce and audit.", 3),
    ("Head", "Head of Committee and Admin · governance", "Who may change settings, access rules and accounts.", 1),
    ("Staff", "Staff · limited access", "Staff and guards see only their own work and the gate.", 1),
    ("IT", "IT Staff · support, training, upkeep", "Support tickets, guides per role, health, backup and maintenance.", 3),
    ("Society", "Society modules · amenities, dues, inventory, waste", "Modules from the product architecture whiteboard (25 Nov 2026).", 4),
    ("Resident", "Resident services · tuck shop, laundry, parcels, events", "Services residents use every day; the tuck shop is the e-commerce interface on the whiteboard.", 4),
    ("NFR", "Non-Functional Requirements", "Security, privacy, availability, accessibility, AI safety and operation.", 4),
]
SPRINTS = [
    ("Sprint 1 · On-boarding and access", "Residents can register, be verified and sign in; every role sees only its own screens."),
    ("Sprint 2 · Raise and resolve requests", "A request goes end to end: raise, allocate, track, execute, rate."),
    ("Sprint 3 · Committee and IT", "The committee sees, reports and broadcasts; IT supports users."),
    ("Sprint 4 · Society modules and quality", "Amenities, dues, inventory and waste; non-functional requirements checked."),
]


def lower_first(s):
    return s[0].lower() + s[1:] if s and not s[:2].isupper() else s


def ac_for(f):
    if f["id"] in MANUAL_AC:
        return MANUAL_AC[f["id"]]
    out = []
    for tc in f["tests"][:2]:
        steps, exp = TC[tc]
        out.append((f"A {ROLE.get(f['role'].split(', ')[0], 'user')} using the portal", steps, exp + f" ({tc})"))
    return out


# ADF helpers
txt = lambda s, bold=False: {"type": "text", "text": s, **({"marks": [{"type": "strong"}]} if bold else {})}
para = lambda *runs: {"type": "paragraph", "content": list(runs)}
head = lambda s: {"type": "heading", "attrs": {"level": 3}, "content": [txt(s)]}
bullets = lambda items: {"type": "bulletList", "content": [{"type": "listItem", "content": [para(*i)]} for i in items]}


def story_doc(f, ac, step):
    return {"type": "doc", "version": 1, "content": [
        head("Requirement"), para(txt(f"{f['id']}: ", True), txt(f["text"])),
        head("Acceptance criteria"),
        bullets([[txt("Given: ", True), txt(g[0].upper() + g[1:] + ". "), txt("When: ", True), txt(w[0].upper() + w[1:] + ". "), txt("Then: ", True), txt(t[0].upper() + t[1:])] for g, w, t in ac]),
        head("Details"),
        bullets([[txt("MoSCoW: ", True), txt(MOSCOW[f["priority"]])], [txt("Roles: ", True), txt(f["role"])],
                 [txt("Process step (Signavio): ", True), txt(step)], [txt("Test cases: ", True), txt(", ".join(f["tests"]) or "manual check")],
                 [txt("User stories: ", True), txt(", ".join(f["stories"]) or "-")], [txt("Status: ", True), txt(f["status"])]]),
    ]}


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


epics = [{"key": k, "summary": s, "description": {"type": "doc", "version": 1, "content": [para(txt(desc))]}, "sprint": sp} for k, s, desc, sp in EPICS]
stories = []
for f in d["frs"]:
    ek = next(k for k, *_ in EPICS if f["area"].startswith(k))
    sprint = next(e[3] for e in EPICS if e[0] == ek)
    role, want, why = S[f["id"]]
    article = "an" if role[0] in "aeiou" and not role.startswith("user") else "a"
    summary = f"As {article} {role}, I want {want}, so that {why}"
    step = f["sub"] or next(p["n"] + " " + p["name"] for p in d["process"] if f["area"].startswith("Process " + p["n"][0])) if f["area"].startswith("Process") else f["area"]
    stories.append({"id": f["id"], "epic": ek, "summary": summary[:250], "description": story_doc(f, ac_for(f), step),
                    "priority": PRIORITY[f["priority"]], "points": POINTS[f["priority"]], "sprint": sprint,
                    "labels": [f["id"], MOSCOW[f["priority"]], slug(f["area"].split(":")[0])], "status": STATUS[f["status"]]})
for n in d["nfrs"]:
    ac = [("the portal is running", "it is " + ("checked" if n["tests"] else "reviewed"), lower_first(n["text"]) + (f" ({', '.join(n['tests'])})" if n["tests"] else ""))]
    gap = n["id"] in {"NFR-04", "NFR-05", "NFR-11", "NFR-12", "NFR-14"}
    f = {"id": n["id"], "text": n["text"], "priority": "M" if n["id"] in {"NFR-01", "NFR-02", "NFR-03", "NFR-09", "NFR-10"} else "S",
         "role": "All", "tests": n["tests"], "stories": [], "status": "Partly built" if gap else "Built"}
    stories.append({"id": n["id"], "epic": "NFR", "summary": f"{n['id']} {n['area']}: {n['short']}", "description": story_doc(f, ac, "Applies to every step"),
                    "priority": PRIORITY[f["priority"]], "points": 3, "sprint": 4, "labels": [n["id"], MOSCOW[f["priority"]], "non-functional"],
                    "status": "In Progress" if gap else "Done"})

(HERE / "jira.json").write_text(json.dumps({"epics": epics, "stories": stories, "sprints": SPRINTS}, ensure_ascii=False), encoding="utf-8")
print(len(epics), "epics,", len(stories), "stories")
for s in stories[:3] + stories[-1:]:
    print(s["summary"])
print(max(len(s["summary"]) for s in stories), "max summary length")
