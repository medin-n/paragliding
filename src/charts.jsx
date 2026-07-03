import React, { useRef, useState } from 'react'

// Nice rounded axis max: 1/2/5 × 10^n above the data max
function niceMax(v) {
  if (v <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 5, 10]) if (m * pow >= v) return m * pow
  return 10 * pow
}

/**
 * Single-series column chart. data: [{ label, value }]
 * No legend (one series — the card title names it). Per-bar hover tooltip.
 */
export function BarChart({ data, formatValue = (v) => String(v), height = 180 }) {
  const wrapRef = useRef(null)
  const [hover, setHover] = useState(null) // { i, x, y }

  const W = 560
  const H = height
  const pad = { top: 18, right: 8, bottom: 24, left: 34 }
  const iw = W - pad.left - pad.right
  const ih = H - pad.top - pad.bottom

  const max = niceMax(Math.max(...data.map((d) => d.value), 0))
  const ticks = [0, max / 2, max]
  const band = iw / Math.max(data.length, 1)
  const barW = Math.min(24, Math.max(4, band - 2))
  const maxIdx = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0)

  const onMove = (e, i) => {
    const rect = wrapRef.current.getBoundingClientRect()
    setHover({ i, x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
        {ticks.map((t) => {
          const y = pad.top + ih - (t / max) * ih
          return (
            <g key={t}>
              <line x1={pad.left} x2={W - pad.right} y1={y} y2={y}
                stroke={t === 0 ? 'var(--baseline)' : 'var(--grid)'} strokeWidth="1" />
              <text x={pad.left - 6} y={y + 3.5} textAnchor="end" fontSize="10.5" fill="var(--muted)">
                {t >= 1000 ? `${(t / 1000).toLocaleString()}k` : t % 1 === 0 ? t : t.toFixed(1)}
              </text>
            </g>
          )
        })}
        {data.map((d, i) => {
          const h = max ? (d.value / max) * ih : 0
          const x = pad.left + i * band + (band - barW) / 2
          const y = pad.top + ih - h
          const r = Math.min(4, barW / 2, h)
          const showLabel = data.length <= 20 || i % Math.ceil(data.length / 16) === 0
          return (
            <g key={d.label}>
              {h > 0 && (
                <path
                  d={`M${x},${pad.top + ih} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${pad.top + ih} Z`}
                  fill="var(--series-1)"
                  opacity={hover && hover.i !== i ? 0.55 : 1}
                />
              )}
              {i === maxIdx && d.value > 0 && (
                <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize="10.5"
                  fontWeight="600" fill="var(--ink-2)">
                  {formatValue(d.value)}
                </text>
              )}
              {showLabel && (
                <text x={pad.left + i * band + band / 2} y={H - 8} textAnchor="middle"
                  fontSize="10.5" fill="var(--muted)">
                  {d.label}
                </text>
              )}
              <rect
                x={pad.left + i * band} y={pad.top} width={band} height={ih}
                fill="transparent"
                onPointerMove={(e) => onMove(e, i)}
                onPointerLeave={() => setHover(null)}
              />
            </g>
          )
        })}
      </svg>
      {hover && (
        <div className="chart-tooltip"
          style={{ left: Math.min(hover.x + 12, wrapRef.current.clientWidth - 110), top: hover.y - 40 }}>
          <div className="v">{formatValue(data[hover.i].value)}</div>
          <div className="l">{data[hover.i].fullLabel || data[hover.i].label}</div>
        </div>
      )}
    </div>
  )
}

/**
 * Altitude-over-time profile for one flight: 2px line, 10% area wash,
 * crosshair + tooltip, max altitude direct-labeled.
 */
export function ProfileChart({ profile, durationSec }) {
  const wrapRef = useRef(null)
  const [hover, setHover] = useState(null) // index into profile

  const W = 720
  const H = 150
  const pad = { top: 16, right: 12, bottom: 20, left: 40 }
  const iw = W - pad.left - pad.right
  const ih = H - pad.top - pad.bottom

  const min = Math.min(...profile)
  const max = Math.max(...profile)
  const span = Math.max(max - min, 1)
  const px = (i) => pad.left + (i / (profile.length - 1)) * iw
  const py = (a) => pad.top + ih - ((a - min) / span) * ih
  const maxIdx = profile.indexOf(max)

  const pathD = profile.map((a, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(a).toFixed(1)}`).join(' ')
  const areaD = `${pathD} L${px(profile.length - 1)},${pad.top + ih} L${pad.left},${pad.top + ih} Z`

  const fmtTime = (i) => {
    const s = (i / (profile.length - 1)) * durationSec
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return h ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`
  }

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const fx = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((fx - pad.left) / iw) * (profile.length - 1))
    setHover(Math.max(0, Math.min(profile.length - 1, i)))
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {[min, max].map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={py(t)} y2={py(t)} stroke="var(--grid)" strokeWidth="1" />
            <text x={pad.left - 6} y={py(t) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--muted)">
              {Math.round(t).toLocaleString()}
            </text>
          </g>
        ))}
        <path d={areaD} fill="var(--series-1)" opacity="0.1" />
        <path d={pathD} fill="none" stroke="var(--series-1)" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={px(maxIdx)} cy={py(max)} r="4" fill="var(--series-1)"
          stroke="var(--surface)" strokeWidth="2" />
        <text x={Math.min(px(maxIdx), W - 70)} y={py(max) - 8} textAnchor="middle"
          fontSize="10.5" fontWeight="600" fill="var(--ink-2)">
          {Math.round(max).toLocaleString()} m
        </text>
        {hover != null && (
          <g>
            <line x1={px(hover)} x2={px(hover)} y1={pad.top} y2={pad.top + ih}
              stroke="var(--baseline)" strokeWidth="1" />
            <circle cx={px(hover)} cy={py(profile[hover])} r="4" fill="var(--series-1)"
              stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
        <text x={pad.left} y={H - 5} fontSize="10.5" fill="var(--muted)">takeoff</text>
        <text x={W - pad.right} y={H - 5} textAnchor="end" fontSize="10.5" fill="var(--muted)">landing</text>
      </svg>
      {hover != null && wrapRef.current && (
        <div className="chart-tooltip"
          style={{
            left: Math.min((px(hover) / W) * wrapRef.current.clientWidth + 10,
              wrapRef.current.clientWidth - 120),
            top: 0,
          }}>
          <div className="v">{Math.round(profile[hover]).toLocaleString()} m</div>
          <div className="l">at {fmtTime(hover)}</div>
        </div>
      )}
    </div>
  )
}
