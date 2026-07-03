import React, { useEffect, useMemo, useState } from 'react'
import { BarChart, ProfileChart } from './charts.jsx'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtDur(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h ? `${h} h ${String(m).padStart(2, '0')} m` : `${m} min`
}
function fmtHours(sec) {
  return (sec / 3600).toFixed(sec >= 360000 ? 0 : 1)
}
function fmtDate(iso) {
  const [y, m, d] = iso.split('-')
  return `${d} ${MONTHS[+m - 1]} ${y}`
}

const COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'site', label: 'Site' },
  { key: 'glider', label: 'Glider' },
  { key: 'durationSec', label: 'Duration', num: true },
  { key: 'trackKm', label: 'Track km', num: true },
  { key: 'maxAlt', label: 'Max alt m', num: true },
  { key: 'maxClimb', label: 'Climb m/s', num: true },
]

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [year, setYear] = useState('all')
  const [site, setSite] = useState('all')
  const [glider, setGlider] = useState('all')
  const [sort, setSort] = useState({ key: 'date', dir: -1 })
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    fetch('/flights.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  const flights = data?.flights ?? []

  const years = useMemo(
    () => [...new Set(flights.map((f) => f.date.slice(0, 4)))].sort().reverse(),
    [flights]
  )
  const sites = useMemo(() => [...new Set(flights.map((f) => f.site))].sort(), [flights])
  const gliders = useMemo(() => [...new Set(flights.map((f) => f.glider))].sort(), [flights])

  const filtered = useMemo(
    () =>
      flights.filter(
        (f) =>
          (year === 'all' || f.date.startsWith(year)) &&
          (site === 'all' || f.site === site) &&
          (glider === 'all' || f.glider === glider)
      ),
    [flights, year, site, glider]
  )

  const stats = useMemo(() => {
    if (!filtered.length) return null
    const sum = (fn) => filtered.reduce((a, f) => a + fn(f), 0)
    const best = (fn) => filtered.reduce((a, f) => (fn(f) > fn(a) ? f : a), filtered[0])
    return {
      count: filtered.length,
      airtimeSec: sum((f) => f.durationSec),
      distanceKm: sum((f) => f.trackKm),
      longest: best((f) => f.durationSec),
      highest: best((f) => f.maxAlt),
      bestClimb: best((f) => f.maxClimb),
      xcPoints: sum((f) => f.xc?.points || 0),
    }
  }, [filtered])

  const chartData = useMemo(() => {
    const byKey = (keyFn, labels) => {
      const flightCounts = new Map()
      const airtime = new Map()
      for (const f of filtered) {
        const k = keyFn(f)
        flightCounts.set(k, (flightCounts.get(k) || 0) + 1)
        airtime.set(k, (airtime.get(k) || 0) + f.durationSec / 3600)
      }
      return {
        flights: labels.map((l) => ({ ...l, value: flightCounts.get(l.key) || 0 })),
        airtime: labels.map((l) => ({ ...l, value: +(airtime.get(l.key) || 0).toFixed(1) })),
      }
    }
    if (year !== 'all') {
      const labels = MONTHS.map((m, i) => ({
        key: String(i + 1).padStart(2, '0'),
        label: m[0],
        fullLabel: `${m} ${year}`,
      }))
      return { ...byKey((f) => f.date.slice(5, 7), labels), scope: 'per month' }
    }
    const labels = years
      .slice()
      .reverse()
      .map((y) => ({ key: y, label: y, fullLabel: y }))
    return { ...byKey((f) => f.date.slice(0, 4), labels), scope: 'per year' }
  }, [filtered, year, years])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key]
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir
    })
    return arr
  }, [filtered, sort])

  const hasXc = filtered.some((f) => f.xc)

  if (error) {
    return (
      <div className="app">
        <div className="empty">Could not load flights.json ({error}). Run <code>npm run data</code>.</div>
      </div>
    )
  }
  if (!data) return <div className="app"><div className="empty">Loading…</div></div>

  return (
    <div className="app">
      <header className="top">
        <h1>🪂 Paragliding Logbook</h1>
        <span className="sub">{flights.length} flights logged</span>
      </header>

      {data.sampleData && (
        <div className="sample-banner">
          Showing <b>sample data</b>. Drop your XCTrack <code>.igc</code> files into{' '}
          <code>data/igc/</code> and run <code>npm run dev</code> (or push to redeploy) to see
          your own flights.
        </div>
      )}

      <div className="filters">
        <label>
          Year
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">All</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label>
          Site
          <select value={site} onChange={(e) => setSite(e.target.value)}>
            <option value="all">All</option>
            {sites.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Glider
          <select value={glider} onChange={(e) => setGlider(e.target.value)}>
            <option value="all">All</option>
            {gliders.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        {(year !== 'all' || site !== 'all' || glider !== 'all') && (
          <button className="clear" onClick={() => { setYear('all'); setSite('all'); setGlider('all') }}>
            Clear filters
          </button>
        )}
      </div>

      {!stats ? (
        <div className="empty">No flights match these filters.</div>
      ) : (
        <>
          <div className="tiles">
            <div className="tile">
              <div className="label">Flights</div>
              <div className="value">{stats.count}</div>
            </div>
            <div className="tile">
              <div className="label">Airtime</div>
              <div className="value">{fmtHours(stats.airtimeSec)}<small>h</small></div>
            </div>
            <div className="tile">
              <div className="label">Distance flown</div>
              <div className="value">{Math.round(stats.distanceKm).toLocaleString()}<small>km</small></div>
            </div>
            <div className="tile">
              <div className="label">Longest flight</div>
              <div className="value">{fmtDur(stats.longest.durationSec)}</div>
              <div className="note">{fmtDate(stats.longest.date)}</div>
            </div>
            <div className="tile">
              <div className="label">Highest altitude</div>
              <div className="value">{stats.highest.maxAlt.toLocaleString()}<small>m</small></div>
              <div className="note">{stats.highest.site}</div>
            </div>
            <div className="tile">
              <div className="label">{hasXc ? 'XC points' : 'Best climb'}</div>
              <div className="value">
                {hasXc
                  ? Math.round(stats.xcPoints).toLocaleString()
                  : <>{stats.bestClimb.maxClimb}<small>m/s</small></>}
              </div>
            </div>
          </div>

          <div className="charts">
            <div className="card">
              <h3>Flights {chartData.scope}</h3>
              <BarChart data={chartData.flights} />
            </div>
            <div className="card">
              <h3>Airtime {chartData.scope} (hours)</h3>
              <BarChart data={chartData.airtime} formatValue={(v) => `${v} h`} />
            </div>
          </div>

          <div className="table-card">
            <h3>Flights</h3>
            <div className="table-scroll">
              <table className="flights">
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className={c.num ? 'num' : ''}
                        onClick={() =>
                          setSort((s) =>
                            s.key === c.key ? { key: c.key, dir: -s.dir } : { key: c.key, dir: -1 }
                          )
                        }>
                        {c.label}{sort.key === c.key ? (sort.dir === -1 ? ' ▼' : ' ▲') : ''}
                      </th>
                    ))}
                    {hasXc && <th className="num">XC pts</th>}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((f) => (
                    <React.Fragment key={f.id}>
                      <tr className="row" onClick={() => setOpenId(openId === f.id ? null : f.id)}>
                        <td>{fmtDate(f.date)}</td>
                        <td className="site-cell">{f.site}</td>
                        <td>{f.glider}</td>
                        <td className="num">{fmtDur(f.durationSec)}</td>
                        <td className="num">{f.trackKm.toFixed(1)}</td>
                        <td className="num">{f.maxAlt.toLocaleString()}</td>
                        <td className="num">{f.maxClimb.toFixed(1)}</td>
                        {hasXc && (
                          <td className="num muted">{f.xc?.points ?? '—'}</td>
                        )}
                      </tr>
                      {openId === f.id && (
                        <tr>
                          <td colSpan={COLUMNS.length + (hasXc ? 1 : 0)} style={{ padding: 0 }}>
                            <div className="detail">
                              <div className="facts">
                                <span>Start <b>{f.startTimeUtc} UTC</b></span>
                                <span>Alt gain <b>{f.altGain} m</b></span>
                                <span>Max sink <b>{f.maxSink} m/s</b></span>
                                <span>Avg speed <b>{f.avgSpeedKmh} km/h</b></span>
                                <span>Max dist from takeoff <b>{f.maxDistKm} km</b></span>
                                {f.xc?.type && <span>Route <b>{f.xc.type}</b></span>}
                                <span style={{ color: 'var(--muted)' }}>{f.file}</span>
                              </div>
                              <ProfileChart profile={f.profile} durationSec={f.durationSec} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <footer className="foot">
        Add flights: copy <code>.igc</code> files from XCTrack into <code>data/igc/</code>, then
        commit &amp; push — Netlify rebuilds automatically. Name takeoff sites in{' '}
        <code>data/sites.json</code>; optional XContest export goes in <code>data/xcontest.csv</code>.
      </footer>
    </div>
  )
}
