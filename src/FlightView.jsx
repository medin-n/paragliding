import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ProfileChart } from './charts.jsx'
import { fmtDur, fmtDate } from './format.js'

// Catmull-Rom spline through the track points — a glider turns in arcs, not corners
function smoothTrack(pts, seg = 6) {
  if (pts.length < 3) return pts
  const cr = (a, b, c, d, t) => {
    const t2 = t * t, t3 = t2 * t
    return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  }
  const out = [pts[0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let j = 1; j <= seg; j++) {
      const t = j / seg
      out.push([cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t)])
    }
  }
  return out
}

/** Full flight preview: map with the GPS track, key facts, altitude profile. */
export default function FlightView({ flight: f, xcontestUser, onClose }) {
  const mapEl = useRef(null)

  useEffect(() => {
    // In fullscreen, Escape exits fullscreen (handled by the browser) — don't also close the modal
    const onKey = (e) => e.key === 'Escape' && !document.fullscreenElement && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  useEffect(() => {
    const css = getComputedStyle(document.documentElement)
    const accent = css.getPropertyValue('--series-1').trim() || '#2a78d6'
    const green = css.getPropertyValue('--series-2').trim() || '#1baf7a'

    const baseLayers = {
      Map: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }),
      Terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap, SRTM | &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
        maxZoom: 17,
      }),
      Satellite: L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles &copy; Esri', maxZoom: 19 }
      ),
    }
    const map = L.map(mapEl.current)
    const saved = localStorage.getItem('mapLayer')
    ;(baseLayers[saved] || baseLayers.Map).addTo(map)
    L.control.layers(baseLayers).addTo(map)
    map.on('baselayerchange', (e) => localStorage.setItem('mapLayer', e.name))

    // Fullscreen toggle (browser Fullscreen API on the map container)
    const FullscreenControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const div = L.DomUtil.create('div', 'leaflet-bar')
        const btn = L.DomUtil.create('a', 'fullscreen-btn', div)
        btn.href = '#'
        btn.title = 'Fullscreen'
        btn.innerHTML = '⛶'
        L.DomEvent.on(btn, 'click', (e) => {
          L.DomEvent.preventDefault(e)
          if (document.fullscreenElement) document.exitFullscreen()
          else mapEl.current.requestFullscreen()
        })
        return div
      },
    })
    map.addControl(new FullscreenControl())
    const onFsChange = () => map.invalidateSize()
    document.addEventListener('fullscreenchange', onFsChange)

    const line = L.polyline(smoothTrack(f.track), {
      color: accent,
      weight: 3,
      opacity: 0.9,
      smoothFactor: 0, // don't re-simplify the spline back into corners
    }).addTo(map)
    const dot = (pos, color, label) =>
      L.circleMarker(pos, { radius: 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
        .addTo(map)
        .bindTooltip(label)
    dot(f.track[0], green, 'Takeoff')
    dot(f.track[f.track.length - 1], accent, 'Landing')
    map.fitBounds(line.getBounds(), { padding: [28, 28] })

    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      map.remove()
    }
  }, [f])

  // Direct flight URL: detail:USER/D.M.YYYY/HH:MM (start time, UTC, no leading zeros in date)
  const [y, mo, dd] = f.date.split('-')
  const xcUrl =
    f.xc?.url ||
    (xcontestUser
      ? `https://www.xcontest.org/world/en/flights/detail:${xcontestUser}/${+dd}.${+mo}.${y}/${f.startTimeUtc}`
      : `https://www.xcontest.org/world/en/flights/daily-score-pg/#filter[date]=${f.date}`)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="flight-view" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>{f.site}</h2>
            <div className="sub">
              {fmtDate(f.date)} · {f.startTimeUtc} UTC · {f.glider}
            </div>
          </div>
          <a className="xc-link" href={xcUrl} target="_blank" rel="noreferrer">
            XContest ↗
          </a>
          <button className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="flight-map" ref={mapEl} />

        <div className="facts">
          <span>Duration <b>{fmtDur(f.durationSec)}</b></span>
          <span>Max alt <b>{f.maxAlt.toLocaleString()} m</b></span>
          <span>Alt gain <b>{f.altGain} m</b></span>
          <span>Max climb <b>{f.maxClimb} m/s</b></span>
          <span>Max sink <b>{f.maxSink} m/s</b></span>
          <span>Track <b>{f.trackKm} km</b></span>
          <span>Max dist from takeoff <b>{f.maxDistKm} km</b></span>
          <span>Avg speed <b>{f.avgSpeedKmh} km/h</b></span>
          {f.xc?.points != null && <span>XC points <b>{f.xc.points}</b></span>}
          {f.xc?.type && <span>Route <b>{f.xc.type}</b></span>}
        </div>

        <ProfileChart profile={f.profile} durationSec={f.durationSec} />
        <div className="file-name">{f.file}</div>
      </div>
    </div>
  )
}
