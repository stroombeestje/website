
## The proportion law (never break this again)

The design is tuned on Jaco's 4K screen. Smaller screens must show the SAME
PROPORTIONS, not the same pixels. Two root variables step down with viewport
width: `--ts` (type, air, gaps, gutters) and `--ui` (bar, brand, menu).

**Every new CSS size — font-size, fixed gap, fixed width — MUST be wrapped:**
`font-size: calc(0.8rem * var(--ts, 1))` (or `--ui` for header chrome).
A bare `font-size: 0.8rem` will render the same pixels on a laptop as on the
4K wall and look enormous there. The phone media blocks (max-width: 600px)
are exempt: their sizes are already phone-tuned.

**After ANY size change, run the audit cycle:** open the preview, load
[scripts/audit-proportions.js](scripts/audit-proportions.js) style measurements at 3840 wide and at 1920 wide
(iframe trick: load each page in a hidden full-size iframe and read computed
font sizes), and compare. Every ratio must land near the --ts step (0.7 at
1920), never near 1.0. Fix and re-run until the deviant list is empty.
