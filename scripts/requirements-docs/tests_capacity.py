"""Adds section 6 (Tests done) and section 7 (Capacity and scaling) to docs/requirements.md and to data.json,
from scripts/load-test/results.json and the test counts passed in. Run after extract.py:
  python tests_capacity.py <node_tests> <integration_tests>"""
import json, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
node, integ = int(sys.argv[1]), int(sys.argv[2])
res = json.loads((ROOT / 'scripts' / 'load-test' / 'results.json').read_text(encoding='utf-8'))
tc = len(re.findall(r'^\| TC-', (ROOT / 'docs' / 'testing' / 'test-cases.md').read_text(encoding='utf-8'), re.M))
defects = len(re.findall(r'^\| DEF-', (ROOT / 'docs' / 'testing' / 'defect-log.md').read_text(encoding='utf-8'), re.M))
d = json.loads((HERE / 'data.json').read_text(encoding='utf-8'))
linked = sum(1 for f in d['frs'] if f['tests'])

TESTS = {
    "suites": [["Node API (node:test)", node, "Every story; runs in CI"], ["Integration (agents, cross-module)", integ, "Onboarding, requests, money, access, dashboards, web wiring"],
               ["Java API (JUnit)", 81, "Same API on H2 and PostgreSQL 16"], ["React app (Vitest)", 67, "Migration client"], ["Flutter app", 18, "Phone app"]],
    "other": [["Documented test cases", tc], ["Requirements linked to tests", f"{linked} of {len(d['frs'])}"], ["Defects logged (all fixed or tracked)", defects], ["CI jobs on every pull request", 6]],
    "manual": "Browser walkthroughs of every role on a local server (resident, committee member, head, admin, cleaner, maintenance, guard, tuck shop, laundry, IT); emulator checks of the Flutter app; live checks after each deploy.",
}
lv = res['levels']
CAP = {
    "machine": res['machine'], "seed": res['seed'], "db_mb": res['db_mb'], "bytes_per_row": res['bytes_per_request_row'],
    "login_per_sec": res['login_per_sec'], "levels": lv, "sustained_rps": res['sustained_rps'], "users": res['active_users_supported'],
    "model": "One active user = 0.3 requests/s (live refresh every 5 s plus page loads). Supported = highest load with p95 under 500 ms and no errors.",
    "db": [["Data tested", f"{res['seed']['residents']:,} residents, {res['seed']['requests']:,} requests, {res['seed']['audit']:,} audit rows, {res['seed']['orders']:,} orders = {res['db_mb']} MB"],
           ["Growth", f"about {res['bytes_per_request_row']} bytes per stored record; a 500-flat society for 5 years stays well under 1 GB"],
           ["SQLite limits", "Files up to 281 TB; one writer at a time (fine for one society); no network access"],
           ["Free hosting", "Render free plan: 0.1 CPU and the database is wiped on redeploy; plan figures are lower than this machine"]],
    "scale": [["One society, up to about 700 people at once (measured)", "Today's setup, on a paid instance with a persistent disk", "Render Starter + disk (fixes the data wipe)"],
              ["Several hundred to a few thousand active users", "Move data to PostgreSQL (the Java API is ready for it); run 2+ app instances behind the load balancer; keep sessions in the database or Redis", "PostgreSQL 16, Redis, 2-4 instances"],
              ["Many societies / tens of thousands", "Multi-tenant data (society id), push updates instead of 5 s polling, object storage for photos, read replicas, rate limits", "Managed PostgreSQL + replicas, S3, WebSockets/SSE"]],
}
d['tests'] = TESTS; d['capacity'] = CAP
(HERE / 'data.json').write_text(json.dumps(d, indent=1, ensure_ascii=False), encoding='utf-8')

p = ROOT / 'docs' / 'requirements.md'
s = p.read_text(encoding='utf-8')
s = re.split(r'\n## 6\. Tests done', s)[0].rstrip('\n')
s += "\n\n## 6. Tests done\n\n| Suite | Tests | Covers |\n| --- | --- | --- |\n" + "\n".join(f"| {a} | {b} | {c} |" for a, b, c in TESTS['suites'])
s += "\n\n| Also | |\n| --- | --- |\n" + "\n".join(f"| {a} | {b} |" for a, b in TESTS['other']) + f"\n\n{TESTS['manual']} Details: `docs/testing/`.\n"
s += f"\n## 7. Capacity and scaling\n\nMeasured on {CAP['machine']} with the real server and a seeded database ({CAP['db_mb']} MB). {CAP['model']}\n\n"
s += f"**Result: about {CAP['sustained_rps']} requests/s sustained, which is about {CAP['users']:,} people using the portal at the same moment.** Sign-ins: about {CAP['login_per_sec']} per second (password hashing).\n\n"
s += "| Requests in flight | Requests/s | p50 ms | p95 ms | Errors |\n| --- | --- | --- | --- | --- |\n" + "\n".join(f"| {l['concurrency']} | {l['rps']} | {l['p50_ms']} | {l['p95_ms']} | {l['errors']} |" for l in lv)
s += "\n\n| Database | |\n| --- | --- |\n" + "\n".join(f"| {a} | {b} |" for a, b in CAP['db'])
s += "\n\n**To scale**\n\n| When | Change | Tools |\n| --- | --- | --- |\n" + "\n".join(f"| {a} | {b} | {c} |" for a, b, c in CAP['scale']) + "\n\nRe-run: `node scripts/load-test/load.js`.\n"
p.write_text(s, encoding='utf-8')
print('sections 6 and 7 written:', CAP['sustained_rps'], 'rps,', CAP['users'], 'users')
