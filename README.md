# Code Buddy app (prototype)

Offline-first, phone-first PWA. Plain HTML/CSS/ES-module JS, no framework, no build step for the UI.
It renders only what is in `../content/`; it never fills in code values.

Live (GitHub Pages): https://mascough.github.io/Code-Buddy/ — this repo holds the static build only (shell + `data/content.json`); the build tools and content sources live in the Code Buddy workspace. Icons are SVG-only (`icons/icon.svg`).

## Rebuild content

Run after any change under `../content/nys/` or `../content/clayton/` (or a new jurisdiction folder):

```
npm install            # once: ajv (validation) and playwright-core (proof script)
node tools/build-content.mjs
```

The script validates every `content/<jurisdiction>/*.json` against `../schema.json`, prints
PASS/FAIL per file with the owning bot (nys = Codebook, clayton = Clayton Desk), plus cross-file
warnings (missing refs, duplicate ids, local notes with no statewide item). It maps legacy short
phase ids (`framing`/`framing-structure`, `footing`/`foundation`/`foundation-slab`, `general`/`pre-permit-site`) to the 11 canonical phases and always
emits all 11, even when a phase has 0 items. Invalid files are skipped, never fixed; nothing
under `../content/` is edited. Output: `data/content.json` (merged bundle + `report`). The report
is also shown in the app footer.

## Run locally

```
node tools/serve.mjs 8765     # or: python3 -m http.server 8765
```

Open http://localhost:8765/. After the first load, the service worker (`sw.js`) has precached the shell
and `data/content.json`, so reloads work offline. It serves from cache and refreshes in the background,
so new content shows on the second load after a rebuild. When you change shell files, bump `CACHE` in `sw.js`.

## Proof / smoke test

```
node tools/proof-field.mjs http://localhost:8765/
```

Uses system Chrome (`/usr/bin/google-chrome`, override with `CHROME=`) at 390x844. Clicks through all 11 phases, checks
every phase has items with one "More info" button each, checks tap targets (phase buttons, Design criteria, search,
"More info"/"Hide info", table toggles) are ≥48px, expands and collapses "More info" on Floor joist spans, checks the
`code-buddy-v7` cache, reloads offline, and writes `../screenshots-proof/14-field-checklist-collapsed.png` and
`15-field-checklist-more-info.png`. Exits non-zero on any failure or page error. (`tools/proof.mjs` is the older v4 run.)

`node tools/make-icons.mjs` re-renders the PNG icons from `icons/icon.svg`.

## Field-checklist UI

- Each phase is a short checklist: one row per item with the title, small chips (tables, local notes, "to verify"
  count), and a high-contrast **More info** button (≥48px) that turns into a yellow **Hide info** when open.
  Tapping the row title also toggles it. No summary paragraphs on collapsed rows.
- The **More info** panel shows, in order: **Code references** (deduped section pills and black `Table …` pills),
  **What to look for** (item summary, then each requirement with its status badge — OK / Verify / Confirm locally —
  section pill, text clamped to 3 lines with a "Full text" toggle, status reason, callouts and full citation),
  **Tables** (tap to open; sticky header and first column, source table number, citation, units, footnotes),
  **Village of Clayton local notes**, and linked **Design criteria**, with a second **Hide info** button at the end.
- Search also matches code section and table numbers (e.g. `R502.3.1`).

## How the data joins (per ../schema.md)

- The app always shows 11 canonical phases (see `../schema.md`). Default tab is Phase 2, Framing and structural.
- A 2-column grid of compact numbered phase buttons (1–11) sits under the compact sticky search bar and is not sticky, so the checklist has full reading space when scrolling. Design criteria is a button directly below the grid.
- Items come from the statewide pack; local notes join on (canonical) `phase` + `itemId`.
- Phases with no statewide items show an empty state naming the owning bot (Codebook). If there are also no local notes, Clayton Desk is named too. Local notes whose item does not exist yet appear as "No NYS item yet" rows.
- Design criteria show on an item only through `criteriaRefs`; all criteria are also listed under the "Design criteria" button.
