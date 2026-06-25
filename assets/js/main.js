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
    return `
      <a class="card reveal" href="${ROOT}project.html?p=${encodeURIComponent(p.slug)}">
        ${mediaHTML(p.cover, p.title, false)}
        <div class="card-meta">
          <span class="card-title">${esc(p.title)}</span>
          <span class="card-sub">${esc(p.year || "")}</span>
        </div>
        <div class="card-cat">${esc(p.category || "")}</div>
      </a>`;
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

    const cats = ["All", ...Array.from(new Set(projects.map((p) => p.category).filter(Boolean)))];
    if (filtersEl) {
      filtersEl.innerHTML = cats
        .map(
          (c, i) =>
            `<button class="filter" data-cat="${esc(c)}" aria-pressed="${i === 0}">${esc(c)}</button>`
        )
        .join("");
    }

    const render = (cat) => {
      const list = cat === "All" ? projects : projects.filter((p) => p.category === cat);
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
    document.title = `${p.title} — Jaco Schilp`;

    const fact = (label, val) =>
      val ? `<div><div class="fact-label">${esc(label)}</div><div class="fact-value">${esc(val)}</div></div>` : "";

    const paras = (txt = "") =>
      txt.split("\n").filter((l) => l.trim()).map((l) => `<p>${esc(l)}</p>`).join("");

    const gallery = (p.images || [])
      .map((src) => `<img class="reveal" src="${asset(esc(src))}" alt="${esc(p.title)}" loading="lazy" onerror="window.__phErr(this)">`)
      .join("");

    const videos = (p.videos || []).map(videoEmbedHTML).filter(Boolean).join("");

    const prev = projects[(idx - 1 + projects.length) % projects.length];
    const next = projects[(idx + 1) % projects.length];

    mount.innerHTML = `
      <div class="wrap project-head">
        <p class="eyebrow">${esc(p.category || "")}</p>
        <h1 class="display">${esc(p.title)}</h1>
        <div class="project-facts">
          ${fact("Year", p.year)}
          ${fact("Role", p.role)}
          ${fact("Location", p.location)}
          ${p.link ? `<div><div class="fact-label">Link</div><div class="fact-value"><a href="${esc(p.link)}" target="_blank" rel="noopener" style="border-bottom:1px solid var(--line)">Visit ↗</a></div></div>` : ""}
        </div>
      </div>
      ${p.cover ? `<div class="wrap"><img class="reveal" src="${asset(esc(p.cover))}" alt="${esc(p.title)}" style="width:100%;background:#e9e7e3" onerror="window.__phErr(this)"></div>` : ""}
      <div class="wrap">
        <div class="project-body">${paras(p.description)}${p.credits ? `<p style="color:var(--muted);font-size:0.9rem">${esc(p.credits)}</p>` : ""}</div>
        ${videos ? `<div class="project-videos">${videos}</div>` : ""}
        ${gallery ? `<div class="project-gallery">${gallery}</div>` : ""}
        <nav class="project-nav">
          <a href="${ROOT}project.html?p=${encodeURIComponent(prev.slug)}">← ${esc(prev.title)}</a>
          <a href="${ROOT}project.html?p=${encodeURIComponent(next.slug)}">${esc(next.title)} →</a>
        </nav>
      </div>`;
    observeReveals(mount);
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
            <p class="press-title">${esc(it.title)}</p>
            ${it.quote ? `<p class="press-quote">“${esc(it.quote)}”</p>` : ""}
            ${it.image ? `<img class="press-clip" src="${asset(esc(it.image))}" alt="${esc(it.outlet)} — ${esc(it.title)}" loading="lazy" onerror="window.__phErr(this)">` : ""}
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
    initHome();
    initWork();
    initProject();
    initAbout();
    initPress();
    observeReveals();
  });
})();
