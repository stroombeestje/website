/* The tune panel. Loaded by main.js only during a tuning session
   (?tune on any URL starts one; the panel's close button ends it).
   Every dial writes a CSS custom property the stylesheet multiplies
   against its shipped values, so the real pages change live. Nothing
   here ships to a visitor and nothing is saved to the site: Copy puts
   the chosen values on the clipboard to be baked into the CSS. */
(function () {
  // [var, label, min, max, step, shipped default, pages]
  // Every page shows only its own dials; "all" rides along everywhere.
  // A dial's saved value still applies on every page it touches, shown or not.
  const ALL_DIALS = [
    ["--x-base", "Everything", 0.8, 1.3, 0.01, 1, "all"],
    ["--x-width", "Page width", 0.5, 2.5, 0.01, 1, "all"],
    ["--x-gutter", "Side margins", 0.3, 2, 0.01, 1, "all"],
    ["--x-brand", "Bar: Studio Schilp", 0.7, 3, 0.01, 2.2, "all"],
    ["--x-nav", "Bar: menu links", 0.7, 2.8, 0.01, 2, "all"],
    ["--x-bar", "Bar: height", 0.7, 2.4, 0.01, 1.68, "all"],
    ["--x-title", "Titles", 0.6, 1.6, 0.01, 1.02, ["work", "project", "about", "press", "expertise"]],
    ["--x-text", "Reading text", 0.8, 2, 0.01, 1.58, ["project", "about", "press", "expertise", "work"]],
    ["--x-label", "Cards & labels", 0.8, 2, 0.01, 1.36, ["work", "project", "press"]],
    ["--x-credits", "Credits line", 0.7, 2, 0.01, 1.6, ["project"]],
    ["--x-space", "Air between blocks", 0.3, 1.8, 0.01, 1.36, ["work", "project", "about", "press", "expertise"]],
    ["--x-textgap", "Text to gallery", -0.5, 1.5, 0.01, 0, ["project"]],
    ["--x-gap", "Grid gaps", 0.2, 2, 0.01, 1, ["home", "work", "project", "press"]],
    ["--regie-strip", "Story: strip height", 0.06, 0.3, 0.01, 0.13, ["project"]],
    ["--regie-dim", "Story: strip light", 0.1, 1, 0.01, 0.34, ["project"]],
    ["--regie-vh", "Story: scroll per beat", 25, 90, 1, 35, ["project"]],
    ["--pc-density", "Cloud: points", 0.3, 4, 0.05, 2.5, ["home"]],
    ["--pc-size", "Cloud: dot size", 0.5, 4, 0.05, 2.25, ["home"]],
    ["--pc-speed", "Cloud: speed", 0, 6, 0.05, 3, ["home"]],
    ["--pc-trail", "Cloud: trail fade", 0.01, 0.3, 0.01, 0.03, ["home"]],
    ["--pc-scale", "Cloud: size", 0.5, 2.5, 0.05, 1.6, ["home"]],
  ];
  const file = (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "");
  const page = !file || file === "index" ? "home" : file;
  const DIALS = ALL_DIALS.filter((d) => d[6] === "all" || d[6].includes(page));
  const root = document.documentElement;
  let vals = {};
  try { vals = JSON.parse(localStorage.getItem("siteTuneVals") || "{}"); } catch (_) {}

  const regieHeight = () => {
    const v = vals["--regie-vh"];
    const reg = document.querySelector(".regie");
    const c = document.querySelector(".story-counter");
    if (v && reg && c) {
      const beats = parseInt((c.textContent.split("—")[1] || "").trim(), 10);
      if (beats) reg.style.height = `${beats * v}vh`;
    }
  };
  const applyVar = (k, v) => {
    root.style.setProperty(k, String(v));
    if (k === "--regie-vh") regieHeight();
    window.dispatchEvent(new Event("resize"));
  };
  // the story stage builds after the data arrives; keep trying briefly
  let tries = 0;
  const late = setInterval(() => {
    regieHeight();
    if (++tries > 12 || document.querySelector(".regie")) clearInterval(late);
  }, 500);

  const fmt = (d, v) =>
    d[0] === "--regie-vh" ? `${v}vh` : d[0] === "--pc-trail" ? Number(v).toFixed(2) : `${Math.round(v * 100)}%`;

  const panel = document.createElement("div");
  panel.id = "tune-panel";
  panel.style.cssText =
    "position:fixed;right:14px;bottom:14px;z-index:99999;background:#f7f6f4;border:1px solid #d8d6d1;" +
    "box-shadow:0 6px 30px rgba(20,20,20,0.18);padding:14px 16px 12px;width:250px;font:12px/1.5 'Open Sans',sans-serif;color:#141414;" +
    "max-height:calc(100vh - 40px);overflow-y:auto;";
  panel.innerHTML =
    `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
      <strong style="letter-spacing:0.08em;text-transform:uppercase;font-size:11px">Tune · ${page}</strong>
      <button data-close style="all:unset;cursor:pointer;font-size:14px;padding:0 2px" title="Close and undo the preview">&#10005;</button>
    </div>` +
    DIALS.map(
      (d, i) => `<label style="display:block;margin-bottom:7px">
        <span style="display:flex;justify-content:space-between"><span>${d[1]}</span><span data-out="${i}" style="color:#8a8a86;font-variant-numeric:tabular-nums"></span></span>
        <input data-dial="${i}" type="range" min="${d[2]}" max="${d[3]}" step="${d[4]}" style="width:100%;accent-color:#141414">
      </label>`
    ).join("") +
    `<div style="display:flex;gap:8px;margin-top:10px">
      <button data-copy style="all:unset;cursor:pointer;border:1px solid #141414;padding:4px 10px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase">Copy for Claude</button>
      <button data-reset style="all:unset;cursor:pointer;border:1px solid #d8d6d1;padding:4px 10px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#8a8a86">Reset</button>
    </div>`;
  document.body.appendChild(panel);

  const sliders = panel.querySelectorAll("[data-dial]");
  const outs = panel.querySelectorAll("[data-out]");
  const sync = () => {
    DIALS.forEach((d, i) => {
      const v = vals[d[0]] !== undefined ? vals[d[0]] : d[5];
      sliders[i].value = v;
      outs[i].textContent = fmt(d, v);
    });
  };
  sync();

  sliders.forEach((sl, i) => {
    sl.addEventListener("input", () => {
      const d = DIALS[i];
      const v = parseFloat(sl.value);
      if (v === d[5]) delete vals[d[0]];
      else vals[d[0]] = v;
      outs[i].textContent = fmt(d, v);
      localStorage.setItem("siteTuneVals", JSON.stringify(vals));
      applyVar(d[0], v);
    });
  });

  panel.querySelector("[data-copy]").addEventListener("click", (e) => {
    const pretty = Object.entries(vals)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    navigator.clipboard.writeText(pretty || "(everything at default)").then(() => {
      e.target.textContent = "Copied ✓";
      setTimeout(() => (e.target.textContent = "Copy for Claude"), 1400);
    });
  });

  const clearAll = () => {
    ALL_DIALS.forEach((d) => root.style.removeProperty(d[0]));
    const reg = document.querySelector(".regie");
    if (reg) reg.style.height = "";
    vals = {};
    localStorage.removeItem("siteTuneVals");
    sync();
    window.dispatchEvent(new Event("resize"));
  };
  panel.querySelector("[data-reset]").addEventListener("click", clearAll);
  panel.querySelector("[data-close]").addEventListener("click", () => {
    clearAll();
    localStorage.removeItem("siteTune");
    panel.remove();
  });
})();
