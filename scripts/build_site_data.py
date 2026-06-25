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

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "data", "projects")
OUT = os.path.join(ROOT, "data", "projects.json")


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

    print(f"build_site_data: combined {len(projects)} projects -> data/projects.json")


if __name__ == "__main__":
    main()
