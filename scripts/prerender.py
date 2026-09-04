# -*- coding: utf-8 -*-
"""Write the content into the HTML, so the pages read without JavaScript.

The site draws itself from JSON in the browser. That is fine for a visitor and
useless for anyone who arrives without JavaScript: a crawler, an archiver, a
funder's PDF exporter, a curator on a locked-down machine. Measured before this
existed, About returned 154 characters of text and Press returned 90. No
project names, no CV, no coverage.

So the build now fills the same mount points the script fills, with plain
semantic markup. When the script runs it replaces all of it, exactly as
before, so nothing changes for a normal visitor; this is only what is there
first. The markup is deliberately simpler than the rendered version, because
its job is to be READ, not to look like the site.

Run after build_site_data.py. It is idempotent: each block is written between
markers and rewritten wholesale on the next run.
"""
import json, os, re, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
esc = lambda s: html.escape(str(s or ""))

def load(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return json.load(fh)

def fill(page, elem_id, inner):
    """Replace the contents of <tag id="elem_id"> ... </tag> in page."""
    path = os.path.join(ROOT, page)
    with open(path, encoding="utf-8") as fh:
        s = fh.read()
    # the opening tag, whatever element and attributes it carries
    m = re.search(r'<(\w+)([^>]*\bid="%s"[^>]*)>' % re.escape(elem_id), s)
    if not m:
        return False
    tag, attrs = m.group(1), m.group(2)
    start = m.end()
    # find the matching close, allowing nesting of the same tag
    depth, i = 1, start
    open_re = re.compile(r'<%s\b' % tag, re.I)
    close_re = re.compile(r'</%s>' % tag, re.I)
    while depth and i < len(s):
        o = open_re.search(s, i); c = close_re.search(s, i)
        if not c: return False
        if o and o.start() < c.start():
            depth += 1; i = o.end()
        else:
            depth -= 1; i = c.end()
            if not depth: end = c.start()
    # a mount that was hidden must not stay hidden once it has content
    attrs = attrs.replace(" hidden", "")
    new = s[:m.start()] + "<%s%s>" % (tag, attrs) + inner + s[end:]
    if new != s:
        with open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(new)
    return True


def main():
    site = load("data/site.json")
    projects = [p for p in load("data/projects.json")["projects"] if not p.get("hidden")]
    press = load("data/press.json")
    press_items = press.get("items") if isinstance(press, dict) else press
    done = []

    def card(p):
        sub = " · ".join(x for x in (p.get("year"), p.get("category")) if x)
        return ('<a class="card" href="project.html?p=%s"><span class="card-title">%s</span>'
                '<span class="card-cat">%s</span></a>'
                % (esc(p["slug"]), esc(p.get("title")), esc(sub)))

    # home: the six featured works
    if fill("index.html", "featured-grid", "".join(card(p) for p in projects[:6])):
        done.append("index.html featured works")

    # work: every visible project
    if fill("work.html", "work-grid", "".join(card(p) for p in projects)):
        done.append("work.html %d projects" % len(projects))

    # press: outlet, date, headline
    rows = []
    for it in (press_items or []):
        bits = " · ".join(x for x in (it.get("outlet"), it.get("date")) if x)
        title = esc(it.get("title") or it.get("quote") or "")
        url = it.get("url")
        head = '<a href="%s">%s</a>' % (esc(url), title) if url else title
        rows.append('<li><span class="press-meta">%s</span> %s</li>' % (esc(bits), head))
    if rows and fill("press.html", "press-list", "".join(rows)):
        done.append("press.html %d items" % len(rows))

    # about: the bio, and the CV as a real list
    bio = "".join("<p>%s</p>" % esc(l.strip())
                  for l in (site.get("about") or "").split("\n") if l.strip())
    if bio and fill("about.html", "about-bio", bio):
        done.append("about.html bio")

    cv = []
    for r in (site.get("cv") or []):
        line = ", ".join(x for x in (r.get("title"), r.get("venue"), r.get("location")) if x)
        cv.append("<li><span>%s</span> <span>%s</span> <span>%s</span></li>"
                  % (esc(r.get("year")), esc(r.get("kind") or "Work"), esc(line)))
    if cv and fill("about.html", "cv-list", "".join(cv)):
        done.append("about.html %d CV rows" % len(cv))

    print("prerender: " + "; ".join(done))


if __name__ == "__main__":
    main()
