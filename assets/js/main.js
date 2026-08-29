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
    const set = () => {
      root.style.setProperty("--vw", root.clientWidth + "px");
      /* The proportion law, exact: the design is the 4K wall, every other
         screen shows the SAME picture scaled down. --ts/--ui are simply
         width/3840 — no steps, no compromise — so the whitespace fraction
         matches the wall on any desktop. Floored so tablets stay readable;
         phones (<600) keep their own tuned scale from the CSS fallback. */
      const w = root.clientWidth;
      if (w >= 600) {
        const s = Math.min(1, Math.max(w / 3840, 0.35)).toFixed(4);
        root.style.setProperty("--ts", s);
        root.style.setProperty("--ui", s);
      } else {
        root.style.removeProperty("--ts");
        root.style.removeProperty("--ui");
      }
    };
    set();
    if ("ResizeObserver" in window) new ResizeObserver(set).observe(root);
    else window.addEventListener("resize", set, { passive: true });
    // a tab opened in the background measures a half-made layout; remeasure
    // the moment it actually faces the user
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") set();
    });
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
    /* What is already on screen at load is not an arrival, it is the first
       impression: it appears at once, quickly and without stagger. Only the
       hero fading in over a second and a half made the opening screen read
       as a page that had not finished loading. */
    const vh = window.innerHeight || 800;
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      if (el.getBoundingClientRect().top < vh * 0.9) {
        el.classList.add("at-once", "in");
        els.splice(i, 1);
      }
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
        if (!grid) return;
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

  /* ---- scroll-revealed text: words turn from faint to ink as the scroll
     passes over them. The spans carry the effect; without support or with
     reduced motion they are just words. ---- */
  function wrapWords(el) {
    if (!el || el.dataset.wrapped) return;
    el.dataset.wrapped = "1";
    el.innerHTML = el.textContent
      .split(/(\s+)/)
      .map((t) => (/^\s+$/.test(t) ? t : `<span class="w">${esc(t)}</span>`))
      .join("");
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
    const W = el.clientWidth;
    if (!W) return; // a background tab reports zero; leave it alone

    /* A JUSTIFIED gallery, sized against the window rather than the page width.

       What it replaces: every landscape or square picture stood alone at full
       page width, and only portraits paired. On Points of Light that produced
       eighteen consecutive rows at 950px, 88% of the window each, and a page
       19 screens long where every screen held exactly one picture. The pairs
       were worse: two portraits side by side computed to 1373px, 127% of the
       window, because flex-grow set the widths and the height just followed.

       Now a row takes pictures until its height drops to the target, and the
       row's HEIGHT is what gets set, so nothing can grow taller than the cap
       however tall the pictures are. Rows stay flush left and right whenever
       the target binds; only a row too tall for the cap pulls in and centres,
       which is what stops a portrait pair filling the screen. Nothing is
       cropped at all, where the old version cropped up to 10% to even the
       rows out.

       Jaco's rules, kept: never more than three in a row, and a graphic or
       poster marked nocrop still stands alone at true proportions. */
    const vv = (name, fb) => {
      const v = parseFloat(getComputedStyle(el).getPropertyValue(name));
      return isNaN(v) ? fb : v;
    };
    const TARGET = window.innerHeight * vv("--gal-row", 0.42);
    const MAXH = window.innerHeight * vv("--gal-max", 0.66);
    const PER_ROW = 3;
    const pinned = parseInt(el.dataset.rows || "", 10) || 0;

    const rows = [];
    let row = [], sum = 0;
    const close = () => { if (row.length) { rows.push(row); row = []; sum = 0; } };
    ratios.forEach((r, i) => {
      if (imgs[i].dataset.nocrop || pinned === 1) { close(); rows.push([i]); return; }
      row.push(i); sum += r;
      if (W / sum <= TARGET || row.length >= PER_ROW) close();
    });
    close();

    el.textContent = "";
    const built = rows.map((list) => {
      const d = document.createElement("div");
      d.className = list.length === 1 ? "grow solo" : "grow";
      list.forEach((i) => {
        imgs[i].style.flexGrow = "";
        imgs[i].style.aspectRatio = "";
        imgs[i].style.objectFit = "";
        d.appendChild(imgs[i]);
      });
      el.appendChild(d);
      return { d, list };
    });

    // the gap is CSS, so it can only be read once a row exists
    const gap = built.length ? parseFloat(getComputedStyle(built[0].d).columnGap) || 0 : 0;
    built.forEach(({ d, list }) => {
      const sum2 = list.reduce((a, i) => a + ratios[i], 0);
      const flush = (W - gap * (list.length - 1)) / sum2;
      d.style.height = `${Math.round(Math.min(flush, MAXH))}px`;
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
    // the cloud listens to the tune dials: density, dot size, speed, trails, scale
    const tv = (name, fb) => {
      const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
      return isNaN(v) ? fb : v;
    };
    // the cloud takes its two colours from the theme, so the dark room is a
    // real repaint (light dust in a dark space) and not an inverted picture
    const tc = (name, fb) => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fb;
    };
    let W = 0, H = 0, pts = [];
    let dot; // pre-rendered round-dot sprite (fast to draw in bulk)
    let trailRGB = "247, 246, 244"; // the ground the trails fade into
    const mouse = { x: -9999, y: -9999 };
    const toRGB = (c) => {
      const h = c.replace("#", "").trim();
      if (h.length === 6) {
        return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ");
      }
      const m = c.match(/\d+/g);
      return m ? m.slice(0, 3).join(", ") : "247, 246, 244";
    };

    // organic granular nebula — soft 3D dust lobes that rotate slowly
    // (after the TouchDesigner renders: dense charcoal cores dissolving into stray grain)
    function build() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      trailRGB = toRGB(tc("--cloud-bg", "#f7f6f4"));
      ctx.fillStyle = `rgb(${trailRGB})`; ctx.fillRect(0, 0, W, H); // prime for trails

      // tiny round-dot sprite (drawImage is much faster than arc() in bulk)
      dot = document.createElement("canvas");
      dot.width = dot.height = 16;
      const dctx = dot.getContext("2d");
      dctx.fillStyle = tc("--cloud-ink", "#20201f");
      dctx.beginPath(); dctx.arc(8, 8, 7, 0, Math.PI * 2); dctx.fill();

      const mobile = W < 600;
      const N = Math.round((mobile ? 3800 : 9000) * tv("--pc-density", 2.4));
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
          k: Math.random(), // stable cull threshold: see the density fade in draw()
          ox: 0, oy: 0, // magnetic offset (springs back on release)
        });
      }
    }

    function draw(t) {
      // fade the previous frame instead of clearing -> motion trails
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(${trailRGB}, ${tv("--pc-trail", 0.03)})`;
      ctx.fillRect(0, 0, W, H);
      // the grain is tuned on the 4K wall; smaller screens scale the dots and
      // the magnet with the viewport so the cloud reads the same, not chunkier
      const vs = W < 600 ? 1 : Math.min(W, H) / 2160;
      const R = 210 * vs;
      const TAU = Math.PI * 2;
      const sizeMul = tv("--pc-size", 2.5) * vs;
      const spd = tv("--pc-speed", 3);
      // where the cloud starts thinning and where it is gone, as a share of
      // the screen. Read once per frame: tv() hits getComputedStyle, which is
      // far too expensive to call per point.
      const f0 = tv("--pc-fade0", 0.55);
      const fspan = 1 / Math.max(0.01, tv("--pc-fade1", 0.95) - f0);
      const invH = 1 / H;
      // slow 3D rotation of the whole field
      const ay = reduced ? 0.6 : t * 0.00006 * spd;
      const axr = reduced ? -0.25 : 0.30 * Math.sin(t * 0.00003 * spd + 1.0);
      const cyr = Math.cos(ay), syr = Math.sin(ay);
      const cxr = Math.cos(axr), sxr = Math.sin(axr);
      const SR = Math.min(W, H) * (W < 600 ? 0.62 : 0.58) * tv("--pc-scale", 0.8); // cloud scale
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
        /* The cloud resolves toward the bottom of the screen by losing POINTS,
           not contrast. A CSS opacity ramp used to do this and it read as a
           grey gradient laid across the cloud's densest band. Dropping dots on
           a stable per-point threshold lets the mass dissolve into individual
           grain instead, so the works row can sit over the tail of it without
           a visible cut edge. */
        const fade = (y * invH - f0) * fspan;
        if (fade > 0 && pt.k < fade) continue;
        const pull = Math.min(1, (Math.abs(pt.ox) + Math.abs(pt.oy)) / (60 * vs));
        const depth = 0.55 + 0.45 * Math.max(0, Math.min(1, (1 - Z2 / SR) * 0.5)); // nearer = darker
        ctx.globalAlpha = Math.min(0.72, pt.w * 0.36 * depth + pull * 0.35);
        const pr = pt.s * persp * sizeMul;
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
    // switching the room repaints the cloud in the new theme's two colours
    window.addEventListener("themechange", () => {
      build();
      if (reduced) draw(0);
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
    const { projects: allProjects } = await loadJSON("data/projects.json");
    // work-in-progress pages ("hidden": true) stay reachable by URL but
    // never appear in a listing until they are done
    const projects = allProjects.filter((p) => !p.hidden);
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
    const { projects: allProjects } = await loadJSON("data/projects.json");
    const projects = allProjects.filter((p) => !p.hidden);

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
    /* The wall is SOLVED, not felt out. Every tile is a plain square -- the
       captions under a work-grid card are display:none and come back only on
       hover -- so the height of a layout is arithmetic and needs no trial
       reflow:  rows * tile + (rows - 1) * rowGap,  tile = (W - gaps) / cols.
       Take the FEWEST columns that still fit, which is the same as the
       biggest tiles: filter the wall down to a handful of projects and they
       grow to fill the same box.

       The old version set a column count, measured, and kept the first that
       fit. Two faults. It compared the grid's bottom against the viewport and
       never subtracted the FOOTER, so the page overflowed by exactly the
       footer's height (7px at 1920, where the footer is 59px and the slack
       24px covered the rest). And a trial loop that forces 20-odd reflows
       reads stale geometry during a resize burst: on a fresh load at 3840 it
       settled on a correct 11 columns, but after dragging the window between
       screens it landed on 8 and the page scrolled for 1.64 screens. */
    const fit = () => {
      if (window.matchMedia("(max-width: 1000px)").matches) {
        mount.style.gridTemplateColumns = "";
        mount.style.height = "";
        mount.style.justifyContent = "";
        mount.style.alignContent = "";
        mount.style.columnGap = "";
        mount.style.rowGap = "";
        return;
      }
      const n = mount.querySelectorAll(".card").length;
      if (!n) {
        // an empty result is not a one-tile wall: drop the solved box so the
        // notice sits where the pictures would have started
        mount.style.gridTemplateColumns = "";
        mount.style.height = "";
        mount.style.justifyContent = "";
        mount.style.alignContent = "";
        mount.style.columnGap = "";
        mount.style.rowGap = "";
        return;
      }
      mount.style.gridTemplateColumns = "";
      mount.style.height = "";
      mount.style.columnGap = "";
      mount.style.rowGap = "";
      /* The gap is a share of the TILE, not of the screen. It used to be
         clamp(...) * --ts, which is proportional to the viewport and so holds
         still while the tiles shrink: at 43 works the gap was 13% of a tile,
         at 200 works it was 34% and the gaps were eating the wall. Reading it
         as a ratio keeps the rhythm identical at every count AND at every
         screen size, since the tile is itself proportional. The two ratios
         are taken from the wall as Jaco tuned it at 43 works, so nothing
         moves at today's count. */
      const cs = getComputedStyle(mount);
      const kx = parseFloat(cs.getPropertyValue("--wall-gap-x")) || 0.133;
      const ky = parseFloat(cs.getPropertyValue("--wall-gap-y")) || 0.186;
      const W = mount.clientWidth;
      if (!W) return; // a background tab reports zero; leave the layout alone
      /* The footer's HEIGHT only. Its margin-top is `auto` -- that is what
         pins it to the floor -- and an auto margin RESOLVES to a real pixel
         value once the flex column lays out. Adding it here read 512px of
         resolved margin as if it were part of the footer's box, cut the
         budget from 760 to 250, and laid five works out at 270px tiles
         hugging the toolbar. Worse, it is a feedback loop: a starved grid
         leaves more slack, which grows the auto margin, which starves it
         further. With the footer pinned its top is simply innerHeight minus
         its height, so the height is the only term that belongs here. */
      const foot = $(".site-footer");
      const footBox = foot ? foot.offsetHeight : 0;
      // a little slack so a layout that only just fits cannot flip its column
      // count when a font swap or rounding nudges it a pixel either way
      const slack = 24 * Math.min(1, window.innerWidth / 3840) + 8;
      const top = mount.getBoundingClientRect().top + window.scrollY;
      // the section around the wall carries its own bottom padding, which
      // sits between the grid and the footer and must come out of the budget
      const padB = mount.parentElement
        ? parseFloat(getComputedStyle(mount.parentElement).paddingBottom) || 0
        : 0;
      const avail = window.innerHeight - top - footBox - padB - slack;
      // Mid-resize the browser can report the new innerHeight while the head
      // and toolbar above still carry the old width's layout, which yields a
      // nonsense box and a wall of postage stamps. Leave it alone and wait
      // for the settled frame scheduleFit() asks for.
      if (!(avail > 0)) return;
      /* Maximise the tile against BOTH edges of the box. A tile is square, so
         its size is the smaller of what the width allows across that many
         columns and what the height allows down that many rows. Taking only
         the width answer, as this did before, meant a filtered wall of five
         works sat as one row in the top half with 400px of dead space under
         it: the tiles were as big as one row can be, but the BLOCK was not
         filling its box. Two rows of three, capped by height, fill it.

         Note the honest limit: five squares across the full width can never
         exceed W/5 (356px at 1920). Breaking to two rows and capping by
         height buys 371px, four per cent. The gain here is that the block
         fills the space, not that each picture grows a lot. Genuinely bigger
         pictures for a small set would mean letting the tiles stop being
         squares -- Jaco's call, not a thing to sneak in. */
      /* With the gap expressed as a ratio of the tile, the tile is no longer
         W minus fixed gaps: it solves out of
             W = cols * tile + (cols - 1) * kx * tile
         which is why neither term is circular. */
      let best = n, bestTile = 0, bestByHeight = false;
      for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols);
        const byW = W / (cols + (cols - 1) * kx);
        const byH = avail / (rows + (rows - 1) * ky);
        const tile = Math.min(byW, byH);
        if (tile > bestTile) { bestTile = tile; best = cols; bestByHeight = byH < byW; }
      }
      // the solved gap, in pixels, for the tile that won
      mount.style.columnGap = `${(kx * bestTile).toFixed(2)}px`;
      mount.style.rowGap = `${(ky * bestTile).toFixed(2)}px`;
      // the grid owns exactly the space between the toolbar and the footer,
      // so align-content has something real to centre inside
      mount.style.height = `${Math.max(0, Math.floor(avail))}px`;
      mount.style.alignContent = "center";
      if (bestByHeight) {
        // height-limited: fixed tracks, centred, so the block sits in the
        // middle of its box instead of hugging the top-left
        mount.style.gridTemplateColumns = `repeat(${best}, ${Math.floor(bestTile)}px)`;
        mount.style.justifyContent = "center";
      } else {
        /* Width-limited (the full 43-work wall): 1fr keeps it flush to both
           margins exactly as before. The tile cannot grow here -- 43 squares
           at 11 across is 149px at 1920, and 10 across needs a fifth row that
           does not fit -- so the leftover height is quantised and real. Centre
           the rows in the box so that leftover reads as air above AND below
           rather than a dead band sitting on the footer. */
        mount.style.gridTemplateColumns = `repeat(${best}, 1fr)`;
        mount.style.justifyContent = "";
      }
    };

    /* Solve only on a SETTLED frame, and from EVERY path that changes the
       wall -- resize, webfont swap, and the re-render a filter or a search
       triggers. Measuring synchronously right after innerHTML is replaced
       reads the new contents against the old layout: pressing Performance
       gave a grid top of 702 instead of 210, so the box came out at 270px
       and the five works were laid out at 270px tiles instead of 376. Two
       rAFs give the browser a full layout pass before anything is measured. */
    let fitRaf = 0;
    function scheduleFit() {
      cancelAnimationFrame(fitRaf);
      fitRaf = requestAnimationFrame(() => {
        fitRaf = requestAnimationFrame(fit);
      });
    }

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
      mount.innerHTML = list.length
        ? list.map(cardHTML).join("")
        : `<p class="work-empty">Nothing here by that name. Try another word, or press All.</p>`;
      if (countEl) countEl.textContent = `Showing ${list.length} of ${projects.length}`;
      observeReveals(mount);
      scheduleFit();
    };
    render();
    // the toolbar's height, and so the wall's box, moves when Open Sans
    // swaps in for the fallback: solve again once it has
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleFit);
    window.addEventListener("resize", scheduleFit, { passive: true });
    if (searchEl) searchEl.addEventListener("input", render);

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
    // The credits carry real names: each "Role: Name" pair becomes its own
    // labeled credit, set like the facts row, instead of one muted sentence.
    const creditsHTML = p.credits
      ? `<div class="project-credits">${String(p.credits)
          .split(/\.\s+(?=[A-Z])/)
          .map((seg) => seg.replace(/\.\s*$/, "").trim())
          .filter(Boolean)
          .map((seg) => {
            const m = seg.match(/^([^:]{2,80}):\s*(.+)$/);
            if (m)
              return `<div class="credit"><span class="credit-role">${esc(m[1])}</span><span class="credit-name">${esc(m[2])}</span></div>`;
            // "Commissioned by X" and friends read as a pair without a colon
            const by = seg.match(/^(Commissioned by|Supported by|Presented by|Produced by|Released on|Curated by|In collaboration with)\s+(.+)$/i);
            if (by)
              return `<div class="credit"><span class="credit-role">${esc(by[1])}</span><span class="credit-name">${esc(by[2])}</span></div>`;
            // anything else is a note, not a name: full width, quiet
            return `<p class="credit-note">${esc(seg)}.</p>`;
          })
          .join("")}</div>`
      : "";
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

    /* ---- story mode, the Regie engine ----
       The film and the text keep their usual places on the page; the
       GALLERY becomes the stage. It opens as the complete contact sheet,
       every picture visible at once, and scrolling turns over curated
       compositions of the same pictures: one solo, then a pair, and the
       sheet closes it. Scroll only picks the beat; one slow ease performs
       the change. Opt-in per project with "story": true. */
    const regie = p.story
      ? (() => {
          const szs = p.sizes || {};
          const items = (p.images || []).map((src) => {
            const d = szs[src];
            return { a: d ? d[0] / d[1] : 1.5, html: `<img src="${asset(esc(src))}" alt="${esc(p.title)}">` };
          });
          if (items.length < 3) return null;
          // The running order. The project file may DIRECT it: "regie" is a
          // list of beats, each a list of picture numbers (1 = first image)
          // shown together, or the word "all" for the full sheet. The opening
          // and closing sheet come free. Without a script: a solo/solo/pair
          // rhythm, pairs more often when the crowd is big.
          const beats = [{ kind: "all" }];
          if (Array.isArray(p.regie) && p.regie.length) {
            p.regie.forEach((beat) => {
              if (beat === "all") beats.push({ kind: "all" });
              else if (Array.isArray(beat)) {
                const who = beat.map((n) => n - 1).filter((i) => i >= 0 && i < items.length);
                if (who.length) beats.push({ kind: "hero", who });
              }
            });
          } else {
            const all = items.map((_, i) => i);
            const cycle = all.length > 12 ? [1, 2, 2] : [1, 1, 2];
            let i = 0, b = 0;
            while (i < all.length) {
              const take = Math.min(cycle[b % cycle.length], all.length - i);
              beats.push({ kind: "hero", who: all.slice(i, i + take) });
              i += take;
              b++;
            }
          }
          beats.push({ kind: "all" });
          const html = `<div class="regie" style="height:${beats.length * 35}vh"><div class="regie-stage">
            ${items.map((it, k) => `<div class="regie-item" data-i="${k}">${it.html}</div>`).join("")}
            <p class="story-counter">1 — ${beats.length}</p>
            <p class="story-hint">scroll</p>
          </div></div>`;
          return { html, items, beats };
        })()
      : null;
    const storyHTML = regie ? regie.html : "";

    // the previous/next walk skips work-in-progress pages
    const walk = (from, step) => {
      let i = from;
      do {
        i = (i + step + projects.length) % projects.length;
      } while (projects[i].hidden && i !== from);
      return projects[i];
    };
    const prev = walk(idx, -1);
    const next = walk(idx, 1);

    mount.innerHTML = `
      <div class="wrap project-head">
        <p class="eyebrow">${esc(p.category || "")}</p>
        <h1 class="display">${escTitle(p.title)}</h1>
        ${p.with
          ? `<p class="project-by">Jaco Schilp <span class="by-x">×</span> ${esc(
              Array.isArray(p.with) ? p.with.join(" × ") : p.with
            )}</p>`
          : ""}
        <div class="project-facts">
          ${fact("Year", p.year)}
          ${fact("Role", p.role)}
          ${(() => {
            // one venue reads as a line; a tour of venues reads as a list,
            // each on its own line, and the label turns plural
            if (!p.location) return "";
            const spots = String(p.location).split(/\s*·\s*/).filter(Boolean);
            return `<div><div class="fact-label">${spots.length > 1 ? "Locations" : "Location"}</div><div class="fact-value fact-locations">${spots.map(esc).join("<br>")}</div></div>`;
          })()}
          ${p.link ? `<div class="fact-link"><div class="fact-label">Link</div><div class="fact-value"><a href="${esc(p.link)}" target="_blank" rel="noopener" style="border-bottom:1px solid var(--line)">Visit ↗</a></div></div>` : ""}
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
        ${regie ? storyHTML : gallery ? `<div class="project-gallery"${p.galleryRows ? ` data-rows="${esc(String(p.galleryRows))}"` : ""}>${gallery}</div>` : ""}
        ${presskitHTML}
        ${insightHTML}
        <nav class="project-nav">
          <a href="${ROOT}project.html?p=${encodeURIComponent(prev.slug)}">← ${escTitle(prev.title)}</a>
          <a href="${ROOT}project.html?p=${encodeURIComponent(next.slug)}">${escTitle(next.title)} →</a>
        </nav>
      </div>`;
    observeReveals(mount);
    mount.querySelectorAll(".project-statement .statement").forEach(wrapWords);

    // Regie driver: scroll picks a beat, the layout tables compose the stage,
    // and the CSS transition performs the change with one slow ease.
    const reg = mount.querySelector(".regie");
    if (reg && regie) {
      const stage = reg.querySelector(".regie-stage");
      const els = [...reg.querySelectorAll(".regie-item")];
      const textEl = reg.querySelector(".regie-text");
      if (textEl) {
        textEl.querySelectorAll(".statement").forEach(wrapWords);
        textEl.querySelectorAll(".w").forEach((el, k) => {
          el.style.transitionDelay = `${Math.min(k * 30, 1200)}ms`;
        });
      }
      const counter = reg.querySelector(".story-counter");
      const hint = reg.querySelector(".story-hint");
      const { items, beats } = regie;
      const GAP = 10, PAD = 24;
      const fit = (a, bw, bh) => (a >= bw / bh ? { w: bw, h: bw / a } : { w: bh * a, h: bh });
      // strip size and dimming listen to the tune dials
      const tv = (name, fallback) => {
        const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
        return isNaN(v) ? fallback : v;
      };

      // the contact sheet: rows justified to the width, the row count chosen
      // so the finished sheet comes closest to filling the stage
      const sheet = (idxs, W, H) => {
        let best = null;
        for (let r = 1; r <= Math.min(idxs.length, 8); r++) {
          const per = Math.ceil(idxs.length / r);
          const rows = [];
          for (let s = 0; s < idxs.length; s += per) rows.push(idxs.slice(s, s + per));
          let total = GAP * (rows.length - 1);
          const rh = rows.map((row) => {
            const h = (W - GAP * (row.length - 1)) / row.reduce((s, i) => s + items[i].a, 0);
            total += h;
            return h;
          });
          if (!best || Math.abs(H - total) < Math.abs(H - best.total)) best = { rows, rh, total };
        }
        const scale = Math.min(1, H / best.total);
        const rects = {};
        // the sheet hugs the top of the stage: white above the pictures
        // read as a hole between the text and the gallery
        let y = Math.min((H - best.total * scale) / 2, H * 0.03);
        best.rows.forEach((row, ri) => {
          const h = best.rh[ri] * scale;
          const rowW = row.reduce((s, i) => s + items[i].a * h, 0) + GAP * (row.length - 1);
          let x = (W - rowW) / 2;
          row.forEach((i) => {
            rects[i] = { x, y, w: items[i].a * h, h };
            x += items[i].a * h + GAP;
          });
          y += h + GAP;
        });
        return rects;
      };

      // one composition: hero(es) hold the light, the rest wait as a strip
      // of thumbnails along the bottom, still present, turned down
      const layout = (beat, W, H) => {
        const all = items.map((_, i) => i);
        const op = {};
        if (beat.kind === "all" || beat.kind === "text") {
          all.forEach((i) => (op[i] = beat.kind === "text" ? 0.1 : 1));
          return { rects: sheet(all, W, H), op, text: beat.kind === "text" };
        }
        const who = beat.who;
        const restIdx = all.filter((i) => !who.includes(i));
        all.forEach((i) => (op[i] = who.includes(i) ? 1 : tv("--regie-dim", 0.34)));
        const stripH = restIdx.length ? Math.max(40, H * tv("--regie-strip", 0.13)) : 0;
        const heroH = H - (stripH ? stripH + GAP * 2 : 0);
        const rects = {};
        if (W < 700 && who.length > 1) {
          // the phone stacks a pair instead of splitting the narrow width
          const each = (heroH - GAP * (who.length - 1)) / who.length;
          let y = 0;
          who.forEach((i) => {
            const f = fit(items[i].a, W, each);
            rects[i] = { x: (W - f.w) / 2, y: y + (each - f.h) / 2, w: f.w, h: f.h };
            y += each + GAP;
          });
        } else if (who.length > 1) {
          const bw = (W - GAP * (who.length - 1)) / who.length;
          const fits = who.map((i) => fit(items[i].a, bw, heroH * 0.96));
          const totalW = fits.reduce((s, f) => s + f.w, 0) + GAP * (who.length - 1);
          let x = (W - totalW) / 2;
          who.forEach((i, k) => {
            rects[i] = { x, y: (heroH - fits[k].h) / 2, w: fits[k].w, h: fits[k].h };
            x += fits[k].w + GAP;
          });
        } else {
          const f = fit(items[who[0]].a, W * 0.96, heroH * 0.96);
          rects[who[0]] = { x: (W - f.w) / 2, y: (heroH - f.h) / 2, w: f.w, h: f.h };
        }
        if (restIdx.length) {
          let h = stripH;
          let total = restIdx.reduce((s, i) => s + items[i].a, 0) * h + GAP * (restIdx.length - 1);
          if (total > W) {
            h *= (W - GAP * (restIdx.length - 1)) / (total - GAP * (restIdx.length - 1));
            total = W;
          }
          let x = (W - total) / 2;
          restIdx.forEach((i) => {
            rects[i] = { x, y: H - h, w: items[i].a * h, h };
            x += items[i].a * h + GAP;
          });
        }
        return { rects, op, text: false };
      };

      const apply = (bi) => {
        const W = stage.clientWidth - PAD * 2;
        const H = stage.clientHeight - PAD * 2;
        // a background tab measures 0x0; lay out again when it becomes real
        if (W <= 0 || H <= 0) return;
        const { rects, op, text } = layout(beats[bi], W, H);
        els.forEach((el, i) => {
          const r = rects[i];
          if (r) {
            el.style.transform = `translate(${(PAD + r.x).toFixed(1)}px, ${(PAD + r.y).toFixed(1)}px)`;
            el.style.width = `${r.w.toFixed(1)}px`;
            el.style.height = `${r.h.toFixed(1)}px`;
          }
          el.style.opacity = op[i];
          const v = el.querySelector("video");
          if (v) {
            const on = beats[bi].kind === "hero" && beats[bi].who.includes(i);
            v.controls = on;
            if (on && v.paused) v.play().catch(() => {});
            else if (!on && !v.paused) v.pause();
          }
        });
        if (textEl) textEl.classList.toggle("on", text);
        if (counter) counter.textContent = `${bi + 1} — ${beats.length}`;
      };

      // hysteresis: a beat turns over only once the scroll is well past
      // halfway, so a resting position never flickers between two beats
      let cur = -1;
      const drive = () => {
        const rct = reg.getBoundingClientRect();
        const span = reg.offsetHeight - window.innerHeight;
        const raw = Math.max(0, Math.min(1, -rct.top / Math.max(1, span))) * (beats.length - 1);
        let next = cur < 0 ? Math.round(raw) : cur;
        while (raw - next > 0.55) next++;
        while (next - raw > 0.55) next--;
        next = Math.max(0, Math.min(beats.length - 1, next));
        if (next !== cur) {
          cur = next;
          apply(cur);
        }
        if (hint) hint.style.opacity = Math.max(0, 1 - raw * 2);
      };
      const remeasure = () => {
        if (cur >= 0) apply(cur);
        drive();
      };
      window.addEventListener("scroll", drive, { passive: true });
      window.addEventListener("resize", remeasure, { passive: true });
      document.addEventListener("visibilitychange", remeasure);
      drive();
      // the first composition lands instantly; only the turns are eased
      requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.add("is-on")));
    }
    if (p.pointcloud) initProjectPointCloud(mount.querySelector(".project-pointcloud"), p.pointcloud);

    // Under the page, one strip to slide through: the articles that wrote
    // about this work, then its nearest projects. Articles come from
    // press.json entries tagged with this project's slug; related projects
    // from an explicit "related" list or, failing that, the same category.
    // Prototyping on the story pages only (Somnia) until Jaco signs it off.
    (async () => {
      if (!p.story) return;
      let articles = [];
      try {
        const pd = await loadJSON("data/press.json");
        articles = (pd.items || []).filter((it) => it.project === p.slug);
      } catch (_) {}
      const rel = (Array.isArray(p.related) ? p.related : [])
        .map((s) => projects.find((x) => x.slug === s))
        .filter(Boolean);
      projects.forEach((x) => {
        if (rel.length >= 6) return;
        if (x.slug !== p.slug && !x.hidden && !rel.includes(x) && x.category === p.category && x.cover) rel.push(x);
      });
      const cards = [
        /* On a PROJECT page the card carries what the paper said about THIS
           work, not the article's headline. A headline covers whatever the
           piece was about -- the Volkskrant one is "Echte headliners heeft Le
           Guess Who niet...", a verdict on a whole festival -- which tells a
           reader of the Somnia page nothing about Somnia. The quote does. The
           headline still leads on the press page, where it belongs. */
        ...articles.map(
          (it) => `<a class="rel-card" href="${it.clipping ? asset(esc(it.clipping)) : it.url ? esc(it.url) : `${ROOT}press.html`}"${it.url || it.clipping ? ` target="_blank" rel="noopener"` : ""}>
            ${it.image ? `<div class="rel-media"><img src="${asset(esc(it.image))}" alt="" loading="lazy" onerror="window.__phErr(this)"></div>` : ""}
            <span class="rel-kicker">${esc(it.outlet)}${it.occasion ? ` · ${esc(it.occasion)}` : ""}${it.date ? ` · ${esc(it.date)}` : ""}</span>
            ${it.quote
              ? `<span class="rel-quote">“${esc(it.quote)}”</span>`
              : `<span class="rel-title">${escTitle(it.title)}</span>`}
          </a>`
        ),
        ...rel.slice(0, 6).map(
          (x) => `<a class="rel-card" href="${ROOT}project.html?p=${encodeURIComponent(x.slug)}">
            <div class="rel-media"><img src="${asset(esc(x.coverThumb || x.cover))}" alt="" loading="lazy" onerror="window.__phErr(this)"></div>
            <span class="rel-kicker">Project${x.year ? ` · ${esc(x.year)}` : ""}</span>
            <span class="rel-title">${escTitle(x.title)}</span>
          </a>`
        ),
      ];
      if (!cards.length) return;
      const label = articles.length && rel.length ? "In the press & related work" : articles.length ? "In the press" : "Related work";
      const nav = mount.querySelector(".project-nav");
      if (nav)
        nav.insertAdjacentHTML(
          "beforebegin",
          `<div class="project-related"><p class="eyebrow">${label}</p><div class="carousel">${cards.join("")}</div></div>`
        );
    })();

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
      /* Re-lay out on EVERY resize, on a settled frame. This used to fire only
         when the 600px phone breakpoint was crossed, which was safe while rows
         were sized by flex-grow and adjusted themselves. Rows carry an explicit
         pixel height now, so a height computed for one window survives into the
         next: dragging 3840 down to 1366 left rows at 204% of the window and a
         page ten screens long. Two rAFs, as everywhere else here, so nothing is
         measured against a layout that has not settled. */
      let galRaf = 0;
      window.addEventListener("resize", () => {
        cancelAnimationFrame(galRaf);
        galRaf = requestAnimationFrame(() => {
          galRaf = requestAnimationFrame(() => layoutGallery(gal));
        });
      }, { passive: true });
    }
  }

  /* ---- about / contact ---- */
  async function initAbout() {
    const mount = $("#about");
    if (!mount) return;
    const s = await loadJSON("data/site.json");

    const aboutParas = (s.about || "").split("\n").filter((l) => l.trim()).map((l) => `<p>${esc(l)}</p>`).join("");
    /* A CV row is title, venue, location -- three fields rather than one
       sentence, so the same data can be grouped, filtered or exported later.
       `entry` is still honoured for anything written the old way. */
    const cvLine = (r) =>
      r.entry ? r.entry : [r.title, r.venue, r.location].filter(Boolean).join(", ");
    const CV_GROUPS = [["work", "Work"], ["curation", "Curation"], ["education", "Education"]];
    const cvRows = (rs) =>
      rs.map((r) => `<li><span class="y">${esc(r.year)}</span><span>${esc(cvLine(r))}</span></li>`).join("");
    const cv = CV_GROUPS.map(([key, label]) => {
      const rows = (s.cv || []).filter((r) => (r.category || "work") === key);
      if (!rows.length) return "";
      // forty-eight rows read as a list; under three headings they read as a CV
      return `<li class="detail-head"><span>${esc(label)}</span></li>${cvRows(rows)}`;
    }).join("") || cvRows(s.cv || []);

    const simpleRows = (rs) =>
      (rs || [])
        .map((r) => `<li><span class="y">${esc(r.year)}</span><span>${esc([r.title, r.location].filter(Boolean).join(", "))}</span></li>`)
        .join("");
    const residencies = simpleRows(s.residencies_and_support);
    const boards = simpleRows(s.teaching_and_boards);
    const services = (s.services || []).map((x) => `<li>${esc(x)}</li>`).join("");

    $("#about-bio").innerHTML = aboutParas;
    const portrait = $("#about-portrait");
    if (portrait && s.portrait) {
      portrait.onerror = () => portrait.remove(); // hide if the photo isn't there yet
      portrait.src = asset(s.portrait);
      portrait.hidden = false;
    }
    if ($("#cv-list")) $("#cv-list").innerHTML = cv;
    if ($("#residencies-list")) $("#residencies-list").innerHTML = residencies;
    if ($("#boards-list")) $("#boards-list").innerHTML = boards;
    if ($("#live-shows") && s.live_shows) $("#live-shows").textContent = s.live_shows;
    if ($("#tools") && s.tools) $("#tools").textContent = s.tools;
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
    mount.querySelectorAll(".pillar-insight p").forEach(wrapWords);
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

    /* Newest first, sorted here rather than in the file so the order cannot
       drift as cuttings are added through the back office. Dates are written
       for people ("May 2026", "Sep 2022", and La Jornada's bare "2024"), so
       parse what is there and treat a missing month as the start of the
       year -- an undated item sorts last rather than jumping the queue. */
    const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const stamp = (d) => {
      const t = String(d || "").toLowerCase();
      const year = (t.match(/(19|20)\d{2}/) || [])[0];
      if (!year) return -1;
      const mi = MONTHS.findIndex((m) => t.includes(m));
      return +year * 12 + (mi < 0 ? 0 : mi);
    };
    const ordered = (data.items || [])
      .map((it, i) => ({ it, i }))
      .sort((a, b) => stamp(b.it.date) - stamp(a.it.date) || a.i - b.i)
      .map((x) => x.it);

    mount.innerHTML = ordered
      .map((it) => {
        /* A "clipping" wins over a "url". Some of this coverage is print, and
           some of the papers put their own page behind a paywall -- the
           Volkskrant Transliminal piece is both -- so a link that says Read
           and lands on a subscription wall is worse than none. Where the
           scan of the page is the readable version, name it as `clipping`
           and the card opens that instead. The `url` stays in the data as
           the article's canonical home. */
        const clip = it.clipping ? asset(esc(it.clipping)) : null;
        const href = clip || it.url || (it.image ? asset(it.image) : null);
        const cta = clip ? "View clipping ↗" : it.url ? "Read ↗" : it.image ? "View clipping ↗" : "";
        const inner = `
            ${
              it.image
                ? `<div class="press-media"><img src="${asset(esc(it.image))}" alt="${esc(it.outlet)}: ${esc(it.title)}" loading="lazy" onerror="window.__phErr(this)"></div>`
                : `<div class="press-media press-media--empty" aria-hidden="true"></div>`
            }
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

    /* Press holds one screen too. A press card is not a square, so its height
       is not a closed form the way the work wall's is -- the picture is 16:10
       of the width but the outlet line, the headline and the pull quote each
       wrap differently. So this measures instead of solving, taking the
       FEWEST columns that still fit, which is the same as the biggest cards.
       That is safe here because it only ever runs on a settled frame (see
       scheduleFitPress) and costs at most ten reflows once.

       Solving the COUNT rather than fixing a pixel card is also what keeps
       the page proportional: the card width and the type inside it both
       scale with the screen, so the same count wins at 1920 and at 3840 and
       the wall shows the laptop composition enlarged, not eleven columns of
       confetti. */
    const fitPress = () => {
      if (window.matchMedia("(max-width: 1000px)").matches) {
        mount.style.gridTemplateColumns = "";
        return;
      }
      const n = mount.querySelectorAll(".press-item").length;
      if (!n) return;
      mount.style.gridTemplateColumns = "";
      const foot = $(".site-footer");
      const footBox = foot ? foot.offsetHeight : 0; // margin-top:auto resolves; height only
      const slack = 24 * Math.min(1, window.innerWidth / 3840) + 8;
      const top = mount.getBoundingClientRect().top + window.scrollY;
      const sec = mount.parentElement;
      const padB = sec ? parseFloat(getComputedStyle(sec).paddingBottom) || 0 : 0;
      const avail = window.innerHeight - top - footBox - padB - slack;
      if (!(avail > 0)) return;
      /* Capped at six. A press card carries a headline and a pull quote, so
         it cannot be squeezed the way a square cover can: past six columns
         the text has no measure left. Uncapped, this page solved to TWELVE
         columns of 153px cards, because that one row of postage stamps was
         the only layout that fit -- the page header takes 310px and the
         footer another 137, leaving 633px for cards that are 378px tall, so
         two rows need 771 and never fit. Twelve narrow columns is worse than
         a short scroll, so the cap wins and the page scrolls the little it
         needs to. */
      const most = Math.min(n, 6);
      for (let cols = 2; cols <= most; cols++) {
        mount.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        if (mount.getBoundingClientRect().height <= avail) return;
      }
      mount.style.gridTemplateColumns = `repeat(${most}, 1fr)`;
    };

    let pressRaf = 0;
    const scheduleFitPress = () => {
      cancelAnimationFrame(pressRaf);
      pressRaf = requestAnimationFrame(() => {
        pressRaf = requestAnimationFrame(fitPress);
      });
    };
    scheduleFitPress();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleFitPress);
    // the pictures decide the card height, so re-solve as they land
    mount.querySelectorAll("img").forEach((im) => {
      if (!im.complete) im.addEventListener("load", scheduleFitPress, { once: true });
    });
    window.addEventListener("resize", scheduleFitPress, { passive: true });
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

  /* ---- the light switch ----
     The dark room is the default, because the work is light in a dark space.
     A visitor can switch to paper and that choice is remembered in this
     browser only. The <html data-theme="light"> attribute is set by a tiny
     inline script in each page's <head> before first paint, so a returning
     visitor never sees the wrong room flash past. */
  function initTheme() {
    const root = document.documentElement;
    const nav = $(".nav");
    if (!nav) return;
    const btn = document.createElement("button");
    btn.className = "theme-toggle";
    btn.type = "button";
    // both glyphs ship; CSS shows whichever belongs to the current room
    btn.innerHTML =
      '<span class="theme-sun" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">' +
      '<circle cx="12" cy="12" r="4.4"></circle>' +
      '<path d="M12 2v2.6M12 19.4V22M2 12h2.6M19.4 12H22M4.9 4.9l1.9 1.9M17.2 17.2l1.9 1.9M19.1 4.9l-1.9 1.9M6.8 17.2l-1.9 1.9"></path>' +
      "</svg></span>" +
      '<span class="theme-moon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">' +
      '<path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2z"></path>' +
      "</svg></span>" +
      '<span class="theme-label"></span>';

    const word = btn.querySelector(".theme-label");
    const label = () => {
      const light = root.dataset.theme === "light";
      // the button names where it takes you, not where you are
      word.textContent = light ? "Dark" : "Light";
      btn.setAttribute("aria-pressed", String(!light));
      btn.setAttribute("aria-label", light ? "Switch to the dark room" : "Switch to the light room");
      btn.title = btn.getAttribute("aria-label");
    };
    label();

    btn.addEventListener("click", () => {
      const light = root.dataset.theme === "light";
      if (light) delete root.dataset.theme;
      else root.dataset.theme = "light";
      try { localStorage.setItem("theme", light ? "dark" : "light"); } catch (_) {}
      label();
      window.dispatchEvent(new Event("themechange"));
    });

    // sits in the bar next to the menu, before the phone's hamburger
    const links = $(".nav-links");
    if (links) nav.insertBefore(btn, links.nextSibling);
    else nav.appendChild(btn);
  }

  // The tune panel: opening any page with ?tune starts a live editing
  // session (dials for text sizes, whitespace, widths) that follows you
  // across pages until closed. Values preview only; Copy hands them over
  // to be baked into the stylesheet.
  function initTune() {
    /* The panel is a studio instrument, never a visitor's business: it only
       exists on a local dev server. A published page cannot show it even if
       an old ?tune session is still remembered in that browser's storage —
       which is exactly how it once turned up over the live work grid. */
    const local = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(location.hostname) ||
      location.protocol === "file:" || location.hostname.endsWith(".local");
    if (!local) {
      localStorage.removeItem("siteTune");
      return;
    }
    if (new URLSearchParams(location.search).has("tune")) localStorage.setItem("siteTune", "1");
    if (localStorage.getItem("siteTune") !== "1") return;
    try {
      const saved = JSON.parse(localStorage.getItem("siteTuneVals") || "{}");
      Object.entries(saved).forEach(([k, v]) => document.documentElement.style.setProperty(k, String(v)));
    } catch (_) {}
    const me = document.querySelector('script[src*="main.js"]');
    const q = me && me.src.includes("?") ? "?" + me.src.split("?")[1] : "";
    const s = document.createElement("script");
    s.src = `${ROOT}assets/js/tune.js${q}`;
    document.head.appendChild(s);
  }

  document.addEventListener("DOMContentLoaded", () => {
    trackViewportWidth();
    initHoverPreviews();
    initLivingTiles();
    initHeader();
    initTheme();
    initChrome();
    initHeroPoints();
    initHome();
    initWork();
    initProject();
    initAbout();
    initPress();
    initExpertise();
    observeReveals();
    initTune();
  });
})();
