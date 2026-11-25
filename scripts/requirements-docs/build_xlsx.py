"""Excel register: dashboard (formulas + charts), requirement lists with filters, personas, scope, stories."""
import json, pathlib
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.chart import BarChart, DoughnutChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.formatting.rule import FormulaRule
from openpyxl.workbook.properties import CalcProperties

HERE = pathlib.Path(__file__).resolve().parent
d = json.loads((HERE / "data.json").read_text(encoding="utf-8"))
OUT = HERE.parents[1] / "Requirements Documents" / "Requirements Register.xlsx"

NAVY, TEAL, DTEAL, CORAL, LIME, GREY, BEIGE = "2E3A87", "00B5C3", "0F7F7A", "FF6B4F", "B5D97A", "9B9B95", "EEECE3"
PRI = {"M": ("Must", TEAL, "FFFFFF"), "S": ("Should", CORAL, "FFFFFF"), "C": ("Could", LIME, "333333")}
F = lambda **k: Font(name="Arial", **k)
fill = lambda c: PatternFill("solid", start_color=c, end_color=c)
thin = Side(style="thin", color="E2DFD3")
wrap = Alignment(wrap_text=True, vertical="top")

GROUP = {"Process 1": "Process 1 · On-boarding", "Process 2": "Process 2 · Raise a request", "Process 3": "Process 3 · Request lifecycle",
         "Committee": "Committee Member", "Head": "Head of Committee and Admin", "Staff": "Staff", "IT": "IT Staff", "Society": "Society modules", "Resident": "Resident services"}
label = lambda area: next(v for k, v in GROUP.items() if area.startswith(k))

wb = Workbook()
wb.calculation = CalcProperties(fullCalcOnLoad=True)


def title(ws, text, sub, width_cols):
    ws.sheet_view.showGridLines = False
    ws["A1"] = text
    ws["A1"].font = F(bold=True, size=20, color=NAVY)
    ws["A2"] = sub
    ws["A2"].font = F(size=10, color="666666", italic=True)
    ws.row_dimensions[1].height = 30


def table(ws, ref, name, style="TableStyleLight1"):
    t = Table(displayName=name, ref=ref)
    t.tableStyleInfo = TableStyleInfo(name=style, showRowStripes=True)
    ws.add_table(t)


def header(ws, row, heads, widths):
    for i, (h, w) in enumerate(zip(heads, widths), 1):
        c = ws.cell(row=row, column=i, value=h)
        c.font = F(bold=True, color="FFFFFF", size=10)
        c.fill = fill(NAVY)
        c.alignment = Alignment(vertical="center", wrap_text=True)
        ws.column_dimensions[c.column_letter].width = w
    ws.row_dimensions[row].height = 22


# ---------- Functional Requirements ----------
fr = wb.active
fr.title = "Functional Requirements"
title(fr, "Functional Requirements", f"{len(d['frs'])} requirements · grouped by the whiteboard process list, then by role · MoSCoW from the Session 3 brief · filter with the header arrows", 9)
heads = ["ID", "Process / role", "Step", "Requirement", "Role", "Priority", "Status", "User stories", "Test cases"]
header(fr, 4, heads, [11, 26, 14, 60, 22, 10, 12, 18, 22])
for r, f in enumerate(d["frs"], 5):
    vals = [f["id"], label(f["area"]), (f["sub"] or "").split(" ", 1)[-1] if f["sub"] else "", f["text"], f["role"],
            PRI[f["priority"]][0], f["status"], ", ".join(f["stories"]), ", ".join(f["tests"])]
    for c, v in enumerate(vals, 1):
        cell = fr.cell(row=r, column=c, value=v)
        cell.font = F(size=10, bold=(c == 1), color=NAVY if c == 1 else "3A3A3A")
        cell.alignment = wrap
        cell.border = Border(bottom=thin)
    pr = fr.cell(row=r, column=6)
    name, bg, fg = PRI[f["priority"]]
    pr.fill, pr.font, pr.alignment = fill(bg), F(size=10, bold=True, color=fg), Alignment(horizontal="center", vertical="top")
    st = fr.cell(row=r, column=7)
    if f["status"] != "Built":
        st.font = F(size=10, bold=True, color=CORAL)
last_fr = 4 + len(d["frs"])
table(fr, f"A4:I{last_fr}", "FunctionalRequirements")
fr.freeze_panes = "B5"

# ---------- Non-Functional ----------
nf = wb.create_sheet("Non-Functional")
title(nf, "Non-Functional Requirements", f"{len(d['nfrs'])} quality requirements · coral rows are open gaps (target not agreed or control not built)", 5)
header(nf, 4, ["ID", "Area", "Requirement", "Open gap", "Test cases"], [10, 20, 80, 11, 22])
GAPS = {"NFR-04", "NFR-05", "NFR-11", "NFR-12", "NFR-14"}
for r, n in enumerate(d["nfrs"], 5):
    vals = [n["id"], n["area"], n["text"], "Yes" if n["id"] in GAPS else "No", ", ".join(n["tests"])]
    for c, v in enumerate(vals, 1):
        cell = nf.cell(row=r, column=c, value=v)
        cell.font = F(size=10, bold=c in (1, 2), color=NAVY if c == 1 else DTEAL if c == 2 else "3A3A3A")
        cell.alignment = wrap
        cell.border = Border(bottom=thin)
    if n["id"] in GAPS:
        nf.cell(row=r, column=4).font = F(size=10, bold=True, color=CORAL)
last_nf = 4 + len(d["nfrs"])
table(nf, f"A4:E{last_nf}", "NonFunctional")
nf.conditional_formatting.add(f"A5:E{last_nf}", FormulaRule(formula=['$D5="Yes"'], fill=fill("FFE9E4")))
nf.freeze_panes = "A5"

# ---------- Personas ----------
pe = wb.create_sheet("Personas")
title(pe, "Personas", "The six roles on the faculty whiteboard (21 Nov 2026). Names are illustrative; no real resident data is used.", 6)
header(pe, 4, ["#", "Role", "Persona", "Who", "In their words", "Goals", "Pain today"], [5, 20, 18, 30, 42, 44, 36])
for r, p in enumerate(d["personas"], 5):
    vals = [r - 4, p["role"], p["name"], p["who"], f"“{p['quote']}”", "\n".join("• " + g for g in p["goals"]), "\n".join("• " + g for g in p["pains"])]
    for c, v in enumerate(vals, 1):
        cell = pe.cell(row=r, column=c, value=v)
        cell.font = F(size=10, bold=c in (2, 3), italic=c == 5, color=NAVY if c in (2, 3) else "3A3A3A")
        cell.alignment = wrap
        cell.fill = fill(BEIGE) if r % 2 else PatternFill()
    pe.cell(row=r, column=1).fill = fill(TEAL)
    pe.cell(row=r, column=1).font = F(bold=True, color="FFFFFF", size=12)
    pe.cell(row=r, column=1).alignment = Alignment(horizontal="center", vertical="top")
    pe.row_dimensions[r].height = 15 * max(len(p["goals"]), 3) + 6

# ---------- Tests and capacity
if d.get("tests") and d.get("capacity"):
    tc_ = wb.create_sheet("Tests and capacity")
    title(tc_, "Tests done and capacity", "Automated suites, documented cases and the load test (scripts/load-test)", 5)
    header(tc_, 4, ["Suite", "Tests", "Covers"], [36, 10, 70])
    for r, (a, b, c) in enumerate(d["tests"]["suites"], 5):
        for i, v in enumerate([a, b, c], 1): x = tc_.cell(row=r, column=i, value=v); x.font = F(size=10, bold=i == 1); x.alignment = wrap
    r0 = 6 + len(d["tests"]["suites"])
    for i, h in enumerate(["Users at once", "Requests/s", "p50 ms", "p95 ms", "Errors"], 1): x = tc_.cell(row=r0, column=i, value=h); x.font = F(bold=True, color="FFFFFF", size=10); x.fill = fill(NAVY)
    for r, l in enumerate(d["capacity"]["levels"], r0 + 1):
        for i, k in enumerate(["concurrency", "rps", "p50_ms", "p95_ms", "errors"], 1): tc_.cell(row=r, column=i, value=l[k]).font = F(size=10)
    rr = r0 + len(d["capacity"]["levels"]) + 2
    tc_.cell(row=rr, column=1, value=f"About {d['capacity']['users']} people at the same moment ({d['capacity']['sustained_rps']} requests/s at p95 under 500 ms)").font = F(bold=True, color=NAVY, size=11)
    for r, (a, b, c) in enumerate(d["capacity"]["scale"], rr + 2):
        for i, v in enumerate([a, b, c], 1): x = tc_.cell(row=r, column=i, value=v); x.font = F(size=10, bold=i == 1); x.alignment = wrap
    ch = BarChart(); ch.type = "col"; ch.title = "Requests/s by requests in flight"
    ch.add_data(Reference(tc_, min_col=2, min_row=r0, max_row=r0 + len(d['capacity']['levels'])), titles_from_data=True)
    ch.set_categories(Reference(tc_, min_col=1, min_row=r0 + 1, max_row=r0 + len(d['capacity']['levels'])))
    ch.series[0].graphicalProperties.solidFill = TEAL; ch.legend = None; ch.roundedCorners = False; ch.x_axis.delete = False; ch.y_axis.delete = False; ch.height, ch.width = 7, 14
    tc_.add_chart(ch, f"G{r0}")

# ---------- Technology stack and API map
st = wb.create_sheet("API map")
title(st, "Technology stack and API map", "How the front end and the back-end APIs are connected (contracts in docs/*-api.md)", 4)
header(st, 4, ["Tier", "What"], [20, 110])
for r, (a, b) in enumerate(d["stack"]["tiers"], 5):
    st.cell(row=r, column=1, value=a).font = F(bold=True, color=NAVY, size=10)
    st.cell(row=r, column=2, value=b).font = F(size=10); st.cell(row=r, column=2).alignment = wrap
r0 = 6 + len(d["stack"]["tiers"])
for i, (h, w) in enumerate(zip(["Area", "Main routes", "Used by", "Contract"], [26, 70, 30, 20]), 1):
    c = st.cell(row=r0, column=i, value=h); c.font = F(bold=True, color="FFFFFF", size=10); c.fill = fill(NAVY)
    st.column_dimensions[c.column_letter].width = max(st.column_dimensions[c.column_letter].width or 0, w)
for r, row in enumerate(d["stack"]["apis"], r0 + 1):
    for c, v in enumerate(row, 1):
        cell = st.cell(row=r, column=c, value=v); cell.font = F(size=10, bold=c == 1, color=NAVY if c == 1 else "3A3A3A"); cell.alignment = wrap

# ---------- Roles (owner, tenant, family, committee)
ro = wb.create_sheet("Roles")
title(ro, "Owner, tenant, family and committee", "Who can do what (defaults; the committee can change resident access in Settings)", 5)
header(ro, 4, [""] + d["roles"]["cols"], [24, 30, 30, 30, 40])
for r, row in enumerate(d["roles"]["rows"], 5):
    for c, v in enumerate(row, 1):
        cell = ro.cell(row=r, column=c, value=v)
        cell.font = F(size=10, bold=c == 1, color=NAVY if c == 1 else "3A3A3A")
        cell.alignment = wrap
        cell.fill = fill(BEIGE) if r % 2 else PatternFill()
ro.cell(row=6 + len(d["roles"]["rows"]), column=1, value=d["roles"]["note"]).font = F(size=10, italic=True, color="666666")

# ---------- Scope ----------
sc = wb.create_sheet("Scope")
title(sc, "Scope", "Problem, goal, what is in and out (Session 3 brief; product architecture whiteboard, 25 Nov 2026)", 3)
sc.column_dimensions["A"].width, sc.column_dimensions["B"].width = 24, 95
row = 4
for k, v in [("The problem", d["scope"]["problem"]), ("The goal", d["scope"]["goal"])]:
    sc.cell(row=row, column=1, value=k).font = F(bold=True, color="FFFFFF")
    sc.cell(row=row, column=1).fill = fill(NAVY)
    sc.cell(row=row, column=1).alignment = Alignment(vertical="top")
    sc.cell(row=row, column=2, value=v).alignment = wrap
    sc.cell(row=row, column=2).font = F(size=10)
    sc.cell(row=row, column=2).fill = fill(BEIGE)
    sc.row_dimensions[row].height = 32
    row += 1
row += 1
for head, items, color in [("Five core requirements", [f"{a}: {b}" for a, b in d["scope"]["core"]], TEAL)] + \
        [(f"In scope · {l}", it, TEAL) for l, it in d["scope"]["layers"]] + \
        [("Out of scope", d["scope"]["out"], GREY), ("Assumptions", d["scope"]["assumptions"], CORAL)]:
    sc.cell(row=row, column=1, value=head).font = F(bold=True, color="FFFFFF", size=10)
    sc.cell(row=row, column=1).fill = fill(color)
    sc.cell(row=row, column=1).alignment = Alignment(vertical="top", wrap_text=True)
    sc.cell(row=row, column=2, value="\n".join("• " + x for x in items)).alignment = wrap
    sc.cell(row=row, column=2).font = F(size=10)
    sc.row_dimensions[row].height = 14 * len(items) + 4
    row += 1

# ---------- User Stories ----------
us = wb.create_sheet("User Stories")
title(us, "User Stories", "As a <Role>, I want <Requirement>, so that <Why> (faculty whiteboard). Acceptance criteria are in Jira (HSP).", 5)
header(us, 4, ["ID", "Role", "I want…", "so that…", "Requirements"], [12, 20, 55, 45, 24])
for r, s in enumerate(d["stories"], 5):
    for c, v in enumerate([s["id"], s["role"], s["want"], s["why"], s["source"]], 1):
        cell = us.cell(row=r, column=c, value=v)
        cell.font = F(size=10, bold=c == 1, color=NAVY if c == 1 else "3A3A3A")
        cell.alignment = wrap
        cell.border = Border(bottom=thin)
table(us, f"A4:E{4 + len(d['stories'])}", "UserStories")
us.freeze_panes = "A5"

# ---------- Dashboard (first tab) ----------
db = wb.create_sheet("Dashboard", 0)
title(db, "Requirements Register · Dashboard", f"Sahyadri Heights Housing Society Portal · version {d['version']} · {d['date']} · counts are live formulas on the other sheets", 8)
for col, w in zip("ABCDEFGH", [30, 11, 11, 11, 11, 4, 22, 12]):
    db.column_dimensions[col].width = w
frr = f"'Functional Requirements'!$F$5:$F${last_fr}"
frg = f"'Functional Requirements'!$B$5:$B${last_fr}"
frs_ = f"'Functional Requirements'!$G$5:$G${last_fr}"
frt = f"'Functional Requirements'!$I$5:$I${last_fr}"
# KPI tiles
kpis = [("Personas", f"=COUNTA(Personas!$B$5:$B$10)"), ("Functional", f"=COUNTA('Functional Requirements'!$A$5:$A${last_fr})"),
        ("Non-functional", f"=COUNTA('Non-Functional'!$A$5:$A${last_nf})"), ("Linked to tests", f'=COUNTIF({frt},"?*")')]
for i, (lab, fml) in enumerate(kpis):
    col = 1 + i if i == 0 else 2 + (i - 1) * 2 if i < 3 else 7
    c = db.cell(row=4, column=[1, 2, 4, 7][i], value=fml)
    c.font = F(bold=True, size=26, color=NAVY)
    l = db.cell(row=5, column=[1, 2, 4, 7][i], value=lab)
    l.font = F(size=10, color="666666")
    for rr in (4, 5):
        for cc in {0: [1], 1: [2, 3], 2: [4, 5], 3: [7, 8]}[i]:
            db.cell(row=rr, column=cc).fill = fill(BEIGE)
db.row_dimensions[4].height = 36

db["A7"] = "Functional requirements by process / role and priority"
db["A7"].font = F(bold=True, size=12, color=NAVY)
for i, (h, color) in enumerate([("Process / role", NAVY), ("Must", TEAL), ("Should", CORAL), ("Could", LIME), ("Total", NAVY)]):
    c = db.cell(row=8, column=1 + i, value=h)
    c.font = F(bold=True, color="333333" if color == LIME else "FFFFFF", size=10)
    c.fill = fill(color)
    c.alignment = Alignment(horizontal="left" if i == 0 else "center")
groups = list(dict.fromkeys(label(f["area"]) for f in d["frs"]))
for r, g in enumerate(groups, 9):
    db.cell(row=r, column=1, value=g).font = F(size=10)
    for i, p in enumerate(["Must", "Should", "Could"]):
        c = db.cell(row=r, column=2 + i, value=f'=COUNTIFS({frg},$A{r},{frr},"{p}")')
        c.alignment, c.font = Alignment(horizontal="center"), F(size=10)
    t = db.cell(row=r, column=5, value=f"=SUM(B{r}:D{r})")
    t.alignment, t.font = Alignment(horizontal="center"), F(size=10, bold=True)
    for cc in range(1, 6):
        db.cell(row=r, column=cc).border = Border(bottom=thin)
tot = 9 + len(groups)
db.cell(row=tot, column=1, value="Total").font = F(bold=True, size=10, color=NAVY)
for cc in range(2, 6):
    L = db.cell(row=8, column=cc).column_letter
    c = db.cell(row=tot, column=cc, value=f"=SUM({L}9:{L}{tot - 1})")
    c.font, c.alignment = F(bold=True, size=10, color=NAVY), Alignment(horizontal="center")

db["G7"] = "Status"
db["G7"].font = F(bold=True, size=12, color=NAVY)
for r, s in enumerate(["Built", "Partly built", "Not built"], 8):
    db.cell(row=r, column=7, value=s).font = F(size=10, color=CORAL if s != "Built" else "3A3A3A", bold=s != "Built")
    c = db.cell(row=r, column=8, value=f'=COUNTIF({frs_},G{r})')
    c.font, c.alignment = F(size=10, bold=True), Alignment(horizontal="center")
db["G12"] = "Open NFR gaps"
db["G12"].font = F(size=10, color=CORAL, bold=True)
db["H12"] = f"=COUNTIF('Non-Functional'!$D$5:$D${last_nf},\"Yes\")"
db["H12"].font, db["H12"].alignment = F(size=10, bold=True), Alignment(horizontal="center")
db["G14"] = "Legend: Must / Should / Could follow the brief's MoSCoW board; status covers the web app."
db["G14"].font = F(size=9, italic=True, color="666666")
db["G14"].alignment = Alignment(wrap_text=True, vertical="top")
db.merge_cells("G14:H17")

bar = BarChart()
bar.type, bar.grouping, bar.overlap = "bar", "stacked", 100
bar.title = "Requirements by process / role"
bar.add_data(Reference(db, min_col=2, max_col=4, min_row=8, max_row=tot - 1), titles_from_data=True)
bar.set_categories(Reference(db, min_col=1, min_row=9, max_row=tot - 1))
for s, c in zip(bar.series, [TEAL, CORAL, LIME]):
    s.graphicalProperties.solidFill = c
    s.graphicalProperties.line.solidFill = c
bar.dataLabels = DataLabelList()
bar.dataLabels.showVal = True
bar.y_axis.majorGridlines = None
bar.x_axis.scaling.orientation = "maxMin"
bar.x_axis.delete = False
bar.y_axis.delete = False
bar.legend.position = "b"
bar.legend.overlay = False
bar.roundedCorners = False
bar.height, bar.width = 9, 17
db.add_chart(bar, f"A{tot + 2}")

dn = DoughnutChart()
dn.title = "Priority mix"
dn.add_data(Reference(db, min_col=2, max_col=4, min_row=tot, max_row=tot), from_rows=True, titles_from_data=False)
dn.set_categories(Reference(db, min_col=2, max_col=4, min_row=8, max_row=8))
from openpyxl.chart.series import DataPoint
for i, c in enumerate([TEAL, CORAL, LIME]):
    pt = DataPoint(idx=i)
    pt.graphicalProperties.solidFill = c
    dn.series[0].dPt.append(pt)
dn.dataLabels = DataLabelList()
dn.dataLabels.showVal = True
dn.legend.position = "b"
dn.legend.overlay = False
dn.roundedCorners = False
dn.holeSize = 55
dn.height, dn.width = 9, 9
db.add_chart(dn, f"G{tot + 2}")

for ws in wb.worksheets:
    ws.sheet_properties.tabColor = {"Dashboard": NAVY, "Functional Requirements": TEAL, "Non-Functional": DTEAL, "Personas": CORAL, "Roles": CORAL, "API map": NAVY, "Tests and capacity": DTEAL, "Scope": LIME, "User Stories": GREY}[ws.title]
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToHeight = 0
wb.save(OUT)
print("wrote", OUT)
