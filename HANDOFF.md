# Handoff — what the site still needs

**The live version of this list is the Google Doc "WEBSITE HANDOFF - Studio Schilp"
in Jaco's Drive (id `1xx6Rg6RQBJqZ3sp22Ad3xjxtsKiLXvlU76PrPUVMX3E`): Jaco writes
answers and Drive links straight into it from any device. Read that doc first;
this file is the repo snapshot of the same list.**

For any Claude Code session working on this repo. Read [CLAUDE.md](CLAUDE.md) first
for how the site works. This file lists the *content* gaps only: each item is a slot
Jaco can fill by dropping a file path, a Drive link, or a line of text into the chat.
Update this file when a slot is filled.

**House rules that always apply**
- Never auto-pick pictures: build a numbered, clickable picker and let Jaco choose
  (`use: 1, 5, 8 / cover: 5`).
- No em-dashes anywhere in site copy.
- If an original film file exists, self-host it and drop the YouTube/Vimeo embed.
  Every hosted film gets a poster cut from itself, and the build makes hover clips.
- New pictures always get new filenames, never reuse an old name (10 min media cache).
- After any data change: `python scripts/build_site_data.py`, commit, push.

## Empty pages waiting for material

| project | needs |
|---|---|
| `lidar-utrecht-60` | Everything: pictures, year, venue, credits. The first LiDAR Utrecht series at 60×60 cm, made before the 30×30 NFT series. Jaco said the material is coming. |
| `no-art-synergy` | Cover and pictures. NDSM Amsterdam 2022; Jaco said no photos exist, so this may stay text-only or get found material later. |
| `reports-from-other-continents` | Cover and pictures. Same situation. |

## Films still on YouTube/Vimeo (want the original files)

Self-host when Jaco supplies the original; hover previews for the YouTube ones are
already cut from downloaded copies, so only the main film needs replacing.

- `points-of-inaccessibility`, `rats-on-rafts-chapter-3`, `circuitry`,
  `orbit-festival`, `3fm-awards`, `uncloud-2019` (YouTube)
- `greenery-westergas`, `hku-graduation-bonanza-2020`,
  `caravaggio-centraal-museum-2018`, `ncca-nizhny-novgorod-2019` (Vimeo; also still
  need hover clips — Vimeo blocks downloads, so originals are the way)
- `byob-utrecht-citytour`: the YouTube film is **deleted** from the channel, so the
  page shows a dead player. Needs the original file, or the embed removed.

## Pages that could use gallery pictures

`uncloud-2019`, `hku-graduation-bonanza-2020`, `stedelijk-museum-schiedam-2021`,
`caravaggio-centraal-museum-2018`, `kunsthal-museumnacht-2017` (Jaco: only C4D
renders exist somewhere), `ncca-nizhny-novgorod-2019`.

## Open questions only Jaco can answer

- **Aquí y Ahora**: who photographed the Tequisquiapan works? Credits line has no
  photographer yet.
- **Uncloud 2022**: line-ups for De Nijverheid (2 July) and TivoliVredenburg
  (11 December). De Helling (13 May: Albert van Abbe, Novi_Sad, Giovanni Iacovella)
  and WAS. (8 Oct: Deena Abdelwahed b2b Simo Cell, Forest Drive West, Talismann,
  Jasmin) are known but not yet on the page.
- **About page**: still has no portrait photo of Jaco.
- **Category review**: Jaco wanted one pass over all 45 projects' categories
  "once the full picture of my work is there".

## Parked, not forgotten

- Uncloud 2016 ACU film: 4.6GB master downloaded earlier, timecode sheet was built;
  cutting it into a page is unfinished.
- Point-cloud research: Jaco wants the strands (Panorama, LiDAR Utrecht 30/60,
  Aquí y Ahora editions, Mexico City research, Buy or Burn) kept as separate bodies
  of work; a possible overview/research page was discussed, never decided.
- Glitch effect deck: Jaco collects visually interesting bugs as material for
  video synthesis. Before fixing a beautiful bug, write down the recipe.
