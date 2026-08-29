/* Proportion audit — FULL-DOM version. Run in the console on any page served
   locally (it loads every page itself in hidden iframes at 3840 and 1920 wide
   and compares computed styles pairwise).

   The law: every size must scale by --ts/--ui, which are LINEAR — exactly
   viewport / 3840, so 0.5 at 1920 (set by main.js; the CSS media steps are
   only a first-paint/no-JS fallback). A value whose small/large ratio lands
   near 1.0 ignores the scale and needs "* var(--ts, 1)" wrapped around it
   in the CSS (or the inline style).

   THE CLAMP TRAP (the bug this audit exists to catch): clamp(2rem, 4vw, 3rem)
   maxes out below 4K widths — at both 3840 and 1920 the vw middle exceeds the
   rem max, so both screens get the SAME pixels and the ratio is 1.0. A clamp
   is only proportional when wrapped: calc(var(--ts, 1) * clamp(...)).

   A selector list is not enough: audit EVERY element (fonts, paddings,
   margins, gaps) plus element geometry, and include inline styles in the
   HTML files. Exempt: the tune panel (dev tool), the phone nav-toggle and
   its spans (hidden on desktop), the vh-tuned one-view home (17px base is
   deliberate), and ±1-line text-wrap height differences. */
(async () => {
  /* Compared at 3840 vs 2560, NOT 1920: below roughly 2200px the readable
     type floor (max(14px, ...)) takes over and font ratios flatten toward 1.0
     by design. At 2560 no floor is active yet, so every ratio must still be
     the honest --ts step (0.67) and a 1.0 there is a real bug. */
  const BIG = [3840, 2160], SMALL = [2560, 1440], EXPECTED = 0.67;
  const PAGES = ["index.html", "work.html", "project.html?p=ka-an", "press.html", "about.html", "expertise.html"];
  const PROPS = ["fontSize", "paddingTop", "paddingBottom", "marginTop", "marginBottom", "columnGap", "rowGap"];
  const SKIP = /tune|nav-toggle/;
  const loadFrame = (url, w, h) => new Promise((res) => {
    const f = document.createElement("iframe");
    f.style.cssText = `position:fixed;left:-99999px;top:0;width:${w}px;height:${h}px;border:0;visibility:hidden;`;
    f.src = url + (url.includes("?") ? "&" : "?") + "audit=" + w;
    // generous settle: measuring before webfonts and the grid script finish
    // reports nonsense (a full-width nav, margins at their unstyled default)
    f.onload = () => setTimeout(() => res(f), 1600);
    document.body.appendChild(f);
  });
  const keyOf = (el) => {
    let k = el.tagName.toLowerCase();
    if (el.className && typeof el.className === "string") k += "." + el.className.trim().split(/\s+/).slice(0, 2).join(".");
    return k;
  };
  const measure = (f) => {
    const d = f.contentDocument, W = f.contentWindow, out = {};
    d.querySelectorAll("body *").forEach((el) => {
      const k = keyOf(el);
      if (out[k] || SKIP.test(k) || el.closest('[class*="tune"],[id*="tune"],.nav-toggle')) return;
      // the one-view home is tuned in vh so it always fits one screen: its
      // vertical spacing tracks viewport HEIGHT, not --ts, and is exempt
      if (el.closest(".home-view, .home-works, .home-about, .home-hero")) return;
      const cs = W.getComputedStyle(el);
      if (cs.display === "none") return;
      const rec = {};
      PROPS.forEach((p) => { const v = parseFloat(cs[p]); if (isFinite(v) && Math.abs(v) > 5) rec[p] = v; });
      if (Object.keys(rec).length) out[k] = rec;
    });
    return out;
  };
  const report = {};
  for (const p of PAGES) {
    const [big, small] = await Promise.all([loadFrame(p, BIG[0], BIG[1]), loadFrame(p, SMALL[0], SMALL[1])]);
    await new Promise((r) => setTimeout(r, 600));
    const B = measure(big), S = measure(small), dev = {};
    for (const k in B) {
      if (!(k in S)) continue;
      for (const prop in B[k]) {
        if (!(prop in S[k])) continue;
        const bv = B[k][prop], sv = S[k][prop];
        if (bv < 8 && sv < 8) continue;
        // the vh-tuned one-view home keeps its deliberate 17px base font
        if (p === "index.html" && prop === "fontSize" && Math.round(bv) === 17) continue;
        /* A font already sitting on its readable floor cannot scale further —
           that is the floor working. Only type still above every floor (17px+)
           is held to the proportional law. Spacing is always held to it. */
        if (prop === "fontSize" && sv <= 17) continue;
        const ratio = sv / bv;
        if (ratio > EXPECTED + 0.18) (dev[k] = dev[k] || {})[prop] = `${bv.toFixed(0)}->${sv.toFixed(0)} r${ratio.toFixed(2)}`;
      }
    }
    // geometry pass: fixed-px widths and horizontal overflow
    const bEls = [...big.contentDocument.querySelectorAll("body *")];
    const sEls = [...small.contentDocument.querySelectorAll("body *")];
    for (let i = 0; i < Math.min(bEls.length, sEls.length); i++) {
      const be = bEls[i], se = sEls[i];
      if (be.tagName !== se.tagName || SKIP.test(keyOf(be)) || be.closest('[class*="tune"],[id*="tune"],.nav-toggle')) continue;
      /* Only real layout blocks: an inline label's width is its text, which
         stops shrinking with the floor and is not a layout bug. */
      const disp = big.contentWindow.getComputedStyle(be).display;
      if (disp === "inline" || disp === "inline-block") continue;
      // a paragraph's width is its measure (ch units), which follows the
      // floored font rather than --ts; containers are what must scale
      if (be.tagName === "P" || be.closest(".home-view")) continue;
      const br = be.getBoundingClientRect(), sr = se.getBoundingClientRect();
      if (br.width > 400 && sr.width / br.width > EXPECTED + 0.18) (dev[keyOf(be)] = dev[keyOf(be)] || {}).width = `${br.width.toFixed(0)}->${sr.width.toFixed(0)}`;
    }
    const sd = small.contentDocument.documentElement;
    if (sd.scrollWidth > sd.clientWidth + 2) dev.PAGE_OVERFLOWS = `${sd.scrollWidth} > ${sd.clientWidth}`;
    if (Object.keys(dev).length) report[p] = dev;
    big.remove(); small.remove();
  }
  console.log(Object.keys(report).length ? report : "CLEAN: no deviants on any page");
  return report;
})();
