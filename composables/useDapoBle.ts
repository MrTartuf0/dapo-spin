/**
 * Connessione Bluetooth con la dapo vera (firmware firmware/DapoIMU).
 * Formato dei dati e protocollo di aggiornamento: docs/protocollo-dati.md.
 *
 * Lo stato è a livello di modulo: la connessione resta aperta passando dal simulatore
 * alla pagina Firmware e ritorno.
 */

export const DAPO_SVC = 'a7f3c100-5d2e-4f8b-9e61-3c0d7b2a9e10'
export const DAPO_DATA = 'a7f3c101-5d2e-4f8b-9e61-3c0d7b2a9e10'
export const DAPO_CMD = 'a7f3c102-5d2e-4f8b-9e61-3c0d7b2a9e10'
export const DAPO_INFO = 'a7f3c103-5d2e-4f8b-9e61-3c0d7b2a9e10'
export const OTA_SVC = 'a7f3c110-5d2e-4f8b-9e61-3c0d7b2a9e10'
export const OTA_CTRL = 'a7f3c111-5d2e-4f8b-9e61-3c0d7b2a9e10'
export const OTA_DATA = 'a7f3c112-5d2e-4f8b-9e61-3c0d7b2a9e10'

/** un campione dell'IMU: quaternione (scheda → mondo, Z in alto), accelerazione in g, giroscopio in °/s */
export interface ImuSample { q: [number, number, number, number]; a: [number, number, number]; g: [number, number, number]; t: number }
export interface BoardInfo { fw: string; ota: number; board?: string }
export type OtaPhase = 'prepara' | 'cancella' | 'invia' | 'verifica' | 'riavvia' | 'fatto'
export interface OtaProgress { phase: OtaPhase; sent: number; total: number; kbps: number }

const connected = ref(false)
const connecting = ref(false)
const deviceName = ref('')
const info = ref<BoardInfo | null>(null)
const hz = ref(0)
const lastError = ref('')
const otaBusy = ref(false)

let device: any = null
let server: any = null
let cmdChar: any = null
const listeners = new Set<(s: ImuSample) => void>()
let count = 0
let hzTimer: ReturnType<typeof setInterval> | null = null

export const bleSupported = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator

function onData(e: any) {
  const dv: DataView = e.target.value
  if (dv.byteLength < 20) return
  const v = (i: number) => dv.getInt16(2 * i, true)
  const s: ImuSample = {
    q: [v(0) / 32767, v(1) / 32767, v(2) / 32767, v(3) / 32767],
    a: [v(4) / 1000, v(5) / 1000, v(6) / 1000],
    g: [v(7) / 10, v(8) / 10, v(9) / 10],
    t: performance.now()
  }
  count++
  for (const l of listeners) l(s)
}

function onDisconnected() {
  connected.value = false
  server = null; cmdChar = null
  if (hzTimer) { clearInterval(hzTimer); hzTimer = null }
  hz.value = 0
}

async function connect() {
  lastError.value = ''
  if (!bleSupported()) { lastError.value = 'Questo browser non ha Web Bluetooth: usa Chrome o Edge (computer o Android).'; return false }
  connecting.value = true
  try {
    device = await (navigator as any).bluetooth.requestDevice({
      filters: [{ namePrefix: 'Dapo' }, { services: [DAPO_SVC] }],
      optionalServices: [DAPO_SVC, OTA_SVC]
    })
    device.addEventListener('gattserverdisconnected', onDisconnected)
    await openGatt()
    return true
  } catch (err: any) {
    if (err?.name !== 'NotFoundError') lastError.value = err?.message || String(err)
    return false
  } finally {
    connecting.value = false
  }
}

/** (ri)apre la connessione con il dispositivo già scelto: serve anche dopo un aggiornamento */
async function openGatt() {
  server = await device.gatt.connect()
  deviceName.value = device.name || 'DapoIMU'
  const svc = await server.getPrimaryService(DAPO_SVC)
  cmdChar = await svc.getCharacteristic(DAPO_CMD)
  info.value = null
  try {
    const raw = await (await svc.getCharacteristic(DAPO_INFO)).readValue()
    info.value = JSON.parse(new TextDecoder().decode(raw))
  } catch { /* firmware precedente alla versione con "info" */ }
  const data = await svc.getCharacteristic(DAPO_DATA)
  data.addEventListener('characteristicvaluechanged', onData)
  await data.startNotifications()
  connected.value = true
  count = 0
  if (hzTimer) clearInterval(hzTimer)
  hzTimer = setInterval(() => { hz.value = count; count = 0 }, 1000)
}

async function reconnect(tries = 8) {
  if (!device) return false
  for (let i = 0; i < tries; i++) {
    try { await openGatt(); return true } catch { await new Promise(r => setTimeout(r, 1500)) }
  }
  return false
}

function disconnect() {
  try { if (device?.gatt?.connected) device.gatt.disconnect() } catch { /* già chiusa */ }
  onDisconnected()
}

/** comandi del firmware: 'c' calibra giroscopio, 'r' livella, 'u' modalità OTA del bootloader */
async function sendCommand(c: string) {
  if (!cmdChar) throw new Error('Scheda non connessa')
  const b = new Uint8Array([c.charCodeAt(0)])
  if (cmdChar.writeValueWithoutResponse) await cmdChar.writeValueWithoutResponse(b)
  else await cmdChar.writeValue(b)
}

function onSample(fn: (s: ImuSample) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/* ---------------- aggiornamento del firmware (servizio OTA nostro) ---------------- */

export function crc32(bytes: Uint8Array) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1))
  }
  return (c ^ 0xFFFFFFFF) >>> 0
}

const OTA_ERRORS: Record<number, string> = {
  1: 'il firmware è troppo grande per l\'aggiornamento via Bluetooth',
  2: 'la scheda non era pronta per questo passo',
  3: 'controllo CRC fallito',
  4: 'errore nella cancellazione della flash'
}

async function updateFirmware(image: Uint8Array, onProgress: (p: OtaProgress) => void) {
  if (!server?.connected) throw new Error('Scheda non connessa')
  if (info.value && image.length > info.value.ota) throw new Error(`Firmware di ${image.length} byte: la scheda ne accetta al massimo ${info.value.ota}`)
  otaBusy.value = true
  const svc = await server.getPrimaryService(OTA_SVC).catch(() => {
    throw new Error('Questo firmware non ha ancora l\'aggiornamento via Bluetooth: la prima volta aggiorna via USB (file .uf2).')
  })
  const ctrl = await svc.getCharacteristic(OTA_CTRL)
  const data = await svc.getCharacteristic(OTA_DATA)

  const notes: Uint8Array[] = []
  let wake: (() => void) | null = null
  const onNote = (e: any) => {
    const dv: DataView = e.target.value
    notes.push(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength).slice())
    wake?.()
  }
  ctrl.addEventListener('characteristicvaluechanged', onNote)
  await ctrl.startNotifications()

  const u32 = (b: Uint8Array, at: number) => (b[at] | b[at + 1] << 8 | b[at + 2] << 16 | b[at + 3] << 24) >>> 0
  const op = (c: string) => c.charCodeAt(0)
  /** aspetta una notifica con il codice indicato; un errore 'E' interrompe tutto */
  async function expect(code: string, timeoutMs: number) {
    const until = performance.now() + timeoutMs
    for (;;) {
      const i = notes.findIndex(n => n[0] === op(code) || n[0] === op('E'))
      if (i >= 0) {
        const n = notes.splice(0, i + 1)[i]
        if (n[0] === op('E')) throw new Error('La scheda ha rifiutato l\'aggiornamento: ' + (OTA_ERRORS[n[1]] ?? `codice ${n[1]}`))
        return n
      }
      const left = until - performance.now()
      if (left <= 0) throw new Error('La scheda non risponde (troppo lontana o spenta?)')
      await new Promise<void>(r => { wake = r; setTimeout(r, Math.min(left, 250)) })
      wake = null
    }
  }
  const write = (b: number[] | Uint8Array) => ctrl.writeValueWithResponse
    ? ctrl.writeValueWithResponse(new Uint8Array(b))
    : ctrl.writeValue(new Uint8Array(b))

  try {
    const size = image.length
    const pad = (size + 15) & ~15
    const padded = new Uint8Array(pad).fill(0xFF); padded.set(image)
    const crc = crc32(image)
    const le = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]
    const t0 = performance.now()
    const report = (phase: OtaPhase, sent: number) =>
      onProgress({ phase, sent, total: pad, kbps: sent / 1024 / Math.max(0.001, (performance.now() - t0) / 1000) })

    report('cancella', 0)
    await write([op('B'), ...le(size), ...le(crc)])
    let off = u32(await expect('K', 60000), 1)

    const WINDOW = 32
    while (off < pad) {
      for (let i = 0; i < WINDOW && off + 16 * i < pad; i++) {
        const o = off + 16 * i
        const pkt = new Uint8Array(20)
        pkt.set(le(o)); pkt.set(padded.subarray(o, o + 16), 4)
        await data.writeValueWithoutResponse(pkt)
      }
      await write([op('Q')])
      off = u32(await expect('K', 8000), 1)
      report('invia', off)
    }

    report('verifica', pad)
    await write([op('V')])
    const v = await expect('V', 15000)
    if (v[1] !== 1) throw new Error('Il firmware ricevuto non corrisponde (CRC): niente è stato cambiato, riprova')

    report('riavvia', pad)
    await write([op('A')])
    await expect('A', 5000)
    // la scheda copia il firmware e si riavvia: la connessione cade da sola
    await new Promise(r => setTimeout(r, 4000))
    const ok = await reconnect()
    report('fatto', pad)
    return ok
  } finally {
    ctrl.removeEventListener('characteristicvaluechanged', onNote)
    otaBusy.value = false
  }
}

export function useDapoBle() {
  return {
    connected: readonly(connected), connecting: readonly(connecting), deviceName: readonly(deviceName),
    info: readonly(info), hz: readonly(hz), lastError, otaBusy: readonly(otaBusy),
    connect, disconnect, reconnect, sendCommand, onSample, updateFirmware, supported: bleSupported
  }
}
