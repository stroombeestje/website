
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

**THE AUDIT IS BLIND ON THE HOME — do not read CLEAN as "the home is fine."**
The script skips every element inside `.home-view, .home-works, .home-about,
.home-hero`, and skips any font under 17px. At 1920 eight of the home's nine
type sizes are under 17px, so the page Jaco complains about most is the one
page the audit never checks. Measure the home by hand: read the computed
font-size of the eyebrow, tagline, card title and footer at 3840 and at 1920
and compare the ratios to each other, not just to --ts. In Aug 2026 they were
0.50, 0.61, 0.69 and 0.92 — the hand-picked floors formed a DIFFERENT ramp
from the 4K one, and two pairs inverted (the eyebrow rendered smaller than the
footer, the nav smaller than the card title). A floor set is only correct if
every size keeps its 4K ORDER and roughly its 4K spacing.

## The home is anchored to the viewport (Aug 2026)

Never centre the home statement in leftover flex space again. Leftover space
shrinks faster than the screen does, so a centred block rides upward on every
smaller laptop: it measured 30% of the screen at 4K, 25% at 1920 and 21% at
1366, which walked it into the middle of the point cloud. The hero is
`flex: 0 0 auto` with `padding-top: calc(22dvh - var(--bar-h))`, and
`.home-works` carries `margin-top: auto` so the slack collects in the gap
ABOVE the works row. The eyebrow then holds 22.0-22.1% of the screen from
3840 down to 1366, and the works row lands at 61-63%.

Two consequences worth keeping in mind. A measure written in `ch` follows the
FLOORED font, so it grows as a share of the screen exactly when the floor
engages — the tagline reached 24.3% of screen width at 1920 against 19.9% on
the wall. Cap such a measure by screen share too: `min(34ch, 22vw)`. And the
works row is sized by WIDTH while this budget is height, so a short wide
window (1366x700) still rides up to 54%; the fix there is to pick the card
count from the window's aspect ratio rather than fixing it at six.

## The cloud fades by DENSITY, never by opacity

`.page-home .hero-canvas` must not carry a vertical opacity mask. There used
to be one (`black 34% -> transparent 62%`) and it was wrong twice over: its
midpoint sat at 48% while the cloud's own centre is `CY = H * 0.47`, so the
ramp lay straight across the densest band and discarded half the ink, and
dimming a dense dot field uniformly reads as a grey GRADIENT rather than dust
thinning out. Jaco saw both — "it cuts the middle of the pointcloud" and "now
i see a gradient" are the same bug from two angles. It was invisible at 4K
only because the opaque works row starts at 51% there and covered the ugly
part of the ramp; every smaller screen exposed it.

`draw()` in main.js drops points instead, on a stable per-point threshold
(`pt.k`, assigned once in `build()` so the thinning does not flicker frame to
frame). Every surviving dot keeps full ink and the mass dissolves into grain.
The stops are dials: `--pc-fade0` (0.55) and `--pc-fade1` (0.95). Read them
ONCE per frame — `tv()` calls getComputedStyle, and inside the 9000-point
loop that is 18,000 calls a frame. Only the horizontal mask remains, to keep
the cloud off both margins.
