#!/usr/bin/env python3
"""
Combine the per-project files in data/projects/*.json into the single
data/projects.json that the website reads at runtime.

The back office (CMS) edits one file per project (so it can group them by
year in folders). This script stitches them back into the flat file the
site loads. It runs automatically on every deploy (see netlify.toml) and
can also be run locally:  python scripts/build_site_data.py
"""
import json
import glob
import os
import subprocess

try:
    from PIL import Image
except ImportError:  # the site still builds without Pillow, just without sizes
    Image = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "data", "projects")
OUT = os.path.join(ROOT, "data", "projects.json")

# ffmpeg for the hover previews; the site still builds without it
FFMPEG = os.path.join(
    os.path.expanduser("~"), "AppData", "Local", "Programs", "Python", "Python311",
    "Lib", "site-packages", "imageio_ffmpeg", "binaries", "ffmpeg-win-x86_64-v7.1.exe")
if not os.path.exists(FFMPEG):
    FFMPEG = None



# Which cover each thumb was cut from, so a changed cover invalidates it.
THUMB_SRC_PATH = os.path.join(ROOT, "media", "thumbs", "sources.json")
try:
    with open(THUMB_SRC_PATH, encoding="utf-8") as fh:
        THUMB_SRC = json.load(fh)
except Exception:
    THUMB_SRC = {}

def main():
    files = sorted(glob.glob(os.path.join(SRC_DIR, "*.json")))
    projects = []
    for f in files:
        with open(f, encoding="utf-8") as fh:
            p = json.load(fh)
        # derive slug from filename if missing
        p.setdefault("slug", os.path.splitext(os.path.basename(f))[0])
        # The CMS stores uploaded media as "/media/..." (leading slash);
        # the runtime uses relative "media/...". Normalise so both agree.
        if isinstance(p.get("cover"), str):
            p["cover"] = p["cover"].lstrip("/") if p["cover"].startswith("/media/") else p["cover"]
        for key in ("images", "videos"):
            if isinstance(p.get(key), list):
                p[key] = [
                    (v.lstrip("/") if isinstance(v, str) and v.startswith("/media/") else v)
                    for v in p[key]
                ]
        # A small copy of the cover for the grids. The tiles show at ~200 to
        # 600px, and shipping the full 2200px cover for that made the first
        # load slow and the pictures pop in at random. Rebuilt only when the
        # cover is newer than the thumb.
        if Image is not None and isinstance(p.get("cover"), str) and p["cover"] and not p["cover"].startswith("http"):
            src = os.path.join(ROOT, p["cover"].replace("/", os.sep))
            if os.path.exists(src):
                os.makedirs(os.path.join(ROOT, "media", "thumbs"), exist_ok=True)
                rel_thumb = "media/thumbs/%s-cover.jpg" % p["slug"]
                dst = os.path.join(ROOT, rel_thumb.replace("/", os.sep))
                # Rebuild when the cover file is newer OR when the cover has
                # been pointed at a DIFFERENT file. Comparing timestamps alone
                # was not enough: switching buy-or-burn's cover from the strip
                # to the brick-wall photo left the old 4:1 strip thumb in place
                # for good, because the newly chosen file was older than the
                # thumb built from the previous one. So the source path is
                # recorded beside the thumbs and checked too.
                stale = (not os.path.exists(dst)
                         or os.path.getmtime(dst) < os.path.getmtime(src)
                         or THUMB_SRC.get(rel_thumb) != p["cover"])
                if stale:
                    with Image.open(src) as im:
                        im = im.convert("RGB")
                        im.thumbnail((640, 640))
                        im.save(dst, "JPEG", quality=78, optimize=True)
                THUMB_SRC[rel_thumb] = p["cover"]
                p["coverThumb"] = rel_thumb

        # A short square preview of the project's film, played when the cover
        # is hovered in a grid. Six seconds from just past the opening, cropped
        # to a square, 480px, silent, ~half a megabyte. Only local films; only
        # rebuilt when the film is newer than the clip.
        vids = [v for v in (p.get("videos") or []) if isinstance(v, str) and not v.startswith("http")]
        if FFMPEG and vids:
            src = os.path.join(ROOT, vids[0].replace("/", os.sep))
            if os.path.exists(src):
                os.makedirs(os.path.join(ROOT, "media", "thumbs"), exist_ok=True)
                rel_prev = "media/thumbs/%s-hover.mp4" % p["slug"]
                dst = os.path.join(ROOT, rel_prev.replace("/", os.sep))
                if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
                    # hoverStart: the second the clip starts at, chosen per film
                    # to match the cover picture; 3 when nothing better is known
                    r = subprocess.run(
                        [FFMPEG, "-hide_banner", "-loglevel", "error", "-y",
                         "-ss", str(p.get("hoverStart", 3)), "-t", "6", "-i", src,
                         "-vf", "crop='min(iw,ih)':'min(iw,ih)',scale=480:480",
                         "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
                         "-pix_fmt", "yuv420p", "-movflags", "+faststart", dst],
                        capture_output=True, text=True, encoding="utf-8", errors="replace")
                    if r.returncode:
                        print("  hover preview failed:", p["slug"], r.stderr.strip()[:120])
                if os.path.exists(dst):
                    p["hoverPreview"] = rel_prev
        # A clip can also exist without a local film: for YouTube/Vimeo-only
        # projects the clip is cut once from a downloaded copy and kept.
        if "hoverPreview" not in p:
            rel_prev = "media/thumbs/%s-hover.mp4" % p["slug"]
            if os.path.exists(os.path.join(ROOT, rel_prev.replace("/", os.sep))):
                p["hoverPreview"] = rel_prev

        # Record every picture's proportions here, once, so the page can lay the
        # gallery out without downloading a thing. Without this the browser has
        # to fetch every full-size picture before it can draw a single row.
        if Image is not None:
            sizes = {}
            for rel in list(p.get("images") or []) + ([p["cover"]] if p.get("cover") else []):
                if not isinstance(rel, str) or rel.startswith("http"):
                    continue
                path = os.path.join(ROOT, rel.replace("/", os.sep))
                if not os.path.exists(path):
                    continue
                try:
                    with Image.open(path) as im:
                        sizes[rel] = list(im.size)
                except Exception:
                    pass
            if sizes:
                p["sizes"] = sizes

        projects.append(p)

    # Preserve the curated site order via the hidden "order" field;
    # anything without one (e.g. a brand-new project) falls to the end,
    # newest year first.
    def sort_key(p):
        has_order = "order" in p and p["order"] is not None
        order = p["order"] if has_order else 10_000
        # secondary: newer year first for un-ordered new entries
        try:
            year = -int(str(p.get("year", "0"))[:4])
        except ValueError:
            year = 0
        return (order, year)

    projects.sort(key=sort_key)

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({"projects": projects}, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    # Remember which cover each thumb was cut from, so the next run can tell a
    # changed cover from an unchanged one.
    try:
        os.makedirs(os.path.dirname(THUMB_SRC_PATH), exist_ok=True)
        with open(THUMB_SRC_PATH, "w", encoding="utf-8") as fh:
            json.dump(THUMB_SRC, fh, indent=2, sort_keys=True)
            fh.write(chr(10))
    except Exception as e:
        print("  could not record thumb sources:", e)

    print(f"build_site_data: combined {len(projects)} projects -> data/projects.json")


if __name__ == "__main__":
    main()
