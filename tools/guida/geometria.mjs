// Geometria della dapo: stella a 8 punte formata da due quadrati ruotati di 45°.
// Coordinate in cm, origine al centro, asse y verso l'alto, vertici in senso antiorario.

const D2R = Math.PI / 180

/** Sposta un poligono (antiorario) di `d` cm verso l'esterno (d < 0 verso l'interno), giunti a spigolo vivo. */
export function offsetPolygon(pts, d) {
  const n = pts.length
  const lines = []
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n]
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy)
    const nx = dy / len, ny = -dx / len // normale esterna per un poligono antiorario
    lines.push({ p: [p[0] + nx * d, p[1] + ny * d], v: [dx, dy] })
  }
  const out = []
  for (let i = 0; i < n; i++) {
    const A = lines[(i - 1 + n) % n], B = lines[i]
    const den = A.v[0] * B.v[1] - A.v[1] * B.v[0]
    const t = ((B.p[0] - A.p[0]) * B.v[1] - (B.p[1] - A.p[1]) * B.v[0]) / den
    out.push([A.p[0] + A.v[0] * t, A.p[1] + A.v[1] * t])
  }
  return out
}

/**
 * @param {number} D diametro da punta a punta della linea di cucitura (cm)
 * @param {number} seam margine di cucitura (cm)
 */
export function starGeometry(D = 67, seam = 1) {
  const R = D / 2
  const a = R / Math.SQRT2 // metà lato dei quadrati
  const rv = a / Math.cos(22.5 * D2R) // raggio delle valli
  const stitch = []
  for (let k = 0; k < 8; k++) {
    stitch.push([R * Math.cos(45 * k * D2R), R * Math.sin(45 * k * D2R)])
    stitch.push([rv * Math.cos((45 * k + 22.5) * D2R), rv * Math.sin((45 * k + 22.5) * D2R)])
  }
  const cut = offsetPolygon(stitch, seam)
  const edge = Math.hypot(stitch[1][0] - stitch[0][0], stitch[1][1] - stitch[0][1])
  let area = 0
  for (let i = 0; i < stitch.length; i++) {
    const p = stitch[i], q = stitch[(i + 1) % stitch.length]
    area += p[0] * q[1] - q[0] * p[1]
  }
  area = Math.abs(area) / 2 / 1e4 // m²
  const xs = cut.map((p) => p[0])
  return {
    D, R, a, rv, seam, stitch, cut, edge,
    perimeter: (edge * 16) / 100, // m
    area,
    cutSize: Math.max(...xs) - Math.min(...xs),
    squareA: [[R, 0], [0, R], [-R, 0], [0, -R]],
    squareB: [[a, a], [-a, a], [-a, -a], [a, -a]],
    /** quarto di cartamodello fra gli assi +x e +y: vertici 0..4 dei poligoni */
    quarter: { stitch: stitch.slice(0, 5), cut: cut.slice(0, 5) },
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const g = starGeometry(67, 1)
  console.log({ R: g.R, a: g.a, lato: 2 * g.a, valle: g.rv, lato_punta_valle: g.edge, area_m2: g.area, perimetro_m: g.perimeter, taglio_cm: g.cutSize })
}
