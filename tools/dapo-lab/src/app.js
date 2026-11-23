// Dapo IMU Lab — visualizzatore per il firmware DapoIMU (XIAO nRF52840 Sense)
// Riceve: USB seriale (righe "D,ms,ax,ay,az,gx,gy,gz,qw,qx,qy,qz") oppure BLE (20 byte), oppure Demo.
(() => {
'use strict';

const SVC_UUID  = 'a7f3c100-5d2e-4f8b-9e61-3c0d7b2a9e10';
const DATA_UUID = 'a7f3c101-5d2e-4f8b-9e61-3c0d7b2a9e10';
const CMD_UUID  = 'a7f3c102-5d2e-4f8b-9e61-3c0d7b2a9e10';
const $ = id => document.getElementById(id);
const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------------------
// Quaternioni [w,x,y,z] nel riferimento del sensore (Z del mondo = verso l'alto)
// ---------------------------------------------------------------------------
const Q = {
  mul: (a, b) => [
    a[0]*b[0] - a[1]*b[1] - a[2]*b[2] - a[3]*b[3],
    a[0]*b[1] + a[1]*b[0] + a[2]*b[3] - a[3]*b[2],
    a[0]*b[2] - a[1]*b[3] + a[2]*b[0] + a[3]*b[1],
    a[0]*b[3] + a[1]*b[2] - a[2]*b[1] + a[3]*b[0]],
  norm: a => { const n = Math.hypot(a[0], a[1], a[2], a[3]) || 1; return [a[0]/n, a[1]/n, a[2]/n, a[3]/n]; },
  conj: a => [a[0], -a[1], -a[2], -a[3]],
  axisAngle: (x, y, z, ang) => { const s = Math.sin(ang/2); return [Math.cos(ang/2), x*s, y*s, z*s]; },
  rotate: (q, v) => { const p = Q.mul(Q.mul(q, [0, v[0], v[1], v[2]]), Q.conj(q)); return [p[1], p[2], p[3]]; },
  // avanza l'orientamento con la velocità angolare del corpo (°/s) per dt secondi
  integrate: (q, g, dt) => {
    const wx = g[0]*D2R, wy = g[1]*D2R, wz = g[2]*D2R, w = Math.hypot(wx, wy, wz);
    if (w * dt < 1e-9) return q;
    const h = w * dt / 2, s = Math.sin(h) / w;
    return Q.norm(Q.mul(q, [Math.cos(h), wx*s, wy*s, wz*s]));
  },
};

// ---------------------------------------------------------------------------
// Stato
// ---------------------------------------------------------------------------
const S = {
  source: null,               // 'serial' | 'ble' | 'demo'
  q: [1, 0, 0, 0], a: [0, 0, 1], g: [0, 0, 0], tLast: 0,
  yawOff: [1, 0, 0, 0],       // correzione "Zero" (rotazione attorno alla verticale)
  hz: 0, hzN: 0, hzT0: performance.now(),
  motion: '—', fallSince: 0, lastImpact: -1e9, lastFall: -1e9,
  peakG: 0, peakA: 0, peakT0: performance.now(),
};
const HIST_MS = 6000;
const H = { t: [], ax: [], ay: [], az: [], an: [], gx: [], gy: [], gz: [] };

function onSample(s) {
  // i pacchetti possono arrivare a gruppi (Bluetooth, USB): li ridistribuisco nel tempo
  // con il periodo medio, così grafici e dataset hanno campioni equispaziati
  const real = performance.now();
  const dtNom = 1000 / (S.hz > 5 ? S.hz : 100);
  const now = clamp((S.tHist || real) + dtNom, real - 120, real);
  S.tHist = now;
  S.q = Q.norm(s.q); S.a = s.a; S.g = s.g; S.tLast = real; S.hzN++;
  const an = Math.hypot(s.a[0], s.a[1], s.a[2]);
  H.t.push(now); H.ax.push(s.a[0]); H.ay.push(s.a[1]); H.az.push(s.a[2]); H.an.push(an);
  H.gx.push(s.g[0]); H.gy.push(s.g[1]); H.gz.push(s.g[2]);
  let drop = 0;
  while (drop < H.t.length && now - H.t[drop] > HIST_MS) drop++;
  if (drop > 0) for (const k in H) H[k].splice(0, drop);
  S.peakG = Math.max(S.peakG, Math.abs(s.g[0]), Math.abs(s.g[1]), Math.abs(s.g[2]));
  S.peakA = Math.max(S.peakA, Math.abs(s.a[0]), Math.abs(s.a[1]), Math.abs(s.a[2]));
  classify(now, an);
  if (REC.active) recordRow(now, s);
}

// Regole semplici: già con queste puoi pilotare molti effetti, senza ML.
function classify(now, an) {
  const g = S.g, rate = Math.hypot(g[0], g[1], g[2]);
  if (an < 0.35) { if (!S.fallSince) S.fallSince = now; } else S.fallSince = 0;
  if (an > 4) S.lastImpact = now;
  let m;
  if (S.fallSince && now - S.fallSince > 50) { m = 'in volo'; S.lastFall = now; }
  else if (now - S.lastImpact < 300) m = 'presa / colpo';
  else if (Math.abs(g[2]) > 120) m = 'gira';
  else if (rate < 15 && Math.abs(an - 1) < 0.08) m = 'ferma';
  else m = 'in movimento';
  S.motion = m;
}

// ---------------------------------------------------------------------------
// Messaggi e stato connessione
// ---------------------------------------------------------------------------
function log(msg) {
  const el = $('log');
  const t = new Date().toLocaleTimeString('it-IT', { hour12: false });
  el.textContent += `[${t}] ${msg}\n`;
  const lines = el.textContent.split('\n');
  if (lines.length > 200) el.textContent = lines.slice(-200).join('\n');
  el.scrollTop = el.scrollHeight;
}
function setStatus(text, kind) {
  const c = $('status'); c.textContent = text; c.className = 'chip' + (kind ? ' ' + kind : '');
}
function setConnected(src) {
  S.source = src;
  $('btnDisc').disabled = !src;
  for (const id of ['btnSerial', 'btnBle', 'btnDemo']) $(id).disabled = !!src;
  if (!src) { setStatus('non connesso'); applySupport(); }
}
function applySupport() {
  if (!('serial' in navigator)) { $('btnSerial').disabled = true; $('btnSerial').title = 'Web Serial non disponibile: usa Chrome o Edge su computer'; }
  if (!('bluetooth' in navigator)) { $('btnBle').disabled = true; $('btnBle').title = 'Web Bluetooth non disponibile: usa Chrome o Edge'; }
}

// ---------------------------------------------------------------------------
// USB seriale (Web Serial)
// ---------------------------------------------------------------------------
const SER = { port: null, reader: null, keep: false };
async function connectSerial() {
  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    try { await port.setSignals({ dataTerminalReady: true, requestToSend: true }); } catch (e) {}
    SER.port = port; SER.keep = true;
    setConnected('serial'); setStatus('USB connesso', 'ok'); log('USB aperta. Se non arrivano dati premi il tasto reset sulla scheda.');
    readSerialLoop();
  } catch (e) {
    if (e.name !== 'NotFoundError') { log('USB: ' + e.message); setStatus('errore USB', 'err'); }
  }
}
async function readSerialLoop() {
  const dec = new TextDecoder();
  let buf = '';
  while (SER.keep && SER.port && SER.port.readable) {
    SER.reader = SER.port.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await SER.reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).replace(/\r$/, '');
          buf = buf.slice(nl + 1);
          parseSerialLine(line);
        }
        if (buf.length > 4096) buf = '';
      }
    } catch (e) {
      if (SER.keep) log('USB: ' + e.message);
    } finally {
      try { SER.reader.releaseLock(); } catch (e) {}
    }
    if (!SER.keep) break;
  }
  if (SER.keep) disconnect();   // cavo staccato
}
function parseSerialLine(line) {
  if (line.startsWith('D,')) {
    const p = line.split(',');
    if (p.length !== 12) return;
    const n = p.map(Number);
    if (n.slice(2).some(Number.isNaN)) return;
    onSample({ a: [n[2], n[3], n[4]], g: [n[5], n[6], n[7]], q: [n[8], n[9], n[10], n[11]] });
  } else if (line.startsWith('#')) {
    log(line.slice(1).trim());
  }
}

// ---------------------------------------------------------------------------
// Bluetooth LE (Web Bluetooth)
// ---------------------------------------------------------------------------
const BT = { device: null, cmd: null };
async function connectBle() {
  try {
    setStatus('cerco DapoIMU…');
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'Dapo' }, { services: [SVC_UUID] }],
      optionalServices: [SVC_UUID],
    });
    BT.device = device;
    device.addEventListener('gattserverdisconnected', () => { if (S.source === 'ble') { log('Bluetooth disconnesso'); disconnect(); } });
    const server = await device.gatt.connect();
    const svc = await server.getPrimaryService(SVC_UUID);
    const data = await svc.getCharacteristic(DATA_UUID);
    BT.cmd = await svc.getCharacteristic(CMD_UUID);
    data.addEventListener('characteristicvaluechanged', e => {
      const dv = e.target.value;
      if (dv.byteLength < 20) return;
      const v = i => dv.getInt16(2 * i, true);
      onSample({
        q: [v(0) / 32767, v(1) / 32767, v(2) / 32767, v(3) / 32767],
        a: [v(4) / 1000, v(5) / 1000, v(6) / 1000],
        g: [v(7) / 10, v(8) / 10, v(9) / 10],
      });
    });
    await data.startNotifications();
    setConnected('ble'); setStatus('Bluetooth connesso', 'ok'); log('Connesso a ' + (device.name || 'DapoIMU'));
  } catch (e) {
    if (e.name !== 'NotFoundError') { log('Bluetooth: ' + e.message); setStatus('errore Bluetooth', 'err'); }
    else setStatus('non connesso');
  }
}

async function sendCmd(ch) {
  try {
    if (S.source === 'serial' && SER.port && SER.port.writable) {
      const w = SER.port.writable.getWriter();
      await w.write(new TextEncoder().encode(ch));
      w.releaseLock();
    } else if (S.source === 'ble' && BT.cmd) {
      const b = new Uint8Array([ch.charCodeAt(0)]);
      if (BT.cmd.writeValueWithoutResponse) await BT.cmd.writeValueWithoutResponse(b); else await BT.cmd.writeValue(b);
    } else if (S.source === 'demo') {
      if (ch === 'r') DEMO.extraYaw = 0;
      log('demo: comando "' + ch + '"');
      return;
    } else { log('Nessuna scheda connessa'); return; }
    log(ch === 'c' ? 'Calibrazione giroscopio: tieni ferma la dapo…' : 'Orientamento livellato');
  } catch (e) { log('Comando non inviato: ' + e.message); }
}

// ---------------------------------------------------------------------------
// Demo: una sequenza finta ma fisicamente coerente (100 Hz)
// spin sul dito, wobble, lancio con flip, presa, ferma
// ---------------------------------------------------------------------------
const DEMO = { timer: null, t: 0, wall: 0, qPrev: null, extraYaw: 0, spinAng: 0, flip: 0 };
function demoPose(t) {
  // restituisce: angolo di spin (rad), velocità di spin (giri/s), inclinazione (rad), precessione (rad), flip (rad), volo, impatto
  const T = t % 20;
  let rps = 0, tilt = 0.06 * Math.sin(t * 1.3), prec = t * 0.7, flip = 0, air = false, hit = 0;
  if (T < 2) rps = 0;
  else if (T < 7) rps = 1.5 + (T - 2) * 0.45;
  else if (T < 7.7) { rps = 3.2; air = true; flip = Math.PI * (T - 7) / 0.7; }
  else if (T < 12) { rps = 3.2 - (T - 7.7) * 0.15; flip = Math.PI; if (T < 7.74) hit = 5.5; tilt = 0.25 + 0.15 * Math.sin(t * 2.1); }
  else if (T < 12.7) { rps = 2.6; air = true; flip = Math.PI + Math.PI * (T - 12) / 0.7; }
  else if (T < 17) { rps = Math.max(0, 2.6 - (T - 12.7) * 0.7); flip = 2 * Math.PI; if (T < 12.74) hit = 4.8; tilt = 0.12 + 0.1 * Math.sin(t * 1.7); }
  else rps = 0;
  if (rps === 0 && !air) tilt = 0.03 * Math.sin(t * 2.2);
  return { rps, tilt, prec, flip, air, hit };
}
function demoStep(dt) {
  DEMO.t += dt;
  const p = demoPose(DEMO.t);
  DEMO.spinAng += p.rps * 2 * Math.PI * dt;
  // orientamento = precessione · inclinazione · flip · spin  (tutto nel riferimento del sensore)
  let q = Q.axisAngle(0, 0, 1, p.prec + DEMO.extraYaw);
  q = Q.mul(q, Q.axisAngle(1, 0, 0, p.tilt));
  q = Q.mul(q, Q.axisAngle(0, 1, 0, p.flip));
  q = Q.mul(q, Q.axisAngle(0, 0, 1, DEMO.spinAng));
  q = Q.norm(q);
  // velocità angolare nel corpo, dalla differenza di orientamento
  let g = [0, 0, 0];
  if (DEMO.qPrev) {
    let d = Q.mul(Q.conj(DEMO.qPrev), q);
    if (d[0] < 0) d = d.map(v => -v);
    const s = Math.hypot(d[1], d[2], d[3]);
    if (s > 1e-9) { const ang = 2 * Math.atan2(s, d[0]); g = [d[1]/s*ang/dt/D2R, d[2]/s*ang/dt/D2R, d[3]/s*ang/dt/D2R]; }
  }
  DEMO.qPrev = q;
  // accelerazione: gravità vista dal corpo + centrifuga (scheda a 4 cm dal centro) oppure caduta libera
  const up = Q.rotate(Q.conj(q), [0, 0, 1]);
  const wSpin = p.rps * 2 * Math.PI;
  let a = p.air ? [0, 0, 0] : [up[0] - wSpin * wSpin * 0.04 / 9.81, up[1], up[2]];
  if (p.hit) a = [a[0], a[1], a[2] + p.hit];
  const n = (s) => (Math.random() - 0.5) * s;
  onSample({ q, a: [a[0] + n(0.02), a[1] + n(0.02), a[2] + n(0.02)], g: [g[0] + n(0.6), g[1] + n(0.6), g[2] + n(0.6)] });
}
function startDemo() {
  DEMO.t = 0; DEMO.qPrev = null; DEMO.spinAng = 0; DEMO.wall = performance.now();
  DEMO.timer = setInterval(() => {
    const now = performance.now();
    let steps = Math.floor((now - DEMO.wall) / 10);
    if (steps > 50) { DEMO.wall = now - 10 * 50; steps = 50; }
    for (let i = 0; i < steps; i++) { demoStep(0.01); DEMO.wall += 10; }
  }, 10);
  setConnected('demo'); setStatus('demo', 'ok'); log('Demo avviata: spin, wobble, lancio con flip, presa.');
}

async function disconnect() {
  const src = S.source;
  setConnected(null);
  if (src === 'demo') { clearInterval(DEMO.timer); DEMO.timer = null; }
  if (src === 'serial') {
    SER.keep = false;
    try { if (SER.reader) await SER.reader.cancel(); } catch (e) {}
    try { await SER.port.close(); } catch (e) {}
    SER.port = null;
  }
  if (src === 'ble') {
    try { if (BT.device && BT.device.gatt.connected) BT.device.gatt.disconnect(); } catch (e) {}
    BT.device = null; BT.cmd = null;
  }
  if (REC.active) stopRec();
}

// ---------------------------------------------------------------------------
// Scena 3D
// ---------------------------------------------------------------------------
const T3 = window.THREE;
const host = $('three');
const renderer = new T3.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = T3.SRGBColorSpace;
host.appendChild(renderer.domElement);
const scene = new T3.Scene();
scene.fog = new T3.Fog(0x0c0a12, 2.2, 5);
const camera = new T3.PerspectiveCamera(38, 1, 0.01, 50);
const controls = new T3.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.minDistance = 0.3; controls.maxDistance = 5;
function viewSide() { camera.position.set(0.72, 0.62, 0.84); controls.target.set(0, 0, 0); controls.update(); }
function viewTop() { camera.position.set(0, 1.6, 0.001); controls.target.set(0, 0, 0); controls.update(); }
viewSide();

scene.add(new T3.HemisphereLight(0xcfd8ff, 0x1a1428, 1.2));
const sun = new T3.DirectionalLight(0xffffff, 1.8); sun.position.set(1, 2, 1.4); scene.add(sun);
const grid = new T3.GridHelper(4, 40, 0x4a4070, 0x221d34); grid.position.y = -0.45; scene.add(grid);

// La dapo: stella a 8 punte (due quadrati sovrapposti), 65 cm da punta a punta
const R_OUT = 0.325, R_IN = 0.249;
function starShape(rOut, rIn) {
  const s = new T3.Shape();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? rIn : rOut, ang = i * Math.PI / 8;
    i ? s.lineTo(r * Math.cos(ang), r * Math.sin(ang)) : s.moveTo(r * Math.cos(ang), r * Math.sin(ang));
  }
  s.closePath();
  return s;
}
const body = new T3.Group(); scene.add(body);
const dapo = new T3.Group(); body.add(dapo);
dapo.rotation.x = -Math.PI / 2;    // da qui in giù le coordinate sono quelle del sensore (x, y, z=normale)

const starGeo = new T3.ShapeGeometry(starShape(R_OUT, R_IN));
const mat = (c, side, extra) => new T3.MeshStandardMaterial(Object.assign({ color: c, side, roughness: 0.85, metalness: 0 }, extra || {}));
dapo.add(new T3.Mesh(starGeo, mat(0x3a1f6e, T3.FrontSide)));   // faccia A (lato +Z della scheda)
dapo.add(new T3.Mesh(starGeo, mat(0x0f4f5a, T3.BackSide)));    // faccia B
function deco(z, side, c1, c2, c3) {
  const g1 = new T3.CircleGeometry(0.19, 8); g1.rotateZ(Math.PI / 8);
  const m1 = new T3.Mesh(g1, mat(c1, side)); m1.position.z = z; dapo.add(m1);
  const g2 = new T3.RingGeometry(0.105, 0.125, 48);
  const m2 = new T3.Mesh(g2, mat(c2, side)); m2.position.z = z * 2; dapo.add(m2);
  const g3 = new T3.CircleGeometry(0.045, 32);
  const m3 = new T3.Mesh(g3, mat(c3, side)); m3.position.z = z * 2; dapo.add(m3);
}
deco(0.0015, T3.FrontSide, 0x5b2fa0, 0xff4fd8, 0x2a1450);
deco(-0.0015, T3.BackSide, 0x16707e, 0x3de0ff, 0x0a3038);
const tip = new T3.Mesh(new T3.SphereGeometry(0.014, 16, 12), new T3.MeshStandardMaterial({ color: 0xffb547, emissive: 0x6a3a00 }));
tip.position.set(R_OUT, 0, 0); dapo.add(tip);
// Elettronica sull'anello attorno al centro: il centro resta libero per il dito.
// Scheda e batteria da parti opposte, così la dapo resta bilanciata.
const R_HUB = 0.05, HUB_ANG = Math.PI / 8;
{
  const ring = new T3.Mesh(new T3.RingGeometry(R_HUB - 0.0025, R_HUB + 0.0025, 64), new T3.MeshBasicMaterial({ color: 0x8a7fb0, side: T3.DoubleSide }));
  ring.position.z = 0.0035; dapo.add(ring);
  const board = new T3.Mesh(new T3.BoxGeometry(0.021 * 1.5, 0.0175 * 1.5, 0.005), new T3.MeshStandardMaterial({ color: 0xb8bcc8, metalness: 0.7, roughness: 0.35 }));
  board.position.set(R_HUB * Math.cos(HUB_ANG), R_HUB * Math.sin(HUB_ANG), 0.006); dapo.add(board);
  const batt = new T3.Mesh(new T3.BoxGeometry(0.034, 0.024, 0.008), new T3.MeshStandardMaterial({ color: 0x3b4150, roughness: 0.6 }));
  batt.position.set(-R_HUB * Math.cos(HUB_ANG), -R_HUB * Math.sin(HUB_ANG), 0.007); dapo.add(batt);
}
const arrow = (dir, color) => { const a = new T3.ArrowHelper(new T3.Vector3(...dir), new T3.Vector3(0, 0, 0.006), 0.2, color, 0.035, 0.018); dapo.add(a); };
arrow([1, 0, 0], 0xff6b7d); arrow([0, 1, 0], 0x6cf09a); arrow([0, 0, 1], 0x59b8ff);

// ---------------------------------------------------------------------------
// Disposizioni dei LED. Ogni LED sa dove sta: p (metri, coordinate della scheda),
// r = distanza dal centro, rn = 0 al primo LED del raggio … 1 all'ultimo, angB = angolo sulla dapo
// ---------------------------------------------------------------------------
function finishLayout(leds) {
  const rs = leds.map(d => Math.hypot(d.p[0], d.p[1]));
  const r0 = Math.min(...rs), r1 = Math.max(...rs);
  leds.forEach((d, i) => { d.i = i; d.n = leds.length; d.r = rs[i]; d.rn = (rs[i] - r0) / Math.max(1e-6, r1 - r0); d.angB = Math.atan2(d.p[1], d.p[0]); });
  return leds;
}
function spokeLayout(nSpokes, perSpoke, r0, r1) {
  const leds = [];
  for (let s = 0; s < nSpokes; s++) {
    const a = s * 2 * Math.PI / nSpokes;          // raggi verso le punte della stella
    for (let k = 0; k < perSpoke; k++) {
      const r = r0 + (r1 - r0) * k / (perSpoke - 1);
      leds.push({ p: [r * Math.cos(a), r * Math.sin(a), 0], spoke: s, k });
    }
  }
  return finishLayout(leds);
}
function edgeLayout(n) {
  const pts = [];
  for (let i = 0; i < 16; i++) { const r = i % 2 ? R_IN : R_OUT, a = i * Math.PI / 8; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
  const seg = pts.map((p, i) => { const q = pts[(i + 1) % 16]; return { p, q, len: Math.hypot(q[0] - p[0], q[1] - p[1]) }; });
  const total = seg.reduce((s, x) => s + x.len, 0), leds = [];
  for (let k = 0; k < n; k++) {
    let d = (k + 0.5) * total / n, j = 0;
    while (d > seg[j].len) { d -= seg[j].len; j++; }
    const f = d / seg[j].len, s = seg[j];
    leds.push({ p: [s.p[0] + (s.q[0] - s.p[0]) * f, s.p[1] + (s.q[1] - s.p[1]) * f, 0], spoke: -1, k });
  }
  return finishLayout(leds);
}
const LAYOUTS = {
  raggi: { leds: spokeLayout(8, 16, 0.07, 0.30), spokes: [8, 0.07, 0.30] },   // 8 raggi × 16 LED ≈ 65 LED/m
  bordo: { leds: edgeLayout(96) },
};
for (const key in LAYOUTS) {
  const L = LAYOUTS[key];
  L.group = new T3.Group();
  L.mesh = new T3.InstancedMesh(new T3.SphereGeometry(0.0075, 10, 8), new T3.MeshBasicMaterial({ color: 0xffffff }), L.leds.length);
  const o = new T3.Object3D();
  L.leds.forEach((d, i) => { o.position.set(d.p[0], d.p[1], d.p[2]); o.updateMatrix(); L.mesh.setMatrixAt(i, o.matrix); L.mesh.setColorAt(i, new T3.Color(0x222222)); });
  L.group.add(L.mesh);
  if (L.spokes) {                                   // la striscia sotto i LED
    const [ns, r0, r1] = L.spokes, len = r1 - r0 + 0.02;
    for (let s = 0; s < ns; s++) {
      const a = s * 2 * Math.PI / ns;
      const strip = new T3.Mesh(new T3.BoxGeometry(len, 0.007, 0.003), new T3.MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.5 }));
      strip.position.set((r0 + r1) / 2 * Math.cos(a), (r0 + r1) / 2 * Math.sin(a), 0); strip.rotation.z = a;
      L.group.add(strip);
    }
  }
  L.group.visible = false;
  dapo.add(L.group);
}
let layout = LAYOUTS.raggi;
function setLayout(key) { for (const k in LAYOUTS) LAYOUTS[k].group.visible = (k === key); layout = LAYOUTS[key]; }

// ---------------------------------------------------------------------------
// Effetti LED: qui si prototipa la logica "reattiva".
// d   = il LED: rn (0 centro … 1 punta), angB (angolo sulla dapo), angW (angolo fermo nel mondo),
//       u, v (posizione vista di fronte, ferma nel mondo), zw (altezza nel mondo), i/n (indice)
// ctx = il momento: rpm (giri/min col segno), motion (stato), sinceImpact (s dall'ultima presa)
// Restituisce [tinta, saturazione, luminosità], tutti 0..1
// ---------------------------------------------------------------------------
function ledEffect(mode, d, t, ctx) {
  const spin = Math.abs(ctx.rpm);
  switch (mode) {
    case 'speed': {      // colore dalla velocità (blu lento → rosso veloce), onde che corrono nel verso di spin
      const v = clamp(spin / 240, 0, 1);
      const run = Math.sin(4 * d.angB - t * 4 * Math.sign(ctx.rpm || 1));
      return [0.66 - 0.66 * v, 1, 0.1 + 0.4 * clamp(spin / 40, 0, 1) * (0.6 + 0.4 * run)];
    }
    case 'tacho': {      // tachimetro: i raggi si riempiono dal centro in proporzione ai giri
      const fill = clamp(spin / 240, 0, 1);
      return d.rn <= fill ? [0.33 - 0.33 * d.rn, 1, 0.45] : [0, 0, 0.04];
    }
    case 'rings': {      // anelli che respirano; alla presa un'onda parte dal centro verso le punte
      const front = ctx.sinceImpact * 2.2;
      const wave = ctx.sinceImpact < 0.8 ? Math.exp(-((d.rn - front) ** 2) / 0.012) : 0;
      const base = 0.5 + 0.5 * Math.sin(2 * Math.PI * (d.rn * 2 - t * 0.5));
      return [(0.62 + d.rn * 0.3 + t * 0.02) % 1, 1 - 0.8 * wave, 0.06 + 0.17 * base + 0.5 * wave];
    }
    case 'spiral': {     // spirale a due bracci ferma nel mondo: mentre la dapo gira la vedi immobile
      const ph = d.angW + d.rn * Math.PI * 2.2 - t * 0.6;
      const on = (0.5 + 0.5 * Math.cos(2 * ph)) ** 3;
      return [(0.8 + d.rn * 0.25) % 1, 1, 0.03 + 0.5 * on];
    }
    case 'world': {      // un arco di luce fermo nello spazio, sempre dalla stessa parte
      const a = Math.abs(Math.atan2(Math.sin(d.angW), Math.cos(d.angW)));
      return [(t * 0.05) % 1, 1, 0.04 + 0.5 * (a < 0.45 ? 1 - a / 0.45 : 0)];
    }
    case 'pov': {        // immagine ferma nell'aria: un cuore disegnato in coordinate del mondo
      const X = d.u / R_OUT * 1.3, Y = d.v / R_OUT * 1.3 + 0.15;
      const inside = (X * X + Y * Y - 1) ** 3 - X * X * Y * Y * Y <= 0;
      return inside ? [0.96, 1, 0.5] : [0.62, 1, 0.025];
    }
    case 'gravity': {    // fuoco verso il basso: si vede bene se la fai girare inclinata o in verticale
      const down = clamp(-d.zw / (R_OUT * 0.6), -1, 1);
      if (down <= 0) return [0.62, 0.8, 0.03];
      const flick = 0.7 + 0.3 * Math.sin(t * 23 + d.i * 1.7);
      return [0.02 + 0.09 * (1 - down), 1, 0.06 + 0.45 * down * flick];
    }
    case 'toss': {       // in volo: scintille bianche; alla presa: flash magenta; altrimenti respiro lento
      if (ctx.motion === 'in volo') return [0, 0, Math.random() < 0.3 ? 0.95 : 0.25];
      if (ctx.sinceImpact < 0.6) return [0.86, 1, 0.65 * (1 - ctx.sinceImpact / 0.6) + 0.1];
      return [(0.75 + d.i / d.n * 0.2) % 1, 0.9, 0.1 + 0.08 * Math.sin(t * 2 + d.angB * 2)];
    }
    default: return [0, 0, 0.05];
  }
}

// calcola colore e posizione "vista di fronte" di ogni LED per un certo orientamento
function frameBasis(q) {
  const nrm = Q.rotate(q, [0, 0, 1]);
  let ref = [1, 0, 0], dot = nrm[0];
  if (Math.abs(dot) > 0.9) { ref = [0, 1, 0]; dot = nrm[1]; }
  let e1 = [ref[0] - dot * nrm[0], ref[1] - dot * nrm[1], ref[2] - dot * nrm[2]];
  const l = Math.hypot(e1[0], e1[1], e1[2]); e1 = e1.map(v => v / l);
  const e2 = [nrm[1] * e1[2] - nrm[2] * e1[1], nrm[2] * e1[0] - nrm[0] * e1[2], nrm[0] * e1[1] - nrm[1] * e1[0]];
  return { e1, e2 };
}
function evalLeds(q, t, mode, ctx, out) {
  const { e1, e2 } = frameBasis(q);
  for (const d of layout.leds) {
    const w = Q.rotate(q, d.p);
    d.u = w[0] * e1[0] + w[1] * e1[1] + w[2] * e1[2];
    d.v = w[0] * e2[0] + w[1] * e2[1] + w[2] * e2[2];
    d.angW = Math.atan2(d.v, d.u); d.zw = w[2];
    const c = ledEffect(mode, d, t, ctx);
    out(d, c);
  }
}
function slerp(a, b, f) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { b = b.map(v => -v); d = -d; }
  if (d > 0.9995) return Q.norm(a.map((v, i) => v + (b[i] - v) * f));
  const th = Math.acos(d), s = Math.sin(th), ka = Math.sin((1 - f) * th) / s, kb = Math.sin(f * th) / s;
  return a.map((v, i) => v * ka + b[i] * kb);
}

// "Cosa vede l'occhio": disegna i LED in più istanti per fotogramma e lascia una scia,
// come fa la persistenza della visione quando la dapo gira davanti a te
const povCv = $('pov'), povCtx = povCv.getContext('2d');
const POV_SUB = 10;
const tmpColor = new T3.Color();
let prevQ = null, prevT = 0;
function updateLeds(qDisp, t) {
  const mode = $('ledMode').value;
  const ctx = { rpm: S.g[2] / 6, motion: S.motion, sinceImpact: (performance.now() - S.lastImpact) / 1000 };
  // LED nella scena 3D
  evalLeds(qDisp, t, mode, ctx, (d, c) => { tmpColor.setHSL(c[0], c[1], c[2]); layout.mesh.setColorAt(d.i, tmpColor); });
  layout.mesh.instanceColor.needsUpdate = true;
  // scia per la vista "occhio"
  const W = povCv.width, H2 = povCv.height, sc = (W / 2 - 6) / R_OUT;
  povCtx.globalCompositeOperation = 'source-over';
  povCtx.fillStyle = 'rgba(8,6,14,0.32)'; povCtx.fillRect(0, 0, W, H2);
  povCtx.globalCompositeOperation = 'lighter';
  const q0 = prevQ || qDisp, t0 = prevT || t;
  for (let j = 1; j <= POV_SUB; j++) {
    const f = j / POV_SUB, qj = slerp(q0, qDisp, f), tj = t0 + (t - t0) * f;
    evalLeds(qj, tj, mode, ctx, (d, c) => {
      if (c[2] < 0.08) return;
      tmpColor.setHSL(c[0], c[1], c[2]);
      povCtx.fillStyle = `rgba(${tmpColor.r * 255 | 0},${tmpColor.g * 255 | 0},${tmpColor.b * 255 | 0},0.55)`;
      povCtx.beginPath(); povCtx.arc(W / 2 + d.u * sc, H2 / 2 - d.v * sc, 3.2, 0, 6.2832); povCtx.fill();
    });
  }
  prevQ = qDisp; prevT = t;
}
setLayout('raggi');

// orientamento mostrato = Zero · ultimo dato · piccolo avanzamento col gyro (fluido fino a 60 fps)
function displayQuat(now) {
  let q = S.q;
  const age = (now - S.tLast) / 1000;
  if (S.source && age > 0 && age < 0.06) q = Q.integrate(q, S.g, age);
  return Q.mul(S.yawOff, q);
}
function yawOf(q) {
  let f = Q.rotate(q, [1, 0, 0]), off = 0;
  if (Math.hypot(f[0], f[1]) < 0.3) { f = Q.rotate(q, [0, 1, 0]); off = -Math.PI / 2; }
  return Math.atan2(f[1], f[0]) + off;
}
function zero() { S.yawOff = Q.axisAngle(0, 0, 1, -yawOf(S.q)); log('Zero: rotazione attorno alla verticale riallineata'); }

function resize() {
  const r = host.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
  camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);
resize();

// ---------------------------------------------------------------------------
// Grafici
// ---------------------------------------------------------------------------
function setupCanvas(cv) {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const w = Math.max(10, Math.round(r.width * dpr)), h = Math.max(10, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}
function niceRange(maxAbs, min, step) { return Math.max(min, Math.ceil(maxAbs * 1.1 / step) * step); }
function drawChart(cv, title, unit, keys, colors, names, minRange, step, now) {
  const { ctx, w, h } = setupCanvas(cv);
  ctx.clearRect(0, 0, w, h);
  const L = 44, R = 10, Tp = 24, B = 18, pw = w - L - R, ph = h - Tp - B;
  if (pw < 20 || ph < 20) return;
  let maxAbs = 0;
  for (const k of keys) for (const v of H[k]) maxAbs = Math.max(maxAbs, Math.abs(v));
  const range = niceRange(maxAbs, minRange, step);
  const y = v => Tp + ph / 2 - (v / range) * (ph / 2);
  const x = t => L + pw * (1 - (now - t) / HIST_MS);
  ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'middle';
  const ticks = [-range, -range / 2, 0, range / 2, range];
  for (const v of ticks) {
    ctx.strokeStyle = v === 0 ? '#3a3352' : '#221d32'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, y(v)); ctx.lineTo(L + pw, y(v)); ctx.stroke();
    ctx.fillStyle = '#6c6584'; ctx.textAlign = 'right';
    ctx.fillText((Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(1)) + '', L - 6, y(v));
  }
  ctx.textAlign = 'left'; ctx.fillStyle = '#9a93b0'; ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText(`${title} (${unit})`, L, 11);
  let lx = L + ctx.measureText(`${title} (${unit})`).width + 14;
  ctx.font = '11px system-ui, sans-serif';
  names.forEach((nm, i) => { ctx.fillStyle = colors[i]; ctx.fillRect(lx, 7, 10, 3); ctx.fillText(nm, lx + 14, 11); lx += ctx.measureText(nm).width + 28; });
  ctx.fillStyle = '#6c6584'; ctx.textAlign = 'right'; ctx.fillText('ultimi 6 s', L + pw, h - 8);
  ctx.save(); ctx.beginPath(); ctx.rect(L, Tp - 2, pw, ph + 4); ctx.clip();
  keys.forEach((k, i) => {
    const arr = H[k]; if (arr.length < 2) return;
    ctx.strokeStyle = colors[i]; ctx.lineWidth = k === 'an' ? 1.2 : 1.5;
    ctx.setLineDash(k === 'an' ? [4, 3] : []);
    ctx.beginPath();
    for (let j = 0; j < arr.length; j++) { const px = x(H.t[j]), py = y(arr[j]); j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
  });
  ctx.restore(); ctx.setLineDash([]);
}

// ---------------------------------------------------------------------------
// Registrazione dataset
// ---------------------------------------------------------------------------
const REC = { active: false, label: '', rows: [], session: 0, t0: null, stopAt: 0, counts: {}, countdown: null };
function recordRow(now, s) {
  if (REC.t0 === null) REC.t0 = now;
  REC.rows.push([REC.session, REC.label, ((now - REC.t0) / 1000).toFixed(3),
    s.a[0].toFixed(3), s.a[1].toFixed(3), s.a[2].toFixed(3),
    s.g[0].toFixed(1), s.g[1].toFixed(1), s.g[2].toFixed(1),
    S.q[0].toFixed(4), S.q[1].toFixed(4), S.q[2].toFixed(4), S.q[3].toFixed(4)].join(','));
  REC.counts[REC.label] = (REC.counts[REC.label] || 0) + 1;
  if (REC.stopAt && now >= REC.stopAt) stopRec();
}
let audio;
function beep(freq, ms) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(0.15, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + ms / 1000);
    o.start(); o.stop(audio.currentTime + ms / 1000);
  } catch (e) {}
}
function startRec() {
  if (!S.source) { log('Prima connetti la scheda (o la demo)'); return; }
  const label = $('label').value.trim().replace(/[,\n]/g, ' ') || 'senza_etichetta';
  const dur = +$('dur').value;
  const go = () => {
    $('countdown').style.display = 'none';
    REC.active = true; REC.label = label; REC.session++;
    REC.stopAt = dur ? performance.now() + dur * 1000 : 0;
    $('btnRec').textContent = '■ Stop'; $('btnRec').classList.add('rec-on');
    beep(880, 150); log(`Registro "${label}"` + (dur ? ` per ${dur} s` : ''));
  };
  if (!dur) return go();
  let n = 3; const cd = $('countdown');
  cd.style.display = 'flex'; cd.textContent = n; beep(520, 80);
  $('btnRec').textContent = '✕ Annulla'; $('btnRec').classList.add('rec-on');
  REC.countdown = setInterval(() => {
    n--;
    if (n > 0) { cd.textContent = n; beep(520, 80); }
    else { clearInterval(REC.countdown); REC.countdown = null; go(); }
  }, 1000);
}
function stopRec() {
  if (REC.countdown) { clearInterval(REC.countdown); REC.countdown = null; $('countdown').style.display = 'none'; }
  if (REC.active) { beep(440, 300); log(`Stop "${REC.label}"`); }
  REC.active = false; REC.stopAt = 0;
  $('btnRec').textContent = '● Registra'; $('btnRec').classList.remove('rec-on');
  updateCounts();
}
function updateCounts() {
  const keys = Object.keys(REC.counts);
  $('btnCsv').disabled = $('btnClear').disabled = REC.rows.length === 0;
  if (!keys.length) { $('counts').textContent = 'nessun dato registrato'; return; }
  const hz = S.hz || 100;
  $('counts').innerHTML = keys.map(k => `<b>${k.replace(/</g, '&lt;')}</b>: ${REC.counts[k]} campioni (~${(REC.counts[k] / hz).toFixed(0)} s)`).join('<br>')
    + `<br>${REC.session} sessioni, ${REC.rows.length} righe totali`;
}
function downloadCsv() {
  const head = 'session,label,t_s,ax_g,ay_g,az_g,gx_dps,gy_dps,gz_dps,qw,qx,qy,qz';
  const blob = new Blob([head + '\n' + REC.rows.join('\n') + '\n'], { type: 'text/csv' });
  const d = new Date(), pad = v => String(v).padStart(2, '0');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `dapo-dataset-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------------------------------------------------------------------
// Ciclo di disegno
// ---------------------------------------------------------------------------
let frame = 0, lastStats = 0;
function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  const qd = displayQuat(now);
  body.quaternion.set(qd[1], qd[3], -qd[2], qd[0]);    // sensore (Z su) → three.js (Y su)
  updateLeds(qd, now / 1000);
  controls.update();
  renderer.render(scene, camera);

  if (++frame % 2 === 0) {
    drawChart($('chartA'), 'Accelerometro', 'g', ['ax', 'ay', 'az', 'an'], ['#ff6b7d', '#6cf09a', '#59b8ff', '#ece8f6'], ['x', 'y', 'z', '|a|'], 2, 2, now);
    drawChart($('chartG'), 'Giroscopio', '°/s', ['gx', 'gy', 'gz'], ['#ff6b7d', '#6cf09a', '#59b8ff'], ['x', 'y', 'z'], 250, 250, now);
  }
  if (now - S.hzT0 >= 1000) { S.hz = S.hzN * 1000 / (now - S.hzT0); S.hzN = 0; S.hzT0 = now; }
  if (now - lastStats > 100) { lastStats = now; updateStats(now); }
}
function updateStats(now) {
  const live = S.source && now - S.tLast < 500;
  if (!live) {
    for (const id of ['sRpm', 'sTilt', 'sFace']) $(id).textContent = '—';
    $('sRate').innerHTML = '—<small>°/s</small>'; $('sAcc').innerHTML = '—<small>g</small>';
    $('motion').textContent = S.source ? 'in attesa di dati…' : '—';
    $('sHz').innerHTML = (S.source ? '0' : '—') + '<small>Hz</small>';
    $('warn').style.display = 'none';
    return;
  }
  const g = S.g, rpm = g[2] / 6;
  $('sRpm').innerHTML = Math.round(Math.abs(rpm)) + `<small>${Math.abs(rpm) < 5 ? '' : (rpm > 0 ? '↺' : '↻')}</small>`;
  $('sRate').innerHTML = Math.round(Math.hypot(g[0], g[1], g[2])) + '<small>°/s</small>';
  const q = S.q, zUp = 1 - 2 * (q[1] * q[1] + q[2] * q[2]);
  const tilt = Math.acos(clamp(Math.abs(zUp), -1, 1)) / D2R;
  $('sTilt').innerHTML = Math.round(tilt) + '<small>°</small>';
  $('sFace').textContent = zUp >= 0 ? 'A' : 'B';
  $('sAcc').innerHTML = Math.hypot(S.a[0], S.a[1], S.a[2]).toFixed(2) + '<small>g</small>';
  $('motion').textContent = S.motion;
  $('sHz').innerHTML = Math.round(S.hz) + '<small>Hz</small>';
  // avvisi di saturazione (picchi nell'ultimo secondo)
  if (now - S.peakT0 > 1000) {
    const msgs = [];
    if (S.peakG > 2200) msgs.push('Giroscopio al limite (±2000 °/s, circa 5,5 giri/s): sopra questa velocità l\'orientamento stimato perde precisione.');
    if (S.peakA > 15.8) msgs.push('Accelerometro al limite (±16 g): colpo molto forte o scheda lontana dal centro di rotazione.');
    $('warn').innerHTML = msgs.join('<br>'); $('warn').style.display = msgs.length ? 'block' : 'none';
    S.peakG = 0; S.peakA = 0; S.peakT0 = now;
  }
  if (REC.active) updateCounts();
}

// ---------------------------------------------------------------------------
// Pulsanti
// ---------------------------------------------------------------------------
$('btnSerial').onclick = connectSerial;
$('btnBle').onclick = connectBle;
$('btnDemo').onclick = startDemo;
$('btnDisc').onclick = disconnect;
$('btnZero').onclick = zero;
$('btnLevel').onclick = () => sendCmd('r');
$('btnCal').onclick = () => sendCmd('c');
$('btnTop').onclick = viewTop;
$('ledLayout').onchange = e => setLayout(e.target.value);
$('btnSide').onclick = viewSide;
$('btnRec').onclick = () => (REC.active || REC.countdown) ? stopRec() : startRec();
$('btnCsv').onclick = downloadCsv;
$('btnClear').onclick = () => { if (confirm('Cancellare tutti i dati registrati?')) { REC.rows = []; REC.counts = {}; REC.session = 0; REC.t0 = null; updateCounts(); } };
for (const l of ['ferma', 'spin', 'wobble', 'lancio', 'flip', 'presa']) {
  const b = document.createElement('button'); b.textContent = l;
  b.onclick = () => { $('label').value = l; };
  $('quickLabels').appendChild(b);
}
applySupport();
if (location.protocol === 'file:' && !('bluetooth' in navigator) && !('serial' in navigator)) log('Apri questa pagina con Chrome o Edge su computer.');
log('Pronto. Collega la scheda via USB o Bluetooth, oppure prova la Demo.');
requestAnimationFrame(tick);
})();
