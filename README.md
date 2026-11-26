# parts-stash-pwa

A parts inventory for the garage shelf — as a phone app you install
from the browser. No app store, no account, no server.

Every spare part with its name, part number, bike, quantity, bin,
cost, and condition. Search by name or part number, filter by bike
or category, see the whole shelf's value at a glance.

> All bikes, names, and numbers below are examples only.

## What it does

- **Stash tab** — every part on the shelf, name-sorted, with search
  (name or part number), a bike filter, and a category filter. Each
  row shows the part, its bike, quantity, bin, cost each, computed
  value, and condition, with Edit and Delete. The add form takes
  name and quantity as the only required fields — part number, bike,
  category, cost, bin, condition, date, and notes are all optional.
  The same form edits: tap Edit on a row and it fills in, with a
  Cancel edit button.
- **Summary tab** — per-bike totals and all-bikes totals: distinct
  parts, units on hand, and total value, plus a per-category count.
  Value = quantity × cost each, both typed in by you.
- **Bikes tab** — the shared Pocket Garage roster (b1/b2/b3: 1995 Fat
  Boy, 1990 Softail, 1947 Knucklehead), with an add-a-bike form.
  Bikes live in the shared `pocket-garage-bikes` key via the vendored
  `bike-profile.js` — the same roster the other apps use, no second
  bike model. There is no delete-bike here: roster management belongs
  to the landing dashboard (Phase 2), so a mistyped bike is removed
  there, not here.
- **Data tab** — export the whole stash as JSON, export one bike as
  JSON or readable text, import (replaces the stash), load example
  data, and delete all parts. Delete clears this app's parts only —
  the shared bike roster is not touched.

## The honesty rule (read this before trusting a number)

Every part number, price, quantity, and fitment on screen is one
you typed in, or computed from numbers you typed in by the formulas
printed right next to them. Nothing is invented: no part number,
price, or fitment is ever suggested.

- A part with no cost entered has no value in the totals. The
  summary says how many parts are unpriced instead of guessing.
- Cost is per unit, never a total. Value of a part = quantity ×
  cost each.
- A part can belong to a bike or to no bike at all ("General (no
  bike)" — a box of bolts, shop stock). General parts show in their
  own totals and in the all-bikes view.

## Files

- `index.html` — the four tabs (Stash / Summary / Bikes / Data).
- `app.js` — pure logic (Node-testable) + the DOM layer. No build
  step, no dependencies.
- `styles.css` — 1990 Treatment (live dyno `styles.css` is the
  reference): gloss tank black #070709, chrome, purple #9d6bff,
  UnifrakturCook headings, Archivo Narrow body. Buttons have no hover
  transform — the house hover shift breaks Playwright stability
  checks and sticks after a tap on touch (AGENTS.md, Nov 24, 2026).
- `sw.js` — app-shell cache `parts-stash-v1`; every file `index.html`
  loads is precached. `sw-update.js` is the shared update-button
  module (vendored verbatim, md5 `dca37625a13049e7eb021d5a25c649d3`).
- `bike-profile.js` — the shared bike roster module (vendored
  verbatim, md5 `c618323a4b8ed7f37004260a044503ce`).
- `manifest.webmanifest`, `icons/` — PWA install files. Icons are
  Pillow-drawn from `make_icons.py` (chrome gear, purple hub, PARTS
  label — the 512 icon was read back and reads clearly as a gear).
- `test.js` — Node suite, 94 checks. `test_ui.py` — Playwright UI
  smoke (see TESTING.md).

## Publish

New repo (the connector cannot create repos — that happens in the
browser at publish time), GitHub Pages enabled in Settings → Pages
(it is off by default on a new repo and the site 404s without it),
then a landing card for the parts stash. Push paths (every file the
live `sw.js` precaches or `index.html` loads — the standing lesson):
all files in this directory except `make_icons.py`, `test.js`,
`test_ui.py`, and `TESTING.md`.
