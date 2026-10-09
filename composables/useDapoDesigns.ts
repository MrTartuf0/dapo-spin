export interface DapoDesign {
  id: string
  name: string
  front: string // data URL PNG (già rasterizzato)
  back: string
}

/** Risoluzione della texture rasterizzata. 1024 è un buon compromesso qualità/peso. */
export const RASTER_SIZE = 1024

export const DEFAULT_FRONT = '/designs/spider.png'
export const DEFAULT_BACK = '/designs/spider.png'

/* ---------- IndexedDB minimale (i PNG in base64 superano i limiti del localStorage) ---------- */
const DB = 'dapo-spin'
const STORE = 'designs'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function dbAll(): Promise<DapoDesign[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function dbPut(d: DapoDesign) {
  const db = await openDb()
  db.transaction(STORE, 'readwrite').objectStore(STORE).put(toRaw(d))
}

async function dbDelete(id: string) {
  const db = await openDb()
  db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id)
}

export function useDapoDesigns() {
  const designs = useState<DapoDesign[]>('dapo-designs', () => [])
  const activeId = useState<string | null>('dapo-active', () => null)
  const active = computed(() => designs.value.find(d => d.id === activeId.value) ?? null)

  async function load() {
    try {
      designs.value = await dbAll()
      if (designs.value.length && !activeId.value) activeId.value = designs.value[0].id
    } catch { /* IndexedDB non disponibile: si lavora solo in memoria */ }
  }

  function add(design: Omit<DapoDesign, 'id'>) {
    const id = crypto.randomUUID?.() ?? String(Date.now())
    const d = { id, ...design }
    designs.value.push(d)
    activeId.value = id
    dbPut(d).catch(() => {})
  }

  function remove(id: string) {
    designs.value = designs.value.filter(d => d.id !== id)
    if (activeId.value === id) activeId.value = designs.value[0]?.id ?? null
    dbDelete(id).catch(() => {})
  }

  function update(id: string, patch: Partial<Omit<DapoDesign, 'id'>>) {
    const d = designs.value.find(d => d.id === id)
    if (d) { Object.assign(d, patch); dbPut(d).catch(() => {}) }
  }

  return { designs, activeId, active, load, add, remove, update }
}

/**
 * Legge un file immagine (SVG, PNG, JPG, WebP…) e lo rasterizza in un PNG quadrato
 * di RASTER_SIZE px con sfondo trasparente. Gli SVG pesanti diventano così una
 * texture leggera per il compositor: le trasformazioni 3D non devono più
 * ricalcolare i vettori a ogni frame.
 */
export async function rasterizeImageFile(file: File, size = RASTER_SIZE): Promise<string> {
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
  if (!isSvg && !file.type.startsWith('image/')) throw new Error('Carica un SVG o un\'immagine (PNG, JPG, WebP)')

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Impossibile leggere l\'immagine'))
      i.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    // "cover": riempie tutto il quadrato; il bordo del dapo poi ritaglia la stella
    const iw = img.naturalWidth || size, ih = img.naturalHeight || size
    const s = Math.max(size / iw, size / ih)
    const w = iw * s, h = ih * s
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
