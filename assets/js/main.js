/* Jaco Schilp — site logic. No build step; reads /data/*.json at runtime. */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---- paths: works from any folder depth via <body data-root> ---- */
  const ROOT = document.body.getAttribute("data-root") || "";
  const asset = (p) => (p ? ROOT + p : p);

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
      toggle.addEventListener("click", () => links.classList.toggle("open"));
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
        entries.forEach((e) => {
          if (e.isIntersecting) {
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

  function mediaHTML(src, title, tall) {
    const cls = "card-media" + (tall ? " tall" : "");
    if (src) {
      return `<div class="${cls}"><img src="${asset(esc(src))}" alt="${esc(title)}" loading="lazy" onerror="window.__phErr(this)"></div>`;
    }
    return `<div class="${cls}"><div class="ph">${esc(title)}</div></div>`;
  }

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
    const ratios = imgs.map((im) => (im.naturalWidth ? im.naturalWidth / im.naturalHeight : 1.5));
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
    ratios.forEach((r, i) => {
      const full = narrow || pinned === 2
        ? row.length >= 2
        : row.length >= 3 || (row.length === 2 && sum >= 2.4);
      if (row.length && full) { rows.push(row); row = []; sum = 0; }
      row.push(i); sum += r;
    });
    if (row.length) {
      // A lone leftover would blow up to full width; give it company instead.
      if (rows.length && row.length === 1 && ratios[row[0]] < 2) rows[rows.length - 1].push(row[0]);
      else rows.push(row);
    }
    // Rows may crop at most 10% to sit closer to a shared height. Each row's
    // ratios are nudged toward the median row, clamped to 0.9..1.1, and the
    // nudge is applied through aspect-ratio + object-fit so the crop is even.
    const sums = rows.map((list) => list.reduce((a, i) => a + ratios[i], 0));
    const perImg = rows.map((list, k) => sums[k] / list.length);
    const median = [...perImg].sort((a, b) => a - b)[Math.floor(perImg.length / 2)];
    el.textContent = "";
    rows.forEach((list, k) => {
      // A poster or graphic in the row means the whole row keeps true proportions.
      const hasNocrop = list.some((i) => imgs[i].dataset.nocrop);
      const f = hasNocrop ? 1 : Math.min(1.1, Math.max(0.9, (median * list.length) / sums[k]));
      const d = document.createElement("div");
      d.className = "grow";
      list.forEach((i) => {
        const shown = ratios[i] * f;
        imgs[i].style.flexGrow = shown.toFixed(4);
        if (Math.abs(f - 1) > 0.01) {
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
  function videoEmbedHTML(src) {
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
      return `<div class="project-video"><iframe src="https://www.youtube.com/embed/${m[1]}" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
    }
    m = s.match(/instagram\.com\/(?:reel|p|tv)\/([\w-]+)/);
    if (m) {
      return `<div class="project-video-ig"><iframe src="https://www.instagram.com/reel/${m[1]}/embed/" scrolling="no" allowtransparency="true" loading="lazy"></iframe></div>`;
    }
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(s)) {
      return `<video class="project-video-file" controls preload="metadata" playsinline src="${asset(esc(s))}"></video>`;
    }
    return "";
  }

  function cardHTML(p, i) {
    const sub = [p.year, p.category].filter(Boolean).join(" · ");
    return `
      <a class="card reveal" href="${ROOT}project.html?p=${encodeURIComponent(p.slug)}">
        ${mediaHTML(p.cover, p.title, false)}
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
    const list = feat.length ? feat : projects.slice(0, 4);
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

    const render = (cat) => {
      const list = cat === "All" ? projects : projects.filter((p) => catsOf(p).includes(cat));
      mount.innerHTML = list.map(cardHTML).join("");
      observeReveals(mount);
    };
    render("All");

    if (filtersEl) {
      filtersEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".filter");
        if (!btn) return;
        $$(".filter", filtersEl).forEach((b) => b.setAttribute("aria-pressed", "false"));
        btn.setAttribute("aria-pressed", "true");
        render(btn.dataset.cat);
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
    document.title = `${p.title} · Jaco Schilp`;

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
    const creditsHTML = p.credits ? `<p style="color:var(--muted);font-size:0.9rem">${esc(p.credits)}</p>` : "";
    const bodyHTML = stHTML
      ? `<div class="project-body has-statement">
          <div class="project-info">${infoHTML}${creditsHTML}</div>
          <aside class="project-statement">${stHTML}</aside>
        </div>`
      : `<div class="project-body">${infoHTML}${creditsHTML}</div>`;

    // Pictures listed in a project's "nocrop" (posters, graphic work) always
    // show complete; the layout may never trim them.
    const nocrop = new Set(p.nocrop || []);
    const gallery = (p.images || [])
      .map((src) => `<img class="reveal"${nocrop.has(src) ? ` data-nocrop="1"` : ""} src="${asset(esc(src))}" alt="${esc(p.title)}" loading="lazy" onerror="window.__phErr(this)">`)
      .join("");

    // First video runs full width; any further clips sit in the gallery columns like pictures.
    const vids = (p.videos || []).map(videoEmbedHTML).filter(Boolean);
    const mainVideo = vids[0] || "";
    const extraVideos = vids.slice(1).join("");

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
      ${p.cover ? `<div class="wrap"><img class="reveal" src="${asset(esc(p.cover))}" alt="${esc(p.title)}" style="width:100%;background:#e9e7e3" onerror="window.__phErr(this)"></div>` : ""}
      <div class="wrap">
        ${bodyHTML}
        ${mainVideo ? `<div class="project-videos is-main">${mainVideo}</div>` : ""}
        ${extraVideos ? `<div class="project-clips">${extraVideos}</div>` : ""}
        ${gallery ? `<div class="project-gallery"${p.galleryRows ? ` data-rows="${esc(String(p.galleryRows))}"` : ""}>${gallery}</div>` : ""}
        <nav class="project-nav">
          <a href="${ROOT}project.html?p=${encodeURIComponent(prev.slug)}">← ${escTitle(prev.title)}</a>
          <a href="${ROOT}project.html?p=${encodeURIComponent(next.slug)}">${escTitle(next.title)} →</a>
        </nav>
      </div>`;
    observeReveals(mount);

    // Lay out the gallery once the pictures report their proportions, and on resize.
    const gal = mount.querySelector(".project-gallery");
    if (gal) {
      const imgs = [...gal.querySelectorAll("img")];
      let left = imgs.length;
      const done = () => { if (--left <= 0) layoutGallery(gal); };
      imgs.forEach((img) => {
        img.loading = "eager";
        if (img.complete && img.naturalWidth) done();
        else { img.addEventListener("load", done, { once: true }); img.addEventListener("error", done, { once: true }); }
      });
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
            <div class="press-head">
              <span class="press-outlet">${esc(it.outlet)}</span>
              <span class="press-date">${esc(it.date || "")}</span>
            </div>
            <p class="press-title">${escTitle(it.title)}</p>
            ${it.quote ? `<p class="press-quote">“${esc(it.quote)}”</p>` : ""}
            ${it.image ? `<img class="press-clip" src="${asset(esc(it.image))}" alt="${esc(it.outlet)}: ${esc(it.title)}" loading="lazy" onerror="window.__phErr(this)">` : ""}
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
    initHeader();
    initChrome();
    initHeroPoints();
    initHome();
    initWork();
    initProject();
    initAbout();
    initPress();
    observeReveals();
  });
})();
