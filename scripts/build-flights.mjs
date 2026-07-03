/**
 * Parses all IGC files in data/igc/ into public/flights.json,
 * which the web app loads at runtime.
 *
 * Optionally merges data/xcontest.csv (an XContest flight-list export) to
 * attach official XC points/km/route-type to matching flights (by date).
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------- geometry ----------
const R = 6371 // km
const rad = (d) => (d * Math.PI) / 180
function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// ---------- IGC parsing ----------
function parseIgc(text, fileName) {
  const lines = text.split(/\r?\n/)
  let date = null
  let glider = null
  let pilot = null
  const fixes = []

  for (const line of lines) {
    if (line.startsWith('B') && line.length >= 35) {
      const h = +line.slice(1, 3), m = +line.slice(3, 5), s = +line.slice(5, 7)
      const latDeg = +line.slice(7, 9)
      const latMin = +line.slice(9, 11) + +line.slice(11, 14) / 1000
      let lat = latDeg + latMin / 60
      if (line[14] === 'S') lat = -lat
      const lonDeg = +line.slice(15, 18)
      const lonMin = +line.slice(18, 20) + +line.slice(20, 23) / 1000
      let lon = lonDeg + lonMin / 60
      if (line[23] === 'W') lon = -lon
      const pressAlt = +line.slice(25, 30)
      const gpsAlt = +line.slice(30, 35)
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue
      const alt = gpsAlt > 0 ? gpsAlt : pressAlt
      // GPS-glitch filter: drop fixes implying >250 km/h ground speed or >40 m/s vario
      const prev = fixes[fixes.length - 1]
      if (prev) {
        let dt = h * 3600 + m * 60 + s - prev.t
        if (dt <= 0) dt += 86400
        const kmh = (haversineKm(prev.lat, prev.lon, lat, lon) / dt) * 3600
        if (kmh > 250 || Math.abs(alt - prev.alt) / dt > 40) continue
      }
      fixes.push({ t: h * 3600 + m * 60 + s, lat, lon, alt, pressAlt })
    } else if (line.startsWith('H')) {
      let mm
      if ((mm = line.match(/^HFDTE(?:DATE:)?(\d{2})(\d{2})(\d{2})/))) {
        const [, dd, mo, yy] = mm
        date = `20${yy}-${mo}-${dd}`
      } else if ((mm = line.match(/^H[FOP]GTY(?:GLIDERTYPE)?:?(.*)/i))) {
        const v = mm[1].replace(/^GLIDERTYPE:?/i, '').trim()
        if (v) glider = v
      } else if ((mm = line.match(/^H[FOP]PLT(?:PILOT(?:INCHARGE)?)?:?(.*)/i))) {
        const v = mm[1].replace(/^PILOT(?:INCHARGE)?:?/i, '').trim()
        if (v) pilot = v
      }
    }
  }

  if (fixes.length < 10 || !date) return null

  // Handle midnight rollover in fix times
  for (let i = 1; i < fixes.length; i++) {
    while (fixes[i].t < fixes[i - 1].t) fixes[i].t += 86400
  }

  // Detect takeoff/landing: sustained ground speed above ~8 km/h
  const speeds = fixes.map((f, i) => {
    if (i === 0) return 0
    const dt = Math.max(1, f.t - fixes[i - 1].t)
    return (haversineKm(fixes[i - 1].lat, fixes[i - 1].lon, f.lat, f.lon) / dt) * 3600
  })
  const sustained = (i) => {
    let n = 0
    for (let j = i; j < Math.min(i + 5, speeds.length); j++) if (speeds[j] > 8) n++
    return n >= 4
  }
  let start = 0
  for (let i = 1; i < fixes.length; i++) if (sustained(i)) { start = i - 1; break }
  let end = fixes.length - 1
  for (let i = fixes.length - 1; i > start; i--) {
    if (speeds[i] > 8) { end = i; break }
  }
  const flight = fixes.slice(start, end + 1)
  if (flight.length < 10) return null

  const takeoff = flight[0]
  const landing = flight[flight.length - 1]
  const durationSec = landing.t - takeoff.t
  if (durationSec < 60) return null

  let trackKm = 0
  let maxAlt = -Infinity
  let minAlt = Infinity
  let maxDistKm = 0
  for (let i = 0; i < flight.length; i++) {
    const f = flight[i]
    if (i > 0) trackKm += haversineKm(flight[i - 1].lat, flight[i - 1].lon, f.lat, f.lon)
    if (f.alt > maxAlt) maxAlt = f.alt
    if (f.alt < minAlt) minAlt = f.alt
    const d = haversineKm(takeoff.lat, takeoff.lon, f.lat, f.lon)
    if (d > maxDistKm) maxDistKm = d
  }

  // Vario over a ~15 s sliding window, from baro altitude when the logger
  // has a pressure sensor (GPS altitude is far too noisy for climb rates).
  // Baro reads 0 until the sensor warms up — treat those fixes as missing.
  const hasBaro = flight.some((f) => f.pressAlt !== 0)
  const vAlt = (f) => (hasBaro ? (f.pressAlt !== 0 ? f.pressAlt : null) : f.alt)
  let maxClimb = 0
  let maxSink = 0
  let j = 0
  for (let i = 0; i < flight.length; i++) {
    while (flight[i].t - flight[j].t > 15) j++
    const dt = flight[i].t - flight[j].t
    const a1 = vAlt(flight[j])
    const a2 = vAlt(flight[i])
    if (dt >= 5 && a1 != null && a2 != null) {
      const v = (a2 - a1) / dt
      if (Math.abs(v) > 30) continue // baro dropout/recalibration jump
      if (v > maxClimb) maxClimb = v
      if (v < maxSink) maxSink = v
    }
  }

  const downsample = (arr, n) => {
    if (arr.length <= n) return arr
    const out = []
    for (let i = 0; i < n; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (n - 1))])
    return out
  }

  const startUtc = takeoff.t % 86400
  const hh = String(Math.floor(startUtc / 3600)).padStart(2, '0')
  const mi = String(Math.floor((startUtc % 3600) / 60)).padStart(2, '0')

  return {
    id: fileName.replace(/\.igc$/i, ''),
    file: fileName,
    date,
    startTimeUtc: `${hh}:${mi}`,
    durationSec,
    glider: glider || 'Unknown glider',
    pilot: pilot || null,
    takeoff: {
      lat: +takeoff.lat.toFixed(5),
      lon: +takeoff.lon.toFixed(5),
      alt: takeoff.alt,
    },
    maxAlt,
    minAlt,
    altGain: maxAlt - takeoff.alt,
    maxClimb: +maxClimb.toFixed(1),
    maxSink: +maxSink.toFixed(1),
    trackKm: +trackKm.toFixed(1),
    maxDistKm: +maxDistKm.toFixed(1),
    straightKm: +haversineKm(takeoff.lat, takeoff.lon, landing.lat, landing.lon).toFixed(1),
    avgSpeedKmh: +((trackKm / durationSec) * 3600).toFixed(1),
    profile: downsample(flight, 120).map((f) => f.alt),
    // ~1 point per 6 s so thermal circles stay visible on the map
    track: downsample(flight, Math.min(800, Math.max(150, Math.round(durationSec / 6)))).map(
      (f) => [+f.lat.toFixed(5), +f.lon.toFixed(5)]
    ),
  }
}

// ---------- config ----------
function loadConfig() {
  const p = join(root, 'data', 'config.json')
  if (!existsSync(p)) return {}
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch (e) {
    console.warn('Could not parse data/config.json:', e.message)
    return {}
  }
}

// ---------- site naming ----------
function loadSites() {
  const p = join(root, 'data', 'sites.json')
  if (!existsSync(p)) return []
  try {
    return JSON.parse(readFileSync(p, 'utf8')).sites || []
  } catch (e) {
    console.warn('Could not parse data/sites.json:', e.message)
    return []
  }
}

function assignSites(flights, sites) {
  const unnamed = [] // auto-clusters of unmatched takeoffs
  for (const f of flights) {
    let best = null
    let bestD = Infinity
    for (const s of sites) {
      const d = haversineKm(f.takeoff.lat, f.takeoff.lon, s.lat, s.lon)
      if (d <= (s.radiusKm ?? 2) && d < bestD) { best = s; bestD = d }
    }
    if (best) {
      f.site = best.name
      continue
    }
    let cluster = unnamed.find(
      (c) => haversineKm(f.takeoff.lat, f.takeoff.lon, c.lat, c.lon) <= 1.5
    )
    if (!cluster) {
      cluster = { lat: f.takeoff.lat, lon: f.takeoff.lon, n: unnamed.length + 1 }
      unnamed.push(cluster)
    }
    f.site = `Unnamed site ${cluster.n} (${cluster.lat.toFixed(3)}, ${cluster.lon.toFixed(3)})`
  }
  if (unnamed.length) {
    console.log('\nUnmatched takeoff locations — name them by adding entries to data/sites.json:')
    for (const c of unnamed) {
      console.log(
        `  { "name": "???", "lat": ${c.lat.toFixed(4)}, "lon": ${c.lon.toFixed(4)}, "radiusKm": 2.5 },`
      )
    }
  }
}

// ---------- optional XContest CSV merge ----------
function mergeXContest(flights) {
  const p = join(root, 'data', 'xcontest.csv')
  if (!existsSync(p)) return
  const text = readFileSync(p, 'utf8').trim()
  const delim = (text.match(/;/g) || []).length >= (text.match(/,/g) || []).length ? ';' : ','
  const rows = text.split(/\r?\n/).map((l) => l.split(delim).map((c) => c.replace(/^"|"$/g, '').trim()))
  const header = rows[0].map((h) => h.toLowerCase())
  const col = (...keys) => header.findIndex((h) => keys.some((k) => h.includes(k)))
  const cDate = col('date')
  const cPoints = col('point')
  const cKm = col('length', 'km', 'dist')
  const cType = col('route', 'type')
  const cUrl = col('link', 'url')
  if (cDate < 0) {
    console.warn('xcontest.csv found but no "date" column recognized — skipped.')
    return
  }
  let matched = 0
  for (const row of rows.slice(1)) {
    const m = row[cDate]?.match(/(\d{2})\.(\d{2})\.(\d{2,4})/)
    if (!m) continue
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3]
    const date = `${yyyy}-${m[2]}-${m[1]}`
    const candidates = flights.filter((f) => f.date === date && !f.xc)
    if (!candidates.length) continue
    const f = candidates[0]
    f.xc = {
      points: cPoints >= 0 ? parseFloat(row[cPoints]) || null : null,
      km: cKm >= 0 ? parseFloat(row[cKm]) || null : null,
      type: cType >= 0 ? row[cType] || null : null,
      url: cUrl >= 0 ? row[cUrl] || null : null,
    }
    matched++
  }
  console.log(`XContest CSV: matched ${matched} flights by date.`)
}

// ---------- main ----------
const igcDir = join(root, 'data', 'igc')
const dir = igcDir
const files = existsSync(igcDir) ? readdirSync(igcDir).filter((f) => /\.igc$/i.test(f)) : []

const flights = []
for (const file of files) {
  try {
    const f = parseIgc(readFileSync(join(dir, file), 'utf8'), file)
    if (f) flights.push(f)
    else console.warn(`Skipped ${file}: no usable track/date found.`)
  } catch (e) {
    console.warn(`Skipped ${file}: ${e.message}`)
  }
}

flights.sort((a, b) => (a.date + a.startTimeUtc < b.date + b.startTimeUtc ? 1 : -1))
assignSites(flights, loadSites())
mergeXContest(flights)

mkdirSync(join(root, 'public'), { recursive: true })
writeFileSync(
  join(root, 'public', 'flights.json'),
  JSON.stringify({ generatedAt: null, xcontestUser: loadConfig().xcontestUser || null, flights })
)
console.log(`\nWrote public/flights.json — ${flights.length} flights.`)
