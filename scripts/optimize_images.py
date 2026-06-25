#!/usr/bin/env python3
"""Resize + recompress images in media/ for the web. Re-runnable & idempotent
(skips files already small enough). PNGs of photos are converted to JPEG."""

import sys
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "media"
MAX_W = 2000          # max width in px (retina-friendly for full-bleed)
JPEG_Q = 82
EXICT = {".jpg", ".jpeg", ".png", ".webp"}

def has_alpha(im):
    return im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)

def process(path: Path):
    try:
        im = Image.open(path)
        im = ImageOps.exif_transpose(im)
    except Exception as e:
        print(f"  ! skip {path.name}: {e}")
        return None
    w, h = im.size
    if w > MAX_W:
        im = im.resize((MAX_W, round(h * MAX_W / w)), Image.LANCZOS)

    # photos as JPEG (keep PNG only when transparency is present)
    keep_png = path.suffix.lower() == ".png" and has_alpha(im)
    if keep_png:
        out = path
        im.save(out, "PNG", optimize=True)
    else:
        out = path.with_suffix(".jpg")
        im.convert("RGB").save(out, "JPEG", quality=JPEG_Q, optimize=True, progressive=True)
        if out != path:
            path.unlink()  # remove the original .png/.webp
    return out

def main():
    files = [p for p in MEDIA.rglob("*") if p.suffix.lower() in EXICT]
    before = sum(p.stat().st_size for p in files)
    renames = {}  # old web path -> new web path
    for p in sorted(files):
        old_rel = p.relative_to(ROOT).as_posix()
        out = process(p)
        if out is None:
            continue
        new_rel = out.relative_to(ROOT).as_posix()
        if new_rel != old_rel:
            renames[old_rel] = new_rel
    after = sum(p.stat().st_size for p in MEDIA.rglob("*") if p.suffix.lower() in EXICT)
    print(f"\nSize: {before/1e6:.1f} MB -> {after/1e6:.1f} MB")
    if renames:
        print(f"{len(renames)} files changed extension (.png/.webp -> .jpg)")
        # write the rename map so we can patch projects.json
        import json
        (ROOT / "scripts" / "_renames.json").write_text(json.dumps(renames, indent=2))

if __name__ == "__main__":
    main()
