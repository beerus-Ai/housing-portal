"""Rough slide preview without PowerPoint or LibreOffice: draws shapes, pictures and text from the
.pptx as HTML (one div per shape, same position, size, fill and font size), for overflow checks.
Usage: python preview_pptx.py deck.pptx out.html"""
import sys, base64, html
from pptx import Presentation
from pptx.util import Emu
from pptx.enum.shapes import MSO_SHAPE_TYPE

THEME = {"tx1": "3A3A3A", "dk1": "3A3A3A", "bg1": "FFFFFF", "lt1": "FFFFFF", "tx2": "2E3A87", "dk2": "2E3A87",
         "bg2": "EEECE3", "lt2": "EEECE3", "accent1": "00B5C3", "accent2": "FF6B4F", "accent3": "B5D97A",
         "accent4": "0F7F7A", "accent5": "2E3A87", "accent6": "9B9B95"}
NS = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
inch = lambda e: Emu(e).inches * 96


def color(el):
    if el is None:
        return None
    s = el.find(f"{NS}srgbClr")
    if s is not None:
        return s.get("val")
    s = el.find(f"{NS}schemeClr")
    if s is not None:
        return THEME.get(s.get("val"), "FF00FF")
    return None


def fill_of(sp):
    sppr = sp._element.find(".//{http://schemas.openxmlformats.org/presentationml/2006/main}spPr")
    if sppr is None:
        return None
    return color(sppr.find(f"{NS}solidFill"))


def run_css(r, default_size):
    rpr = r._r.find(f"{NS}rPr")
    size = int(rpr.get("sz")) / 100 if rpr is not None and rpr.get("sz") else default_size
    c = color(rpr.find(f"{NS}solidFill")) if rpr is not None else None
    b = rpr is not None and rpr.get("b") == "1"
    it = rpr is not None and rpr.get("i") == "1"
    return f"font-size:{size}pt;{'font-weight:700;' if b else ''}{'font-style:italic;' if it else ''}{f'color:#{c};' if c else ''}"


prs = Presentation(sys.argv[1])
W, H = inch(prs.slide_width), inch(prs.slide_height)
out = ["<html><body style='margin:0;background:#888;font-family:Calibri,Arial'>"]
for n, slide in enumerate(prs.slides, 1):
    bg = "2E3A87" if slide.slide_layout.name == "DARK" else "FFFFFF"
    out.append(f"<div style='position:relative;width:{W}px;height:{H}px;background:#{bg};margin:10px;overflow:hidden'>")
    shapes = list(slide.slide_layout.shapes) + list(slide.shapes)
    for sp in shapes:
        if sp.is_placeholder and not sp.has_text_frame:
            continue
        if sp.is_placeholder and sp in slide.slide_layout.shapes:
            continue
        x, y, w, h = inch(sp.left or 0), inch(sp.top or 0), inch(sp.width or 0), inch(sp.height or 0)
        style = f"position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;box-sizing:border-box;"
        if sp.shape_type == MSO_SHAPE_TYPE.PICTURE:
            data = base64.b64encode(sp.image.blob).decode()
            out.append(f"<img src='data:image/png;base64,{data}' style='{style}'>")
            continue
        if sp.has_chart:
            out.append(f"<div style='{style}border:2px dashed #0F7F7A;color:#0F7F7A'>[chart]</div>")
            continue
        f = fill_of(sp)
        geom = sp._element.find(f".//{NS}prstGeom")
        g = geom.get("prst") if geom is not None else ""
        radius = "50%" if g == "ellipse" else "10px" if g == "roundRect" else "0"
        if f:
            style += f"background:#{f};border-radius:{radius};"
        if g in ("chevron", "homePlate"):
            style += "clip-path:polygon(0 0,85% 0,100% 50%,85% 100%,0 100%" + (",15% 50%" if g == "chevron" else "") + ");"
        txt = ""
        if sp.has_text_frame and sp.text_frame.text.strip():
            tf = sp.text_frame
            body = tf._txBody.find(f"{NS}bodyPr")
            anchor = body.get("anchor") if body is not None else None
            jc = {"ctr": "center", "b": "flex-end"}.get(anchor, "flex-start")
            ps = []
            for p in tf.paragraphs:
                algn = p._p.find(f"{NS}pPr")
                a = algn.get("algn") if algn is not None else None
                ta = {"ctr": "center", "r": "right"}.get(a, "left")
                bullet = "• " if algn is not None and algn.find(f"{NS}buChar") is not None else ""
                runs = "".join(f"<span style='{run_css(r, 18)}'>{html.escape(r.text)}</span>" for r in p.runs)
                ps.append(f"<div style='text-align:{ta};line-height:1.15'>{bullet}{runs}</div>")
            txt = f"<div style='display:flex;flex-direction:column;justify-content:{jc};height:100%;outline:1px dotted rgba(255,0,0,.35)'>{''.join(ps)}</div>"
        out.append(f"<div style='{style}'>{txt}</div>")
    out.append(f"<div style='position:absolute;right:4px;top:2px;font:10px Arial;color:#f0f'>{n}</div></div>")
out.append("</body></html>")
open(sys.argv[2], "w", encoding="utf-8").write("\n".join(out))
print(len(prs.slides), "slides")
