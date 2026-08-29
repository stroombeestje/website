
## Two rooms: the light and dark themes

Light (off-white paper) is the default and the design. Dark is the same site
shown as the dark room the work actually lives in, one click away from the
switch in the bar. Rules:

- **Never hardcode a colour.** Use the tokens: `--bg`, `--fg`, `--muted`,
  `--line`, `--tile` (the frame a picture loads into), `--cloud-bg` and
  `--cloud-ink`. For an in-between grey use
  `color-mix(in srgb, var(--fg) 74%, var(--bg))` so it follows the room. A
  literal like `#4a4a47` reads fine on paper and disappears in the dark.
- **The cloud is repainted, not inverted.** main.js reads `--cloud-bg` and
  `--cloud-ink`, and rebuilds on the `themechange` event.
- **Every page's `<head>` carries a tiny inline script** that applies the
  stored choice before first paint. Without it a returning visitor sees the
  wrong room flash past. A new page needs that line too.
- **Check contrast in BOTH rooms** after any colour change (4.5:1 for text,
  3:1 for large). When measuring, skip elements that carry their own
  background, such as the pressed filter chip, and note that `color-mix()`
  computes to `color(srgb ...)`, whose values are 0-1 and not 0-255.

## The proportion law (never break this again)

The design is tuned on Jaco's 4K screen. Smaller screens must show the SAME
PROPORTIONS, not the same pixels: a laptop is a scaled-down photo of the wall,
with the same whitespace fraction. Two root variables carry the scale: `--ts`
(type, air, gaps, gutters) and `--ui` (bar, brand, menu). Since Aug 2026 they
are LINEAR — main.js sets both to exactly viewport / 3840 (floored at 0.35,
phones under 600px excluded); the media steps in style.css are only a
first-paint/no-JS fallback. Do not reintroduce a softer step like 0.7 at
half-width: it reads as "the laptop version is 40% fatter and has less air",
which is the bug Jaco kept reporting.

**The readable floor (Aug 2026, after an outside review).** Pure proportion
made laptop type unreadable: at 1512 the tagline was 8.6px and the footer
5.1px. So TYPE — and only type — is written as
`font-size: max(calc(14px * var(--fl, 1)), <the proportional value>)`.
Whitespace, gaps and margins stay purely proportional; only the letters stop
shrinking. `--fl` is 1 on desktop and 0 on phones, where max() then yields the
phone-tuned size, so phone blocks keep working untouched. Wide screens are
unaffected: at 2560 and above every floor is below the proportional value, so
the 4K wall renders exactly as tuned. When a floor makes text bigger inside a
box whose width still scales (the press cards), give that box the same floor
or it overflows.

**Every new CSS size — font-size, fixed gap, fixed width, margin, padding —
MUST be wrapped:** `font-size: calc(0.8rem * var(--ts, 1))` (or `--ui` for
header chrome). A bare `font-size: 0.8rem` will render the same pixels on a
laptop as on the 4K wall and look enormous there. The phone media blocks
(max-width: 600px) are exempt: their sizes are already phone-tuned.

**THE CLAMP TRAP (this is how it broke in Aug 2026):** `clamp(2rem, 4vw, 3rem)`
is NOT proportional. Its vw middle already exceeds the rem max at 1920, so 4K
and laptop both get the max — identical pixels, ratio 1.0. Every clamp must be
wrapped whole: `calc(var(--ts, 1) * clamp(2rem, 4vw, 3rem))`. Same for rem
max-widths on text columns (`max-width: calc(46rem * var(--ts, 1))`).

**Inline styles count too.** Sizes in `style="..."` attributes in the HTML
files (work.html, expertise.html section paddings, about.html contact block)
need the same `calc(var(--ts,1) * ...)` wrap as the stylesheet.

**After ANY size change, run the audit cycle:** with the preview server up,
run [scripts/audit-proportions.js](scripts/audit-proportions.js) in the browser console. It loads every
page in hidden iframes at 3840 and 1920 wide and compares EVERY element's
computed fonts, paddings, margins, gaps and widths pairwise — a selector list
is not enough, sweep the full DOM. Compare at 3840 vs 2560, where no floor is
active yet: every ratio must land near the --ts value (0.67), never near 1.0.
Below ~2200px font ratios legitimately flatten toward 1.0 as the readable
floor takes over — that is the floor working, not a bug; spacing ratios must
still track --ts there. Fix and re-run until the deviant list
is empty. Canvas/JS drawing counts too: anything drawn in pixel units (dot
sizes, cursor radii) scales with the viewport the same way.
Known-clean exceptions the script already skips: the tune panel (fixed-px dev
tool), the phone nav-toggle and its spans (hidden on desktop), the vh-tuned
one-view home (its 17px base is deliberate), and paragraph heights that differ
by one wrapped line.
