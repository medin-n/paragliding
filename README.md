# 🪂 Paragliding Logbook

A personal paragliding statistics web app. It reads IGC track files exported from
[XCTrack](https://xctrack.org/), computes flight statistics, and shows them in a
dashboard: totals (flights, airtime, distance), records (longest flight, highest
altitude, best climb), charts per year/month, and a sortable flight list with an
altitude profile for every flight. Everything can be filtered by year, takeoff
site, and glider.

There is no database and no server — the git repository **is** the data store.
IGC files live in `data/igc/`, a build script parses them into a single
`flights.json`, and the site deploys as a fully static app (free on Netlify).

## Adding flights

1. Export/copy `.igc` files from XCTrack into `data/igc/` (any file names work).
2. Commit and push — Netlify rebuilds and the dashboard updates.
   Locally, just run `npm run dev`.

Until `data/igc/` has files, the app shows generated **sample data** from
`data/samples/` so you can see how it works.

### Naming takeoff sites

IGC files contain coordinates, not site names. `data/sites.json` maps takeoff
locations to names — a flight launching within `radiusKm` of a site gets its
name. The build log (`npm run data`) prints ready-to-paste entries for any
takeoff it couldn't match.

### XContest statistics (optional)

Export your flight list from XContest as CSV and save it as
`data/xcontest.csv`. Flights are matched by date and get their official XC
points, distance, and route type attached.

## Development

```bash
npm install
npm run dev      # parse IGC files + start dev server
npm run build    # production build into dist/
npm run data     # only regenerate public/flights.json
```

## Deploying to Netlify

Push this repo to GitHub, then in Netlify choose **Add new site → Import an
existing project** and pick the repo — `netlify.toml` already configures the
build (`npm run build`, publish `dist/`). Every push redeploys.

Alternatively, deploy from the command line without GitHub:

```bash
npx netlify-cli login
npx netlify-cli deploy --build --prod
```

## How it works

- `scripts/build-flights.mjs` — parses every IGC file: date, glider and pilot
  from the header; takeoff/landing detection from ground speed; duration, track
  distance, max/min altitude, altitude gain, max climb/sink (15 s window),
  average speed; downsampled altitude profile and track. Includes a GPS-glitch
  filter. Output: `public/flights.json`.
- `src/` — React (Vite) dashboard that loads `flights.json` at runtime.
  No other runtime dependencies.
