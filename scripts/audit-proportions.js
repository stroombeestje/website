/* Proportion audit. Paste into the console (or run via the preview pane)
   on any page at TWO window widths (e.g. 3840 and 1920), collect the two
   outputs, and compare: every value's ratio small/large should be close to
   the --ts step for that width (0.7 at 1920 vs 3840; bar items 0.6).
   A ratio near 1.0 means the element ignores the proportional scale and
   needs "* var(--ts, 1)" in its CSS. Claude runs this cycle after any
   change to sizes; see CLAUDE.md. */
(() => {
  const SELS = [
    ".brand", ".nav-links a", ".eyebrow", ".lead", ".display",
    ".project-by", ".fact-label", ".fact-value", ".project-info p",
    ".project-statement .statement", ".credit-role", ".credit-name",
    ".credit-note", ".project-nav a", ".story-counter", ".story-hint",
    ".rel-kicker", ".rel-title", ".kit-quote p", ".kit-note",
    ".kit-actions a", ".insight-qa .q", ".insight-source",
    ".press-outlet", ".press-date", ".press-title", ".press-quote",
    ".press-cta", ".work-intro", ".filter", ".work-search input",
    "#work-count", ".card-title", ".card-cat", ".home-works-head",
    ".home-more", ".home-about-text", ".home-about h2", ".detail-list li",
    ".services-list li", ".footer-inner", ".pc-label", ".pillar h2",
    ".pillar-insight", ".ph",
  ];
  const out = { width: innerWidth, font: {}, box: {} };
  SELS.forEach((s) => {
    const el = document.querySelector(s);
    if (el) out.font[s] = parseFloat(getComputedStyle(el).fontSize);
  });
  const nav = document.querySelector(".nav");
  if (nav) out.box[".nav height"] = nav.getBoundingClientRect().height;
  const wrap = document.querySelector("main .wrap, .wrap");
  if (wrap) out.box["gutter"] = parseFloat(getComputedStyle(wrap).paddingLeft);
  ["#featured-grid", "#work-grid"].forEach((s) => {
    const g = document.querySelector(s);
    if (g) out.box[s + " gap"] = parseFloat(getComputedStyle(g).columnGap);
  });
  const grow = document.querySelector(".project-gallery .grow");
  if (grow) out.box["gallery gap"] = parseFloat(getComputedStyle(grow).columnGap);
  const rel = document.querySelector(".rel-card");
  if (rel) out.box["rel-card w"] = rel.getBoundingClientRect().width;
  return out;
})();
