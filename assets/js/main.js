/* Jaco Schilp — site logic. No build step; reads /data/*.json at runtime. */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---- paths: works from any folder depth via <body data-root> ---- */
  const ROOT = document.body.getAttribute("data-root") || "";
  const asset = (p) => (p ? ROOT + p : p);

  /* The gallery runs wider than the text column and needs the window's width
     without the scrollbar; 100vw counts the scrollbar and would scroll the page
     sideways. clientWidth is the honest number, so publish it as --vw.

     A ResizeObserver rather than the resize event: the event does not fire for
     every way the layout can change size, and a stale --vw makes the gallery
     overflow. The observer watches the element itself, so it cannot go stale. */
  function trackViewportWidth() {
    const root = document.documentElement;
    const set = () => root.style.setProperty("--vw", root.clientWidth + "px");
    set();
    if ("ResizeObserver" in window) new ResizeObserver(set).observe(root);
    else window.addEventListener("resize", set, { passive: true });
    // a tab opened in the background measures a half-made layout; remeasure
    // the moment it actually faces the user
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") set();
    });
  }

  /* ---- eased scrolling: the sixnfive glide ----
     The wheel no longer jumps the page in steps; it moves a target the page
     glides toward each frame. Because the real scroll position is what eases,
     everything tied to scroll (the scroll-driven appearance) glides with it.
     Touch, keyboard and the scrollbar stay native; reduced motion opts out. */
  function initSmoothScroll() {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let target = window.scrollY;
    let current = window.scrollY;
    let gliding = false;
    const max = () => document.documentElement.scrollHeight - window.innerHeight;
    const loop = () => {
      current += (target - current) * 0.11;
      if (Math.abs(target - current) < 0.5) {
        current = target;
        gliding = false;
      }
      window.scrollTo(0, current);
      if (gliding) requestAnimationFrame(loop);
    };
    window.addEventListener("wheel", (e) => {
      if (e.ctrlKey) return; // pinch-zoom stays native
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      target = Math.max(0, Math.min(max(), target + d));
      if (!gliding) { gliding = true; requestAnimationFrame(loop); }
    }, { passive: false });
    // scrollbar drags, keyboard and anchors move the page without us: resync
    window.addEventListener("scroll", () => {
      if (!gliding) { target = window.scrollY; current = window.scrollY; }
    }, { passive: true });
  }

  async function loadJSON(path) {
    const res = await fetch(asset(path), { cache: "no-cache" });
    if (!res.ok) throw new Error("Failed to load " + path);
    return res.json();
  }

  /* ---- header behaviour ---- */
  function initHeader() {
    const header = $(".site-header");
    const toggle = $(".nav-toggle");
    const links = $(".nav-links");
    if (toggle && links) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.addEventListener("click", () => {
        const open = links.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
      });
      $$(".nav-links a").forEach((a) =>
        a.addEventListener("click", () => links.classList.remove("open"))
      );
    }
    if (header) {
      const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }
  }

  /* ---- scroll reveal ---- */
  function observeReveals(scope = document) {
    const els = $$(".reveal", scope).filter((el) => !el.classList.contains("in"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        // elements arriving in the same beat settle one after another
        let k = 0;
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.style.transitionDelay = Math.min(k++ * 70, 420) + "ms";
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    els.forEach((el) => io.observe(el));
  }

  /* ---- helpers ---- */
  const esc = (s = "") =>
    s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  // Escape + typographic tidy for titles: keep an em dash with the word before it,
  // and glue short words (Le, of, a...) to the next word, so a line never ends on a
  // runt like "Le". Walks tokens, so chained short words are all handled.
  const DASH = /^[—–-]+$/;
  const escTitle = (s = "") => {
    const parts = esc(s).split(/(\s+)/);
    let out = "";
    for (let i = 0; i < parts.length; i++) {
      const tok = parts[i];
      if (!/^\s+$/.test(tok)) { out += tok; continue; }
      const prev = parts[i - 1] || "";
      const next = parts[i + 1] || "";
      const prevLen = prev.replace(/&[a-z]+;|&#\d+;/g, "x").length;
      const glue = next && (DASH.test(next) || (prevLen <= 3 && !DASH.test(prev)));
      out += glue ? " " : tok;
    }
    return out;
  };

  // swap a broken/missing image for the styled text placeholder
  window.__phErr = function (img) {
    const t = img.getAttribute("alt") || "";
    const ph = document.createElement("div");
    ph.className = "ph";
    ph.textContent = t;
    if (img.parentNode) img.parentNode.replaceChild(ph, img);
  };

  function mediaHTML(src, title, tall, wide) {
    const cls = "card-media" + (tall ? " tall" : "");
    if (src) {
      return `<div class="${cls}"><img${wide ? ` class="wide"` : ""} src="${asset(esc(src))}" alt="${esc(title)}" loading="lazy" onerror="window.__phErr(this)"></div>`;
    }
    return `<div class="${cls}"><div class="ph">${esc(title)}</div></div>`;
  }

  /* ---- hover previews: a card with a film plays its square clip on hover ----
     The video element is created on the first hover, so a grid of forty cards
     costs nothing until a cursor actually arrives. Touch screens never see it:
     the still stays, exactly as before. */
  function initHoverPreviews() {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    document.addEventListener("mouseover", (e) => {
      const card = e.target.closest && e.target.closest(".card[data-preview]");
      if (!card || card.contains(e.relatedTarget)) return;
      const media = card.querySelector(".card-media");
      if (!media) return;
      let v = media.querySelector("video");
      if (!v) {
        v = document.createElement("video");
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.className = "card-preview";
        v.src = asset(card.dataset.preview);
        media.appendChild(v);
      }
      v.currentTime = 0;
      v.play().then(() => v.classList.add("on")).catch(() => {});
    });
    document.addEventListener("mouseout", (e) => {
      const card = e.target.closest && e.target.closest(".card[data-preview]");
      if (!card || card.contains(e.relatedTarget)) return;
      const v = card.querySelector("video.card-preview");
      if (v) { v.classList.remove("on"); v.pause(); }
    });
  }

  /* ---- living tiles: on big grids the film plays while its tile is on
     screen, no cursor needed. Phones, save-data and reduced-motion keep
     stills; the tiny one-screen wall keeps its hover behavior instead. */
  function initLivingTiles() {
    if (window.matchMedia("(max-width: 600px)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (navigator.connection && navigator.connection.saveData) return;
    const seen = new WeakSet();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const card = e.target;
        const grid = card.closest("#featured-grid, #work-grid");
        if (!grid || grid.classList.contains("compact")) return;
        let v = card.querySelector("video.card-preview");
        if (e.isIntersecting) {
          if (!v) {
            const media = card.querySelector(".card-media");
            if (!media) return;
            v = document.createElement("video");
            v.muted = true;
            v.loop = true;
            v.playsInline = true;
            v.className = "card-preview";
            v.src = asset(card.dataset.preview);
            media.appendChild(v);
            // start each loop somewhere else, so a wall never pulses in step
            v.addEventListener("loadedmetadata", () => {
              v.currentTime = Math.random() * Math.max(0, v.duration - 0.5);
            }, { once: true });
          }
          v.play().then(() => v.classList.add("on")).catch(() => {});
        } else if (v) {
          v.classList.remove("on");
          v.pause();
        }
      });
    }, { threshold: 0.35 });
    const arm = () => {
      $$(".card[data-preview]").forEach((c) => {
        if (!seen.has(c)) { seen.add(c); io.observe(c); }
      });
    };
    arm();
    new MutationObserver(arm).observe(document.body, { childList: true, subtree: true });
  }

  // A panorama cover (like Buy or Burn's strip) is shown whole in its grid
  // tile, paper above and below; cropping it to a square would keep a fifth.
  const isPanorama = (p) => {
    const d = (p.sizes || {})[p.cover];
    return !!d && d[0] / d[1] > 2.4;
  };

  // A project can sit in more than one category: "categories" wins, "category" is the fallback.
  const catsOf = (p) =>
    (Array.isArray(p.categories) && p.categories.length ? p.categories : [p.category]).filter(Boolean);

  // Lay the gallery out as justified rows: each row is flush on both sides, and
  // inside a row every picture keeps its own proportions at a shared height.
  // flex-grow = aspect ratio does the width math; equal heights follow from it.
  function layoutGallery(el) {
    if (!el) return;
    const imgs = [...el.querySelectorAll("img")];
    if (!imgs.length) return;
    const ratios = imgs.map((im) => {
      const w = +im.getAttribute("width"), h = +im.getAttribute("height");
      if (w && h) return w / h;
      return im.naturalWidth ? im.naturalWidth / im.naturalHeight : 1.5;
    });
    const narrow = window.matchMedia("(max-width: 600px)").matches;
    // Row targets in "width units" (a landscape ≈ 1.5, a portrait ≈ 0.7).
    // Alternating between them gives a rhythm of two-picture and three-picture
    // rows instead of a uniform grid. Phones get single wider rows.
    // Pairs are the rule: calm and even beats a varied rhythm. A third picture
    // only joins when the pair is narrow enough that three genuinely fit
    // better than two. "galleryRows": 2 in a project pins strict pairs.
    const pinned = parseInt(el.dataset.rows || "", 10) || 0;
    const rows = [];
    let row = [], sum = 0;
    // Panorama strips run alone, and so do marked graphics: a poster only
    // earns its place when it is big enough to read.
    const solo = (i) => ratios[i] > 2.4 || !!imgs[i].dataset.nocrop;
    ratios.forEach((r, i) => {
      if (solo(i)) {
        if (row.length) { rows.push(row); row = []; sum = 0; }
        rows.push([i]);
        return;
      }
      // Desktop rows run denser since the pages went wide: mostly three
      // pictures, four when they are narrow, so a big gallery stays a page
      // and not a corridor. Phones and pinned-pair projects keep pairs.
      const dense = window.matchMedia("(min-width: 1200px)").matches;
      const full = narrow || pinned === 2
        ? row.length >= 2
        : dense
        ? row.length >= 4 || (row.length >= 3 && sum >= 3.6)
        : row.length >= 3 || (row.length === 2 && sum >= 2.4);
      if (row.length && full) { rows.push(row); row = []; sum = 0; }
      row.push(i); sum += r;
    });
    if (row.length) rows.push(row);
    // No ordinary picture stands alone: a stranded single joins the nearest
    // ordinary row, looking past any solo rows in between.
    for (let k = rows.length - 1; k >= 0; k--) {
      if (rows[k].length !== 1 || solo(rows[k][0])) continue;
      let home = null;
      for (let d = 1; d < rows.length && !home; d++) {
        for (const j of [k - d, k + d]) {
          const cand = rows[j];
          if (cand && cand.length && cand.length < 3 && !solo(cand[0])) { home = cand; break; }
        }
      }
      if (home) { home.push(rows[k][0]); rows.splice(k, 1); }
    }
    // Rows may crop at most 10% to sit closer to a shared height. Each row's
    // ratios are nudged toward the median row, clamped to 0.9..1.1, and the
    // nudge is applied through aspect-ratio + object-fit so the crop is even.
    const sums = rows.map((list) => list.reduce((a, i) => a + ratios[i], 0));
    const perImg = rows.map((list, k) => sums[k] / list.length);
    const median = [...perImg].sort((a, b) => a - b)[Math.floor(perImg.length / 2)];
    el.textContent = "";
    rows.forEach((list, k) => {
      const soloRow = list.length === 1 && solo(list[0]);
      // A poster or graphic in the row means the whole row keeps true proportions.
      const hasNocrop = list.some((i) => imgs[i].dataset.nocrop);
      const f = hasNocrop ? 1 : Math.min(1.1, Math.max(0.9, (median * list.length) / sums[k]));
      // In a pair, nudge both pictures toward equal widths (within the same 10%)
      // so the middle line runs straight down the page wherever it can.
      const each = list.map(() => f);
      if (list.length === 2 && !hasNocrop) {
        const [a, b] = list.map((i) => ratios[i]);
        // Meet in the middle: enough to make the pair equal, capped at 10% each.
        const g = Math.min(1.1, Math.sqrt(Math.max(a, b) / Math.min(a, b)));
        each[0] = a < b ? g : 1 / g;
        each[1] = a < b ? 1 / g : g;
      }
      const d = document.createElement("div");
      d.className = soloRow ? "grow solo" : "grow";
      list.forEach((i, n) => {
        const shown = ratios[i] * each[n];
        imgs[i].style.flexGrow = shown.toFixed(4);
        if (Math.abs(each[n] - 1) > 0.01) {
          imgs[i].style.aspectRatio = shown.toFixed(4);
          imgs[i].style.objectFit = "cover";
        } else {
          imgs[i].style.aspectRatio = "";
          imgs[i].style.objectFit = "";
        }
        d.appendChild(imgs[i]);
      });
      el.appendChild(d);
    });
  }

  // Embed a video from a Vimeo/YouTube URL or a local/hosted file path.
  function videoEmbedHTML(src, poster) {
    if (!src) return "";
    const s = String(src).trim();
    let m = s.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) {
      return `<div class="project-video"><iframe src="https://player.vimeo.com/video/${m[1]}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
    }
    if (/player\.vimeo\.com/.test(s)) {
      return `<div class="project-video"><iframe src="${esc(s)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
    }
    m = s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
    if (m) {
      return `<div class="project-video"><iframe src="https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&modestbranding=1" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
    }
    m = s.match(/instagram\.com\/(?:reel|p|tv)\/([\w-]+)/);
    if (m) {
      return `<div class="project-video-ig"><iframe src="https://www.instagram.com/reel/${m[1]}/embed/" scrolling="no" allowtransparency="true" loading="lazy"></iframe></div>`;
    }
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(s)) {
      // Every hosted film has a poster frame taken from itself, sitting beside it
      // as the same name with a .jpg extension. Without a poster the browser
      // paints a stale frame from whatever it decoded last, which looks like the
      // previous project's film; with the project cover it was the wrong shape.
      const pf = ` poster="${asset(esc(s.replace(/\.(mp4|webm|mov|m4v)(\?|$)/i, ".jpg")))}"`;
      return `<video class="project-video-file" controls preload="none" playsinline${pf} src="${asset(esc(s))}"></video>`;
    }
    return "";
  }

  function cardHTML(p, i) {
    const sub = [p.year, p.category].filter(Boolean).join(" · ");
    return `
      <a class="card reveal${isPanorama(p) ? " pan" : ""}"${p.hoverPreview ? ` data-preview="${esc(p.hoverPreview)}"` : ""} href="${ROOT}project.html?p=${encodeURIComponent(p.slug)}">
        ${mediaHTML(p.coverThumb || p.cover, p.title, false, isPanorama(p))}
        <div class="card-meta">
          <span class="card-title">${escTitle(p.title)}</span>
          <span class="card-cat">${esc(sub)}</span>
        </div>
      </a>`;
  }

  /* ---- home: interactive point cloud in the hero ---- */
  function initHeroPoints() {
    const canvas = $("#hero-points");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, pts = [];
    let dot; // pre-rendered round-dot sprite (fast to draw in bulk)
    const mouse = { x: -9999, y: -9999 };

    // organic granular nebula — soft 3D dust lobes that rotate slowly
    // (after the TouchDesigner renders: dense charcoal cores dissolving into stray grain)
    function build() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#f7f6f4"; ctx.fillRect(0, 0, W, H); // prime for trails

      // tiny round-dot sprite (drawImage is much faster than arc() in bulk)
      dot = document.createElement("canvas");
      dot.width = dot.height = 16;
      const dctx = dot.getContext("2d");
      dctx.fillStyle = "#141414";
      dctx.beginPath(); dctx.arc(8, 8, 7, 0, Math.PI * 2); dctx.fill();

      const mobile = W < 600;
      const N = mobile ? 3800 : 9000;
      // overlapping 3D lobes give the cloud its multi-form organic shape
      const K = 5;
      const LOBES = [];
      for (let i = 0; i < K; i++) {
        const za = Math.random() * 2 - 1, aa = Math.random() * Math.PI * 2;
        const rz = Math.sqrt(1 - za * za);
        const d = 0.15 + Math.random() * 0.5;
        LOBES.push({
          x: rz * Math.cos(aa) * d, y: za * d * 0.8, z: rz * Math.sin(aa) * d,
          r: 0.35 + Math.random() * 0.4,
          ph: Math.random() * Math.PI * 2,
        });
      }
      pts = [];
      for (let i = 0; i < N; i++) {
        const L = LOBES[i % K];
        const z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
        const rxz = Math.sqrt(1 - z * z);
        let rad = L.r * Math.pow(Math.random(), 0.45); // dense core, soft falloff
        let edge = 1 - rad / (L.r * 1.05);
        if (Math.random() < 0.10) { rad *= 1.35 + Math.random() * 0.5; edge = 0.06; } // stray dust
        pts.push({
          bcx: L.x, bcy: L.y, bcz: L.z,
          ux: rxz * Math.cos(a), uy: z, uz: rxz * Math.sin(a),
          rad: rad,
          w: 0.12 + 0.8 * Math.pow(Math.max(0, edge), 1.3),
          s: 0.7 + Math.random() * 0.9,
          p: L.ph + Math.random() * 0.8,
          ox: 0, oy: 0, // magnetic offset (springs back on release)
        });
      }
    }

    function draw(t) {
      // fade the previous frame instead of clearing -> motion trails
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(247, 246, 244, 0.09)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#141414";
      const R = 210;
      const TAU = Math.PI * 2;
      // slow 3D rotation of the whole field
      const ay = reduced ? 0.6 : t * 0.00006;
      const axr = reduced ? -0.25 : 0.30 * Math.sin(t * 0.00003 + 1.0);
      const cyr = Math.cos(ay), syr = Math.sin(ay);
      const cxr = Math.cos(axr), sxr = Math.sin(axr);
      const SR = Math.min(W, H) * (W < 600 ? 0.62 : 0.58); // cloud scale
      const CX = W * 0.58, CY = H * 0.47;                  // cloud centre
      const F = SR * 3.4;                                  // perspective depth
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        const breathe = reduced ? 1 : 1 + 0.05 * Math.sin(t * 0.0004 + pt.p);
        const rr = pt.rad * breathe * SR;
        const X = pt.bcx * SR + pt.ux * rr, Y = pt.bcy * SR + pt.uy * rr, Z = pt.bcz * SR + pt.uz * rr;
        const X1 = X * cyr + Z * syr, Z1 = -X * syr + Z * cyr;
        const Y1 = Y * cxr - Z1 * sxr, Z2 = Y * sxr + Z1 * cxr;
        const persp = F / (F + Z2);
        let x = CX + X1 * persp;
        let y = CY + Y1 * persp;
        // magnetic cursor: points are pulled toward the pointer, released with a soft spring
        const dx = mouse.x - x, dy = mouse.y - y;
        const d2 = dx * dx + dy * dy;
        let k = 0;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1;
          k = 1 - d / R;
        }
        const ease = k > 0 ? 0.16 : 0.055; // grab quickly, let go slowly
        pt.ox += (dx * k - pt.ox) * ease;
        pt.oy += (dy * k - pt.oy) * ease;
        x += pt.ox; y += pt.oy;
        const pull = Math.min(1, (Math.abs(pt.ox) + Math.abs(pt.oy)) / 60);
        const depth = 0.55 + 0.45 * Math.max(0, Math.min(1, (1 - Z2 / SR) * 0.5)); // nearer = darker
        ctx.globalAlpha = Math.min(0.72, pt.w * 0.36 * depth + pull * 0.35);
        const pr = pt.s * persp;
        ctx.drawImage(dot, x - pr, y - pr, pr * 2, pr * 2);
      }
      ctx.globalAlpha = 1;
    }

    let raf;
    function loop(t) {
      draw(t);
      raf = requestAnimationFrame(loop);
    }

    window.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    });
    window.addEventListener("pointerout", (e) => {
      if (!e.relatedTarget) { mouse.x = -9999; mouse.y = -9999; }
    });

    let rto;
    window.addEventListener("resize", () => {
      clearTimeout(rto);
      rto = setTimeout(build, 150);
    });

    build();
    if (reduced) {
      draw(0); // static field; still redraw on pointer interaction
      window.addEventListener("pointermove", () => draw(0));
    } else {
      raf = requestAnimationFrame(loop);
    }
  }

  /* ---- home: featured works ---- */
  async function initHome() {
    const mount = $("#featured-grid");
    if (!mount) return;
    const { projects } = await loadJSON("data/projects.json");
    const feat = projects.filter((p) => p.featured);
    // The home selection: nine featured works in curated order. Desktop shows
    // the first six as one row; a phone shows all nine as a 3x3 grid, the way
    // an Instagram profile opens. The CSS hides 7 to 9 on desktop.
    const list = (feat.length ? feat : projects).slice(0, 9);
    mount.innerHTML = list.map(cardHTML).join("");
    observeReveals(mount);
  }

  /* ---- work index: filterable grid ---- */
  async function initWork() {
    const mount = $("#work-grid");
    if (!mount) return;
    const filtersEl = $("#filters");
    const { projects } = await loadJSON("data/projects.json");

    const cats = ["All", ...Array.from(new Set(projects.flatMap(catsOf)))];
    if (filtersEl) {
      filtersEl.innerHTML = cats
        .map(
          (c, i) =>
            `<button class="filter" data-cat="${esc(c)}" aria-pressed="${i === 0}">${esc(c)}</button>`
        )
        .join("");
    }

    // The grid sizes its tiles so the whole set ends within one screen, no
    // scrolling: fewer projects in a filter means bigger tiles, the full list
    // means more and smaller ones. Tried column count by column count against
    // the real layout, captions included, taking the fewest columns (so the
    // biggest tiles) that still fit. White space left at the bottom is fine.
    // Desktop only; a phone scrolls its columns as before.
    // Two honest modes. "One screen" (default, the Compact pill pressed):
    // the whole set fits above the fold, captions only when they have room.
    // Unpressed: a comfortable captioned grid that simply scrolls.
    let oneScreen = true;
    const fit = () => {
      if (window.matchMedia("(max-width: 1000px)").matches) {
        mount.style.gridTemplateColumns = "";
        mount.classList.remove("compact");
        return;
      }
      if (!oneScreen) {
        mount.classList.remove("compact");
        mount.style.gridTemplateColumns = "";
        return;
      }
      const n = mount.children.length;
      if (!n) return;
      // 24px of slack: a layout that only just fits would flip its column
      // count whenever a font swap or rounding nudges it a pixel either way
      const fits = () =>
        mount.getBoundingClientRect().bottom + window.scrollY <= window.innerHeight - 24;
      // First with captions; when even small tiles cannot carry them, the wall
      // drops the captions and shows covers alone (titles come back on hover).
      mount.classList.remove("compact");
      for (let cols = 2; cols <= 12; cols++) {
        mount.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        if (fits()) return;
      }
      mount.classList.add("compact");
      for (let cols = 6; cols <= 24; cols++) {
        mount.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        if (fits()) return;
      }
    };

    // One list feeds the wall: the active category, narrowed by the search
    // over title, venue, year, role and category words.
    const searchEl = $("#work-search");
    const countEl = $("#work-count");
    let activeCat = "All";
    const render = () => {
      const q = ((searchEl && searchEl.value) || "").trim().toLowerCase();
      let list = activeCat === "All" ? projects : projects.filter((p) => catsOf(p).includes(activeCat));
      if (q) {
        list = list.filter((p) =>
          [p.title, p.location, p.year, p.role, catsOf(p).join(" ")]
            .filter(Boolean).join(" ").toLowerCase().includes(q));
      }
      mount.innerHTML = list.map(cardHTML).join("");
      if (countEl) countEl.textContent = `${list.length} / ${projects.length} shown`;
      observeReveals(mount);
      fit();
    };
    render();
    window.addEventListener("resize", fit, { passive: true });
    if (searchEl) searchEl.addEventListener("input", render);
    const compactBtn = $("#work-compact");
    if (compactBtn) {
      compactBtn.setAttribute("aria-pressed", "true");
      compactBtn.addEventListener("click", () => {
        oneScreen = !oneScreen;
        compactBtn.setAttribute("aria-pressed", String(oneScreen));
        fit();
      });
    }

    if (filtersEl) {
      filtersEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".filter");
        if (!btn) return;
        $$(".filter", filtersEl).forEach((b) => b.setAttribute("aria-pressed", "false"));
        btn.setAttribute("aria-pressed", "true");
        activeCat = btn.dataset.cat;
        render();
      });
    }
  }

  /* ---- project detail ---- */
  async function initProject() {
    const mount = $("#project");
    if (!mount) return;
    const { projects } = await loadJSON("data/projects.json");
    const slug = new URLSearchParams(location.search).get("p");
    const idx = projects.findIndex((p) => p.slug === slug);
    const p = projects[idx];

    if (!p) {
      mount.innerHTML = `<div class="wrap"><p class="lead">Project not found.</p><p><a href="${ROOT}work.html">← Back to work</a></p></div>`;
      return;
    }
    document.title = `${p.title} · Studio Schilp`;

    const fact = (label, val) =>
      val ? `<div><div class="fact-label">${esc(label)}</div><div class="fact-value">${esc(val)}</div></div>` : "";

    // Lines starting with "> " form the artist statement. When present, the
    // description renders two-column: info left, statement right (italic).
    const lines = (p.description || "").split("\n").filter((l) => l.trim());
    const stHTML = lines
      .filter((l) => l.trim().startsWith("> "))
      .map((l) => `<p class="statement">${esc(l.trim().slice(2))}</p>`)
      .join("");
    const infoHTML = lines
      .filter((l) => !l.trim().startsWith("> "))
      .map((l) => `<p>${esc(l.trim())}</p>`)
      .join("");
    const creditsHTML = p.credits ? `<p style="color:var(--muted);font-size:0.95rem">${esc(p.credits)}</p>` : "";
    const bodyHTML = stHTML
      ? `<div class="project-body has-statement">
          <div class="project-info">${infoHTML}${creditsHTML}</div>
          <aside class="project-statement">${stHTML}</aside>
        </div>`
      : `<div class="project-body">${infoHTML}${creditsHTML}</div>`;

    // Pictures listed in a project's "nocrop" (posters, graphic work) always
    // show complete; the layout may never trim them.
    const nocrop = new Set(p.nocrop || []);
    // With the film on top, a project can ask for its cover picture in the grid.
    const galleryImgs = (p.coverInGrid && p.cover ? [p.cover] : []).concat(p.images || []);
    // The build records each picture's proportions, so the row maths needs no
    // downloads and the browser can keep every picture lazy. The attributes
    // also reserve the right space, so nothing jumps as they arrive.
    const sizes = p.sizes || {};
    const gallery = galleryImgs
      .map((src) => {
        const d = sizes[src];
        const wh = d ? ` width="${d[0]}" height="${d[1]}"` : "";
        return `<img class="reveal"${nocrop.has(src) ? ` data-nocrop="1"` : ""}${wh} src="${asset(esc(src))}" alt="${esc(p.title)}" loading="lazy" onerror="window.__phErr(this)">`;
      })
      .join("");

    // The main film takes the cover's place at the top of the page; the cover
    // survives as the film's poster frame (and in the grid when asked for).
    const vids = (p.videos || []).map((v) => videoEmbedHTML(v, p.cover)).filter(Boolean);
    const mainVideo = vids[0] || "";
    const extraVideos = vids.slice(1).join("");

    // A press kit for presenters and press, under the pictures: intro, press
    // quotes, downloads and a contact line. Only projects that carry one.
    const kit = p.presskit;
    const presskitHTML = kit
      ? `<section class="project-presskit">
          <header class="insight-head">
            <p class="eyebrow">For presenters &amp; press</p>
            ${kit.intro ? `<p class="insight-intro">${esc(kit.intro)}</p>` : ""}
          </header>
          ${(kit.quotes || [])
            .map((q) => `<blockquote class="kit-quote"><p>“${esc(q.text)}”</p><cite>${esc(q.outlet)}</cite></blockquote>`)
            .join("")}
          <div class="kit-actions">
            ${(kit.downloads || [])
              .map((dl) => `<a class="pill" href="${asset(esc(dl.file))}" download>${esc(dl.label)} ↓</a>`)
              .join("")}
            ${kit.contact ? `<a class="pill" href="mailto:${esc(kit.contact)}">Request the technical rider</a>` : ""}
          </div>
        </section>`
      : "";

    // An "insight": an interview or conversation about the work, sitting under
    // the pictures. Questions are ours, in short; the answers are quoted, and
    // the piece it came from is always named and linked.
    const ins = p.insight;
    const insightHTML = ins
      ? `<section class="project-insight">
          <header class="insight-head">
            <p class="eyebrow">${esc(ins.kicker || "Insight")}</p>
            <h2>${escTitle(ins.title || "")}</h2>
            ${ins.intro ? `<p class="insight-intro">${esc(ins.intro)}</p>` : ""}
          </header>
          <div class="insight-qa">
            ${(ins.qa || [])
              .map(
                (row) => `<div class="qa">
                  <p class="q">${esc(row.q)}</p>
                  ${(row.a || [])
                    .map((sp) => `<blockquote><p>${esc(sp.text)}</p>${sp.who ? `<cite>${esc(sp.who)}</cite>` : ""}</blockquote>`)
                    .join("")}
                </div>`
              )
              .join("")}
          </div>
          ${ins.url
            ? `<p class="insight-source">${ins.source ? `${esc(ins.source)}, ` : ""}${ins.date ? `${esc(ins.date)}. ` : ""}<a href="${esc(ins.url)}" target="_blank" rel="noopener">Read the full interview ↗</a></p>`
            : ""}
        </section>`
      : "";

    const prev = projects[(idx - 1 + projects.length) % projects.length];
    const next = projects[(idx + 1) % projects.length];

    mount.innerHTML = `
      <div class="wrap project-head">
        <p class="eyebrow">${esc(p.category || "")}</p>
        <h1 class="display">${escTitle(p.title)}</h1>
        <div class="project-facts">
          ${fact("Year", p.year)}
          ${fact("Role", p.role)}
          ${fact("Location", p.location)}
          ${p.link ? `<div><div class="fact-label">Link</div><div class="fact-value"><a href="${esc(p.link)}" target="_blank" rel="noopener" style="border-bottom:1px solid var(--line)">Visit ↗</a></div></div>` : ""}
        </div>
      </div>
      ${mainVideo
        ? `<div class="wrap"><div class="project-videos is-main">${mainVideo}</div></div>`
        : p.cover
        ? `<div class="wrap"><div class="project-hero"><img class="reveal" src="${asset(esc(p.cover))}" alt="${esc(p.title)}" onerror="window.__phErr(this)"></div></div>`
        : ""}
      <div class="wrap">
        ${bodyHTML}
        ${p.pointcloud ? `<div class="project-pointcloud"><canvas class="pc-canvas" aria-label="Interactive point cloud"></canvas><p class="pc-label">${esc(p.pointcloud.label || "Drag to turn the scan, scroll to come closer.")}</p></div>` : ""}
        ${extraVideos ? `<div class="project-clips">${extraVideos}</div>` : ""}
        ${gallery ? `<div class="project-gallery"${p.galleryRows ? ` data-rows="${esc(String(p.galleryRows))}"` : ""}>${gallery}</div>` : ""}
        ${presskitHTML}
        ${insightHTML}
        <nav class="project-nav">
          <a href="${ROOT}project.html?p=${encodeURIComponent(prev.slug)}">← ${escTitle(prev.title)}</a>
          <a href="${ROOT}project.html?p=${encodeURIComponent(next.slug)}">${escTitle(next.title)} →</a>
        </nav>
      </div>`;
    observeReveals(mount);
    if (p.pointcloud) initProjectPointCloud(mount.querySelector(".project-pointcloud"), p.pointcloud);

    // A portrait film gets capped by height instead of width, or it stands
    // taller than the screen. The films are preload="none", so they report no
    // size until they play; the poster is cut from the film and has the same
    // proportions, and the browser has it already.
    mount.querySelectorAll(".project-video-file[poster]").forEach((v) => {
      const probe = new Image();
      probe.onload = () =>
        v.classList.toggle("is-portrait", probe.naturalHeight > probe.naturalWidth);
      probe.src = v.getAttribute("poster");
    });

    // Lay out the gallery once the pictures report their proportions, and on resize.
    const gal = mount.querySelector(".project-gallery");
    if (gal) {
      const imgs = [...gal.querySelectorAll("img")];
      // Sizes from the build: lay out at once, download nothing.
      if (imgs.every((img) => img.getAttribute("width"))) {
        layoutGallery(gal);
      } else {
        // A picture the build did not measure: fall back to waiting for it.
        let left = imgs.length;
        const done = () => { if (--left <= 0) layoutGallery(gal); };
        imgs.forEach((img) => {
          if (!img.getAttribute("width")) img.loading = "eager";
          if (img.complete && img.naturalWidth) done();
          else { img.addEventListener("load", done, { once: true }); img.addEventListener("error", done, { once: true }); }
        });
      }
      let wasNarrow = window.matchMedia("(max-width: 600px)").matches;
      window.addEventListener("resize", () => {
        const narrow = window.matchMedia("(max-width: 600px)").matches;
        if (narrow !== wasNarrow) { wasNarrow = narrow; layoutGallery(gal); }
      });
    }
  }

  /* ---- about / contact ---- */
  async function initAbout() {
    const mount = $("#about");
    if (!mount) return;
    const s = await loadJSON("data/site.json");

    const aboutParas = (s.about || "").split("\n").filter((l) => l.trim()).map((l) => `<p>${esc(l)}</p>`).join("");
    const cv = (s.cv || []).map((r) => `<li><span class="y">${esc(r.year)}</span><span>${esc(r.entry)}</span></li>`).join("");
    const services = (s.services || []).map((x) => `<li>${esc(x)}</li>`).join("");

    $("#about-bio").innerHTML = aboutParas;
    const portrait = $("#about-portrait");
    if (portrait && s.portrait) {
      portrait.onerror = () => portrait.remove(); // hide if the photo isn't there yet
      portrait.src = asset(s.portrait);
      portrait.hidden = false;
    }
    if ($("#cv-list")) $("#cv-list").innerHTML = cv;
    if ($("#services-list")) $("#services-list").innerHTML = services;
    if ($("#contact-email")) {
      $("#contact-email").innerHTML = `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`;
    }
    observeReveals(mount);
  }

  /* ---- point cloud player: a scan the visitor can hold and turn ----
     Raw WebGL, no libraries. The cloud ships as quantised uint16 positions and
     uint8 colors; the ranges come from the project JSON. The 7MB only loads
     when the block scrolls near. */
  function initProjectPointCloud(host, meta) {
    if (!host) return;
    const canvas = host.querySelector(".pc-canvas");
    const io2 = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { io2.disconnect(); boot(); }
    }, { rootMargin: "200px" });
    io2.observe(host);

    async function boot() {
      const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
      if (!gl) { host.style.display = "none"; return; }
      let buf;
      try {
        buf = await (await fetch(asset(meta.bin))).arrayBuffer();
      } catch (e) { host.style.display = "none"; return; }
      const n = meta.count;
      const qpos = new Uint16Array(buf, 0, n * 3);
      const cols = new Uint8Array(buf, n * 6, n * 3);

      const vs = `
        attribute vec3 aQ; attribute vec3 aC;
        uniform mat4 uMVP; uniform vec3 uScale; uniform float uSize;
        varying vec3 vC;
        void main() {
          vec3 pos = (aQ - 0.5) * uScale;
          gl_Position = uMVP * vec4(pos, 1.0);
          gl_PointSize = clamp(uSize / gl_Position.w, 1.0, 5.0);
          vC = aC;
        }`;
      const fs = `
        precision mediump float; varying vec3 vC;
        void main() { gl_FragColor = vec4(vC, 1.0); }`;
      const sh = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); return o; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      gl.useProgram(prog);

      const bind = (name, arr, size, type) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, name);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, type, true, 0, 0);
      };
      bind("aQ", qpos, 3, gl.UNSIGNED_SHORT);
      bind("aC", cols, 3, gl.UNSIGNED_BYTE);

      const uMVP = gl.getUniformLocation(prog, "uMVP");
      const uScale = gl.getUniformLocation(prog, "uScale");
      const uSize = gl.getUniformLocation(prog, "uSize");
      const sc = meta.scale, R = Math.max(sc[0], sc[1], sc[2]);
      gl.uniform3f(uScale, sc[0] / R, sc[1] / R, sc[2] / R);

      // the state a hand changes: yaw, pitch, distance
      let yaw = 0.6, pitch = -0.35, dist = 1.6, auto = true;
      canvas.style.touchAction = "none";
      let drag = null;
      canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; auto = false; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener("pointermove", (e) => {
        if (!drag) return;
        yaw += (e.clientX - drag.x) * 0.005;
        pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - drag.y) * 0.005));
        drag = { x: e.clientX, y: e.clientY };
      });
      canvas.addEventListener("pointerup", () => { drag = null; });
      canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        dist = Math.max(0.35, Math.min(4, dist * Math.exp(e.deltaY * 0.0012)));
        auto = false;
      }, { passive: false });

      const mul = (a, b) => {  // column-major 4x4
        const o = new Float32Array(16);
        for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
          o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        return o;
      };
      const draw = (t) => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.05, 0.05, 0.06, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (auto) yaw += 0.0012;
        const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
        const rotY = [cy,0,-sy,0, 0,1,0,0, sy,0,cy,0, 0,0,0,1];
        const rotX = [1,0,0,0, 0,cp,sp,0, 0,-sp,cp,0, 0,0,0,1];
        const trans = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,-dist,1];
        const f = 1 / Math.tan(0.4), aspect = w / h, near = 0.05, far = 20;
        const proj = [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)/(near-far),-1, 0,0,2*far*near/(near-far),0];
        gl.uniformMatrix4fv(uMVP, false, mul(mul(proj, trans), mul(rotX, rotY)));
        gl.uniform1f(uSize, (h * dpr) / 260);
        gl.drawArrays(gl.POINTS, 0, n);
        requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw);
    }
  }

  /* ---- expertise: four pillars, each with its linked projects ---- */
  async function initExpertise() {
    const mount = $("#expertise-list");
    if (!mount) return;
    const [{ projects }, site] = await Promise.all([
      loadJSON("data/projects.json"),
      loadJSON("data/site.json"),
    ]);
    const bySlug = Object.fromEntries(projects.map((p) => [p.slug, p]));
    // Insights, not tiles: the work page already shows the projects. Here each
    // discipline gets the thinking, and the projects are a quiet line of links.
    mount.innerHTML = (site.expertise || [])
      .map((pillar) => {
        const links = (pillar.projects || [])
          .map((slug) => bySlug[slug])
          .filter(Boolean)
          .map((pr) => `<a href="${ROOT}project.html?p=${encodeURIComponent(pr.slug)}">${escTitle(pr.title)}</a>`)
          .join('<span class="dot"> · </span>');
        const paras = (pillar.insight || [pillar.text].filter(Boolean))
          .map((t) => `<p>${esc(t)}</p>`)
          .join("");
        return `<section class="pillar reveal">
            <h2>${escTitle(pillar.title)}</h2>
            <div class="pillar-insight">${paras}</div>
            ${links ? `<p class="pillar-links">Seen in: ${links}</p>` : ""}
          </section>`;
      })
      .join("");
    observeReveals(mount);
  }

  /* ---- press ---- */
  async function initPress() {
    const mount = $("#press-list");
    if (!mount) return;
    let data;
    try {
      data = await loadJSON("data/press.json");
    } catch (e) {
      mount.innerHTML = `<li class="press-empty">Press coverage coming soon.</li>`;
      return;
    }
    const introEl = $("#press-intro");
    if (introEl && data.intro) introEl.textContent = data.intro;

    mount.innerHTML = (data.items || [])
      .map((it) => {
        const href = it.url || (it.image ? asset(it.image) : null);
        const cta = it.url ? "Read ↗" : it.image ? "View clipping ↗" : "";
        const inner = `
            ${it.image ? `<div class="press-media"><img src="${asset(esc(it.image))}" alt="${esc(it.outlet)}: ${esc(it.title)}" loading="lazy" onerror="window.__phErr(this)"></div>` : ""}
            <div class="press-head">
              <span class="press-outlet">${esc(it.outlet)}</span>
              <span class="press-date">${esc(it.date || "")}</span>
            </div>
            <p class="press-title">${escTitle(it.title)}</p>
            ${it.quote ? `<p class="press-quote">“${esc(it.quote)}”</p>` : ""}
            ${cta ? `<span class="press-cta">${cta}</span>` : ""}`;
        return `<li class="press-item reveal">${
          href
            ? `<a class="press-link" href="${esc(href)}" target="_blank" rel="noopener">${inner}</a>`
            : `<div class="press-link press-link--static">${inner}</div>`
        }</li>`;
      })
      .join("");
    observeReveals(mount);
  }

  /* ---- shared site chrome from site.json (brand, footer) ---- */
  async function initChrome() {
    try {
      const s = await loadJSON("data/site.json");
      $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
      $$("[data-site-email]").forEach((el) => {
        el.textContent = s.email;
        el.setAttribute("href", "mailto:" + s.email);
      });
      $$("[data-site-instagram]").forEach((el) => {
        if (s.instagram) {
          el.setAttribute("href", s.instagram);
        } else {
          el.style.display = "none"; // hide if no Instagram set
        }
      });
    } catch (e) {}
  }

  document.addEventListener("DOMContentLoaded", () => {
    trackViewportWidth();
    initSmoothScroll();
    initHoverPreviews();
    initLivingTiles();
    initHeader();
    initChrome();
    initHeroPoints();
    initHome();
    initWork();
    initProject();
    initAbout();
    initPress();
    initExpertise();
    observeReveals();
  });
})();
