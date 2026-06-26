# Fargo: Character Connections

An interactive connections graph for the **Fargo** TV series. Each season is a self-contained
web of characters (circular portraits with names) wired together by their relationships
(family, partners, employers, killings, investigations). Click a character to trace everyone
they're tied to.

![all five seasons, switchable](assets/screenshot.png)

## Features

- **All Seasons view** (the default): every character from all five seasons in one map,
  **stacked by season**, with the S1 cluster on top down to S5 at the bottom and the cross-season
  bridge characters sitting in the lanes between the seasons they link. Each node is colored by
  season and tagged with the symbol(s) of the season(s) it appears in:

  | Season | Symbol |
  |--------|:------:|
  | Season 1 (2014) | ✢ |
  | Season 2 (2015) | ✶ |
  | Season 3 (2017) | ✳ |
  | Season 4 (2020) | ✻ |
  | Season 5 (2023) | ✹ |

- **Cross-season bridge characters** carry a **ring split into the colors of their seasons**
  (half-and-half for two seasons, thirds for three) plus multiple symbols; they're what
  visually stitch the seasons together. Eight of them are documented across the series:
  - **Mr. Wrench** (✢✶✳): the only character in *three* seasons, appearing as a deaf Fargo
    hitman in S1, the deaf boy in the S2 finale, and Nikki Swango's avenging ally in S3.
  - **Mike Milligan / Satchel Cannon** (✶✻): the boy traded between syndicates in S4 grows into
    the Kansas City enforcer of S2 (merged into one node).
  - **Lou Solverson** (✢✶): the 1979 state trooper of S2 is Molly's diner-owning father in S1
    (merged into one node).
  - **Molly Solverson** (✢✶): the S1 deputy first appears as Lou & Betsy's little girl in S2.
  - **Mr. Numbers** (✢✶): Wrench's S1 partner, glimpsed as the hearing boy signing in the S2 finale.
  - **Gale Kitchen** (✶✻): a Kitchen Brother in S2, seen driving Mike's car in the S4 coda.
  - **Joe Bulo** (✶✻): the Kansas City boss of S2 appears as a younger man in S4.
  - **Hanzee Dent** (✢✶): *implied* (via a different actor) to become Moses Tripoli, the Fargo
    syndicate boss of S1; flagged as implied in the detail card, not asserted as fact.
- **Per-season views**: switch to a single season via the tabs to see it colored by faction
  (e.g. the Gerhardt family, Kansas City mob, law enforcement).
- **Portraits + names** on every node, pulled from the [Fargo Fandom wiki](https://fargo.fandom.com/wiki/Fargo_(TV_series)).
- **Click a character** to highlight their connections and open a detail card (actor, role,
  the season(s) they appear in, and a clickable list of every relationship, each labeled by its
  season symbol in the unified view).
- **Search** any character across all seasons.
- **Relationship labels** toggle, plus pan / zoom / shuffle-layout controls and a legend.

## Run it

It's a static site with no build step.

```bash
# from this folder, any static server works, e.g.:
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just open `index.html` directly in a browser. An internet connection is needed the first
time so the Cytoscape library (CDN) and the character portraits (from the wiki's image CDN) can load.

## How it's built

| File | Purpose |
|------|---------|
| `index.html` | Page shell, controls, and CDN script tags |
| `styles.css` | Fargo-flavored dark theme (blood-on-snow palette) |
| `data.js`    | All character + connection data, one block per season |
| `app.js`     | Builds the graph with [Cytoscape.js](https://js.cytoscape.org/) + the fcose layout |

### Editing the data

Everything lives in `data.js` under `window.FARGO_DATA.seasons`. Each season has:

- `characters[]`: `{ id, name, actor, role, group, image }` (set `image: null` to use an
  auto-generated monogram instead of a portrait).
- `connections[]`: `{ source, target, label }` directed edges between character `id`s.

Add a character or rewire a relationship, then reload. No other changes needed.

**Cross-season identities** (the same person appearing in multiple seasons) are declared in
`app.js` via the `MERGE` map (alias id → canonical id) and the `OVERRIDE` map (combined
name / actor / role copy). To link another recurring character, add an entry to each.

## Notes

- Portraits hot-link to the Fargo Fandom wiki's image CDN. If a portrait ever fails to load,
  the node falls back to a colored monogram automatically.
- A few minor characters have no wiki portrait (e.g. young Satchel Cannon, Scotty Lyon) and
  show monograms by design.
- Data is a curated selection of each season's most important characters, not the full cast.

Source: <https://fargo.fandom.com/wiki/Fargo_(TV_series)>
