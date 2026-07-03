export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDur(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h ? `${h} h ${String(m).padStart(2, '0')} m` : `${m} min`
}

export function fmtDate(iso) {
  const [y, m, d] = iso.split('-')
  return `${d} ${MONTHS[+m - 1]} ${y}`
}
