#!/usr/bin/env python3
"""
Generate the branded Bad Golf PDFs (Player Guide + Admin Guide) from a markdown
feature inventory.

Usage:
    python3 generate_bad_golf_docs.py <PROJECT_DIR> [SOURCE_MD] [OUT_DIR]

Defaults:
    PROJECT_DIR   the Bad Golf App folder (must contain BadGolfIcon.jpg and golf-app.html)
    SOURCE_MD     <PROJECT_DIR>/Documents/Bad_Golf_Feature_Inventory_SOURCE.md
    OUT_DIR       <PROJECT_DIR>/Documents

Requires: weasyprint, markdown  (pip install weasyprint markdown --break-system-packages)
"""
import sys, os, re, base64, datetime, markdown
from weasyprint import HTML

PROJECT   = sys.argv[1] if len(sys.argv) > 1 else "."
SOURCE_MD = sys.argv[2] if len(sys.argv) > 2 else os.path.join(PROJECT, "Documents", "Bad_Golf_Feature_Inventory_SOURCE.md")
OUT_DIR   = sys.argv[3] if len(sys.argv) > 3 else os.path.join(PROJECT, "Documents")
LOGO      = os.path.join(PROJECT, "BadGolfIcon.jpg")
APP_HTML  = os.path.join(PROJECT, "golf-app.html")

BUILD = "v2026.11.39"
try:
    with open(APP_HTML, "r", errors="ignore") as f:
        m = re.search(r"BG_BUILD\s*=\s*'([^']+)'", f.read())
        if m: BUILD = m.group(1)
except Exception:
    pass
DATE = datetime.date.today().strftime("%B %Y")

logo_b64 = base64.b64encode(open(LOGO, "rb").read()).decode()
raw = open(SOURCE_MD, "r", errors="ignore").read()

raw = raw.replace(
    "## Apple Watch App\n\n_Apple Watch integration currently in development; features are in spec._",
    "## Apple Watch App\n\nThe Bad Golf Apple Watch app is live. It signs in automatically from your iPhone "
    "and gives you live rangefinder distances on your wrist while you play.")

i = raw.index("## Admin Side Features")
head, tail = raw[:i], raw[i:]
wf_i = tail.index("## Common Workflows")
admin_body = tail[:wf_i].rstrip()
trailing = tail[wf_i:]

def grab(block, start, end=None):
    s = block.index(start); e = block.index(end) if end else len(block)
    return block[s:e]

workflows = grab(trailing, "## Common Workflows", "## Glossary")
glossary  = grab(trailing, "## Glossary", "## Tips & Tricks")
tips      = grab(trailing, "## Tips & Tricks")
mc_i = workflows.index("### Mapping a New Course (Admin)")
player_workflows = workflows[:mc_i].rstrip()
admin_workflow   = "## Common Admin Workflows\n\n" + workflows[mc_i:].strip()
ba_i = tips.index("### Be an Admin")
player_tips = tips[:ba_i].rstrip()
admin_tips  = "## Admin Tips & Tricks\n\n" + tips[ba_i:].replace("### Be an Admin\n", "").strip()

PLAYER_MD = head.rstrip() + "\n\n" + player_workflows + "\n\n" + glossary + "\n\n" + player_tips
ADMIN_MD  = admin_body + "\n\n" + admin_workflow + "\n\n" + admin_tips

def strip_top(md):
    j = md.index("## Account") if "## Account" in md else md.index("## ")
    return md[j:]
PLAYER_MD = re.sub(r"\*\*End of Documentation.*", "", strip_top(PLAYER_MD), flags=re.S)
ADMIN_MD  = re.sub(r"\*\*End of Documentation.*", "", ADMIN_MD, flags=re.S)

STATUS_MAP = {
 "\U0001F7E2": '<span class="dot" style="color:#1f8a3b">&#9679;</span>',
 "\U0001F7E3": '<span class="dot" style="color:#7b3fa0">&#9679;</span>',
 "\U0001F7E0": '<span class="dot" style="color:#d98a17">&#9679;</span>',
 "\U000026AA": '<span class="dot" style="color:#9aa3b0">&#9675;</span>',
 "\U0001F534": '<span class="dot" style="color:#c0392b">&#9679;</span>',
}
EMOJI_SEQ = re.compile(r'(?:[\U0001F000-\U0001FAFF\U0001F1E6-\U0001F1FF\U00002B00-\U00002BFF\U0000FE0F\U0000200D])+[ ]?')
def clean_emoji(t):
    for k, v in STATUS_MAP.items(): t = t.replace(k, v)
    t = EMOJI_SEQ.sub("", t)
    t = re.sub(r'^([ \t]*([-*]|\d+\.)[ \t])[ \t]+', r'\1', t, flags=re.M)
    t = re.sub(r'[ \t]{2,}', ' ', t)
    return t
def fix_lists(t):
    out = []
    is_item = lambda l: re.match(r'^\s*([-*]|\d+\.)\s+', l) is not None
    for l in t.split("\n"):
        if is_item(l):
            prev = out[-1] if out else ""
            if prev.strip() and not is_item(prev) and not prev.lstrip().startswith("|"):
                out.append("")
        out.append(l)
    return "\n".join(out)

md = markdown.Markdown(extensions=["tables", "fenced_code", "attr_list"])
def to_html(text):
    md.reset(); return md.convert(fix_lists(clean_emoji(text)))

CSS = r"""
@page { size: Letter; margin: 22mm 18mm 20mm 18mm;
  @bottom-left { content: "Bad Golf - __DOCTITLE__"; font-size:8pt; color:#8a98ad; }
  @bottom-center { content: "__BUILD__"; font-size:8pt; color:#8a98ad; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size:8pt; color:#8a98ad; } }
@page cover { margin:0; @bottom-left{content:""} @bottom-center{content:""} @bottom-right{content:""} }
@page toc { @bottom-left{content:""} @bottom-center{content:""} @bottom-right{content:""} }
* { box-sizing:border-box; }
body { font-family:"Helvetica Neue",Arial,sans-serif; color:#1a1f29; font-size:10.3pt; line-height:1.5; }
.cover { page:cover; height:100vh; width:100%;
  background:linear-gradient(160deg,#185fa5 0%,#0c447c 60%,#07335f 100%);
  color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; position:relative; }
.cover .logo { width:165px; height:165px; border-radius:34px; box-shadow:0 14px 40px rgba(0,0,0,.35); border:5px solid rgba(255,255,255,.85); margin-bottom:30px; }
.cover h1 { font-size:42pt; margin:0; letter-spacing:-1px; font-weight:800; line-height:1.05; color:#fff; }
.cover .kicker { font-size:13pt; letter-spacing:5px; text-transform:uppercase; color:#bcd6f2; margin:0 0 16px; font-weight:700; }
.cover .sub { font-size:15pt; margin-top:14px; max-width:78%; color:#e7f1fc; }
.cover .meta { position:absolute; bottom:42px; font-size:10pt; color:#bcd6f2; letter-spacing:1px; }
.cover .pill { display:inline-block; background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.4); padding:7px 18px; border-radius:30px; font-size:10.5pt; margin-top:26px; letter-spacing:2px; }
.toc-page { page:toc; padding-top:6mm; }
.toc-head { display:flex; align-items:center; gap:14px; border-bottom:3px solid #185fa5; padding-bottom:12px; margin-bottom:18px; }
.toc-head img { width:46px; height:46px; border-radius:11px; }
.toc-head h2 { color:#0c447c; font-size:20pt; margin:0; border:none; padding:0; background:none; }
.toc-item { display:flex; justify-content:space-between; align-items:center; padding:7px 4px; border-bottom:1px solid #e3e9f2; font-size:11pt; }
.toc-item .num { color:#185fa5; font-weight:800; width:26px; }
.toc-item .ttl { flex:1; padding-left:6px; font-weight:600; color:#27313f; }
h1 { color:#0c447c; font-size:21pt; margin:0 0 4px; }
h2 { background:#185fa5; color:#fff; font-size:15.5pt; font-weight:700; padding:9px 14px; border-radius:8px; margin:26px 0 14px; break-after:avoid; }
h2:first-of-type { margin-top:2px; }
h3 { color:#0c447c; font-size:13pt; margin:20px 0 6px; padding-bottom:5px; border-bottom:2px solid #d8e4f3; break-after:avoid; }
h4 { color:#185fa5; font-size:11.4pt; margin:15px 0 4px; break-after:avoid; }
p { margin:7px 0; }
ul, ol { margin:6px 0 10px; padding-left:20px; }
li { margin:3px 0; }
strong { color:#0c447c; }
em { color:#5f5e5a; }
a { color:#185fa5; }
code { background:#eef3fb; color:#0c447c; padding:1px 5px; border-radius:4px; font-size:9.2pt; }
hr { border:none; border-top:1px solid #e3e9f2; margin:18px 0; }
table { width:100%; border-collapse:collapse; margin:12px 0 16px; font-size:9.6pt; break-inside:avoid; }
th { background:#0c447c; color:#fff; text-align:left; padding:8px 10px; font-weight:700; }
td { padding:7px 10px; border-bottom:1px solid #e3e9f2; vertical-align:top; }
tr:nth-child(even) td { background:#f4f8fd; }
.callout { border-radius:8px; padding:11px 14px; margin:13px 0; font-size:10pt; break-inside:avoid; }
.callout p { margin:3px 0; }
.callout .lbl { font-weight:800; text-transform:uppercase; letter-spacing:1px; font-size:8.6pt; display:block; margin-bottom:3px; }
.note { background:#e6f1fb; border-left:5px solid #185fa5; } .note .lbl{ color:#185fa5; }
.section { break-before:page; } .section:first-of-type { break-before:avoid; }
.dot { font-size:9.5pt; vertical-align:middle; }
"""

COVER = """
<div class="cover">
  <img class="logo" src="data:image/jpeg;base64,%(logo)s"/>
  <p class="kicker">Bad Golf</p>
  <h1>%(title)s</h1>
  <p class="sub">%(sub)s</p>
  <div class="pill">%(build)s &nbsp;&bull;&nbsp; %(date)s</div>
  <div class="meta">%(footer)s</div>
</div>"""

def wrap_sections(html):
    parts = re.split(r'(?=<h2)', html)
    return "".join('<div class="section">'+p+'</div>' if p.strip().startswith("<h2") else p for p in parts)
def callouts(html):
    # A paragraph that is ENTIRELY italic becomes a note callout.
    #
    # The guard matters: the old pattern was <p><em>(.*?)</em></p> with re.S, so a
    # paragraph that merely STARTED with an em ("<p><em>Note:</em> and then more
    # text</p>") matched from that <p><em> forward to the next </em></p> anywhere
    # later in the document -- swallowing whole sections into one callout and
    # leaving stray <em> tags that italicised every page after it. Requiring the
    # captured span to contain no paragraph break keeps the match inside one <p>.
    return re.sub(r'<p><em>((?:(?!</?p>).)*?)</em></p>',
                  r'<div class="callout note"><span class="lbl">Note</span><p>\1</p></div>', html, flags=re.S)
def build_toc(md_text):
    items = re.findall(r'^##\s+(.+)$', md_text, flags=re.M)
    return "".join(f'<div class="toc-item"><span class="num">{n:02d}</span><span class="ttl">{t.strip()}</span></div>'
                   for n, t in enumerate(items, 1))
def make_doc(md_text, title, sub, footer, outfile, doctitle):
    body = wrap_sections(callouts(to_html(md_text)))
    css = CSS.replace("__DOCTITLE__", doctitle).replace("__BUILD__", BUILD)
    cover = COVER % {"logo": logo_b64, "title": title, "sub": sub, "build": BUILD, "date": DATE, "footer": footer}
    toc = ('<div class="toc-page"><div class="toc-head">'
           f'<img src="data:image/jpeg;base64,{logo_b64}"/><h2>Contents</h2></div>'
           f'<div>{build_toc(md_text)}</div></div>')
    html = f"<html><head><meta charset='utf-8'><style>{css}</style></head><body>{cover}{toc}<div>{body}</div></body></html>"
    HTML(string=html).write_pdf(outfile); print("wrote", outfile)

os.makedirs(OUT_DIR, exist_ok=True)
make_doc(PLAYER_MD, "Player Guide",
         "Every feature in the Bad Golf app - and exactly how to use it. Your complete field manual from first sign-in to the final standings.",
         "Complete Player Documentation", os.path.join(OUT_DIR, "Bad_Golf_Player_Guide.pdf"), "Player Guide")
make_doc(ADMIN_MD, "Admin Guide",
         "The complete admin toolkit - course mapping, the Guided Verify hub, ratings & pars editors, user management, analytics, and every back-office tool.",
         "Admin & Course-Management Documentation", os.path.join(OUT_DIR, "Bad_Golf_Admin_Guide.pdf"), "Admin Guide")
print("DONE - build", BUILD, "->", OUT_DIR)
