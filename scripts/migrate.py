#!/usr/bin/env python3
"""One-off migration: pull projects (text + images) from the old Framer site
(jacoschilp.nl) into data/projects.json + media/projects/<slug>/.
Re-runnable. Output text is best-effort; refine in the /admin panel."""

import json, os, re, sys, urllib.request, urllib.error
from pathlib import Path
from PIL import Image

MIN_DIM = 500  # px: images smaller than this on the short side are logos/icons -> skip

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "media" / "projects"
BASE = "https://www.jacoschilp.nl"
UA = {"User-Agent": "Mozilla/5.0 (migration script)"}

# slug -> (display category, featured)   [best guesses; editable in admin]
PLAN = {
    "ka-an":                       ("Installation", True),
    "somnia":                      ("Installation", True),
    "uncloud-transliminal":        ("Live Show",    True),
    "jacobi-kerk-le-guess-who-2022":("Curated",     True),
    "data-utan":                   ("Curated",      False),
    "panorama-utrecht":            ("Installation", False),
    "mapping":                     ("Installation", False),
    "capture-renders":             ("Artwork",      False),
    "uncloud-orbit":               ("Live Show",    False),
    "orbit-festival-uncloud":      ("Live Show",    False),
    "byob-utrecht-citytour":       ("Curated",      False),
    "uncloud-2019":                ("Live Show",    False),
}

CLEAN_SLUG = {  # nicer URL slugs for the new site
    "jacobi-kerk-le-guess-who-2022": "jacobikerk-le-guess-who",
}

# stopwords that mark the start of nav/footer noise in the flattened text
STOP = re.compile(r"\b(Selected works|All projects|Installations|Curated|Home|Menu|"
                  r"Next project|Previous|©|All rights reserved|Made in Framer)\b", re.I)

# a leading role/credit line on the old pages, e.g. "Artist" or "Art Director, Curator, Producer"
ROLE_WORDS = (r"Artist|Art Director|Creative Director|Curator|Producer|Director|"
              r"Light Designer|Designer|Concept|Production|Technical|Performer|Choreographer")
ROLE_PREFIX = re.compile(rf"^((?:{ROLE_WORDS})(?:\s*[,/&+]\s*(?:{ROLE_WORDS}))*)\s+(?=[A-Z])")
TRAILING_NOISE = re.compile(r"\s*\b(back|Next|Previous|Home)\b\s*$", re.I)

def fetch(url, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    return data if binary else data.decode("utf-8", "replace")

def norm(t):
    repl = {"’": "'", "‘": "'", "“": '"', "”": '"',
            "–": "-", "—": "—", "�": "'", " ": " ",
            "&amp;": "&", "&#x27;": "'", "&#39;": "'", "&nbsp;": " "}
    for a, b in repl.items():
        t = t.replace(a, b)
    return re.sub(r"\s+", " ", t).strip()

def text_of(html):
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.S)
    return norm(re.sub(r"<[^>]+>", " ", html))

def og_title(html):
    m = re.search(r'<meta property="og:title" content="([^"]*)"', html)
    t = m.group(1) if m else ""
    return norm(t.replace(" - My Framer Site", ""))

def og_image(html):
    m = re.search(r'<meta property="og:image" content="([^"]*)"', html)
    return m.group(1) if m else ""

def images(html):
    # only /images/ = real content photos. /assets/ = logos & icons (skip).
    urls = re.findall(r'https://framerusercontent\.com/images/[^"\' )]+\.(?:jpg|jpeg|png|webp)', html)
    seen, out = set(), []
    for u in urls:
        if u not in seen:
            seen.add(u); out.append(u)
    return out

def description(html, title):
    t = text_of(html)
    # drop the leading "<title> - My Framer Site <title> <maybe role>"
    t = re.sub(r"^.*?My Framer Site\s*", "", t)
    if title:
        t = re.sub(r"^" + re.escape(title) + r"\s*", "", t)
    # strip a leading year and stray nav words left over before the real text
    t = re.sub(r"^\s*(?:20[0-2]\d)\s*", "", t)
    t = re.sub(r"^\s*(?:Selected|Curated|Installations?|All projects)\s+", "", t)
    # truncate at first nav/footer stopword (keep a minimum body)
    m = STOP.search(t, 80)
    if m:
        t = t[:m.start()].strip()
    # strip trailing nav words (can repeat: "... back Home")
    prev = None
    while prev != t:
        prev = t
        t = TRAILING_NOISE.sub("", t).strip()
    t = t.strip()
    # treat a bare year / near-empty leftover as no description
    if len(t) < 15 or re.fullmatch(r"[\d\s/.-]*", t):
        return ""
    return t

def split_role(desc):
    """Pull a leading role/credit clause off the description, if present."""
    m = ROLE_PREFIX.match(desc)
    if m:
        return m.group(1).strip(), desc[m.end():].strip()
    return "", desc

def download_img(url, dest):
    if dest.exists() and dest.stat().st_size > 0:
        return True
    try:
        data = fetch(url, binary=True)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return True
    except Exception as e:
        print(f"   ! image failed {url}: {e}")
        return False

def ext_of(url):
    e = os.path.splitext(url.split("?")[0])[1].lower()
    return e if e in (".jpg", ".jpeg", ".png", ".webp") else ".jpg"

def main():
    # ---- pass 1: fetch every page, collect image URLs, count cross-page frequency
    pages = {}   # slug -> (old_slug, cat, feat, html, imgs)
    from collections import Counter
    url_freq = Counter()
    for old_slug, (cat, feat) in PLAN.items():
        slug = CLEAN_SLUG.get(old_slug, old_slug)
        try:
            html = fetch(f"{BASE}/{old_slug}")
        except Exception as e:
            print(f"[{old_slug}] ! page failed: {e}"); continue
        imgs = images(html)
        pages[slug] = (old_slug, cat, feat, html, imgs)
        for u in imgs:
            url_freq[u] += 1
    # any image appearing on 2+ project pages is a site-wide template element -> skip
    shared = {u for u, n in url_freq.items() if n > 1}
    if shared:
        print(f"Skipping {len(shared)} shared/template image(s) used across multiple pages\n")

    # ---- pass 2: build each project from its unique, real photos
    projects = []
    for slug, (old_slug, cat, feat, html, imgs) in pages.items():
        print(f"[{old_slug}] -> {slug}")
        imgs = [u for u in imgs if u not in shared]

        title = og_title(html) or slug.replace("-", " ").title()
        # pull a 4-digit year (2000-2029) out of the title; strip it if trailing
        year = ""
        ym = re.search(r"\b(20[0-2]\d)\b", title)
        if ym:
            year = ym.group(1)
            stripped = re.sub(r"\s*\b" + year + r"\b\s*$", "", title).strip()
            if len(stripped.split()) >= 2:  # keep year in title if removing it leaves one bare word
                title = stripped
        role, desc = split_role(description(html, title))

        # download to temp names, then keep only real photos (drop small logos/icons)
        real = []
        for i, url in enumerate(imgs):
            tmp = MEDIA / slug / (f"raw{i:02d}" + ext_of(url))
            if not download_img(url, tmp):
                continue
            try:
                w, h = Image.open(tmp).size
            except Exception:
                w = h = 0
            if min(w, h) >= MIN_DIM:
                real.append(tmp)
            else:
                tmp.unlink(missing_ok=True)  # logo / icon

        # rename kept photos: cover first, then 01, 02, ...
        local = []
        for i, src in enumerate(real):
            name = ("cover" if i == 0 else f"{i:02d}") + src.suffix
            dest = MEDIA / slug / name
            if dest.exists() and dest != src:
                dest.unlink()
            src.rename(dest)
            local.append(f"media/projects/{slug}/{name}")
        print(f"   title={title!r}  photos={len(local)} (of {len(imgs)})  desc={len(desc)} chars")

        projects.append({
            "slug": slug,
            "title": title,
            "year": year,
            "category": cat,
            "featured": feat,
            "role": role,
            "location": "",
            "cover": local[0] if local else "",
            "excerpt": desc[:180],
            "description": desc,
            "images": local[1:],
            "credits": "",
            "link": "",
        })

    out = ROOT / "data" / "projects.json"
    out.write_text(json.dumps({"projects": projects}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote {len(projects)} projects to {out}")

if __name__ == "__main__":
    main()
