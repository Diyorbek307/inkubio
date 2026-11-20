import * as THREE from 'three';
import { std } from './mat.js';
import { createChick, createPose } from './chick.js';
import { range, kf, easeIn, easeOut, lerp, bump, rng } from './util.js';

/*
 Processing line along +x.
  Belt A: top y = 0, z = -1.5, x from -16 to 8  (chicks ride on it)
  Scanner gate at x = 3.5
  Chute from (8, 0) down to (9.6, -1.5)
  Belt B: top y = -1.6, boxes travel to the truck
  Truck cargo opening at x = 19.2
*/
export const LINE_Z = -1.5;
const BELT_END = 8;
const FILL_X = 9.6;
const BOX_GAP = 2.6;
const BOX_Y = -1.6;
const N_CHICKS = 8;
const N_BOXES = 4;
const GATE_X = 3.5;
const VAX_X = 6.1; // spray vaccination station
const V = 33; // belt speed in world units per unit of q
const Q_START = 0.1;
const CHICK_GAP = 1.6;
const SEAT = [-0.52, 0.52];

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#2a2e33';
  x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#3b4148';
  for (let i = 0; i < 8; i++) x.fillRect(i * 32, 0, 10, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#979fa8';
  x.fillRect(0, 0, 512, 512);
  x.strokeStyle = 'rgba(40,50,60,0.12)';
  x.lineWidth = 3;
  for (let i = 0; i <= 512; i += 128) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 40);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function cardboardTexture(label = true) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#c99a62';
  x.fillRect(0, 0, 512, 256);
  const r = rng(11);
  for (let i = 0; i < 260; i++) {
    x.fillStyle = `rgba(120,80,40,${r() * 0.08})`;
    x.fillRect(r() * 512, 0, 1 + r() * 2, 256);
  }
  x.fillStyle = '#4d3420';
  for (let i = 0; i < 6; i++) {
    x.beginPath();
    x.arc(60 + i * 78, 60, 13, 0, Math.PI * 2);
    x.fill();
  }
  if (label) {
    x.font = '800 44px Unbounded, Manrope, sans-serif';
    x.fillStyle = '#3a2717';
    x.fillText('INKUBIO', 40, 170);
    x.font = '700 24px Manrope, sans-serif';
    x.fillText('ЖИВЫЕ ЦЫПЛЯТА · ОСТОРОЖНО', 40, 215);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function truckSideTexture() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 720;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 2048, 0);
  g.addColorStop(0, '#f7f8fa');
  g.addColorStop(1, '#e9edf1');
  x.fillStyle = g;
  x.fillRect(0, 0, 2048, 720);
  x.fillStyle = '#ffc93a';
  x.fillRect(0, 560, 2048, 40);
  x.fillStyle = '#16181b';
  x.fillRect(0, 600, 2048, 14);
  // egg logo
  x.fillStyle = '#16181b';
  x.beginPath();
  x.ellipse(260, 300, 120, 160, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#ffc93a';
  x.beginPath();
  x.arc(260, 330, 62, 0, Math.PI * 2);
  x.fill();
  x.font = '800 190px Unbounded, Manrope, sans-serif';
  x.fillStyle = '#16181b';
  x.fillText('INKUBIO', 440, 360);
  x.font = '600 64px Manrope, sans-serif';
  x.fillStyle = '#5b636b';
  x.fillText('Суточные цыплята · Доставка с климат-контролем', 450, 470);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function createLine({ chickLayers = 6 } = {}) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#b9c1c9', roughness: 0.3, metalness: 0.85 });
  const white = std({ color: '#dfe4e9', roughness: 0.4, clearcoat: 0.4, envMapIntensity: 0.6 });
  const darkM = new THREE.MeshStandardMaterial({ color: '#23272c', roughness: 0.6, metalness: 0.3 });
  const accent = new THREE.MeshStandardMaterial({ color: '#ffc93a', roughness: 0.45 });
  const box = (w, h, d, mat, x, y, z, parent = g) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // factory floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: gridTexture(), roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.6;
  floor.receiveShadow = true;
  g.add(floor);

  // belt A
  const AX0 = -16, AX1 = BELT_END;
  const beltTexA = stripeTexture();
  beltTexA.repeat.set((AX1 - AX0) / 1.2, 1);
  box(AX1 - AX0, 0.3, 1.9, white, (AX0 + AX1) / 2, -0.2, LINE_Z);
  const beltA = new THREE.Mesh(new THREE.BoxGeometry(AX1 - AX0, 0.04, 1.6), new THREE.MeshStandardMaterial({ map: beltTexA, roughness: 0.8 }));
  beltA.position.set((AX0 + AX1) / 2, -0.02, LINE_Z);
  beltA.receiveShadow = true;
  g.add(beltA);
  for (const dz of [-0.95, 0.95]) box(AX1 - AX0, 0.22, 0.06, steel, (AX0 + AX1) / 2, 0.1, LINE_Z + dz);
  box(AX1 - AX0, 0.06, 0.04, accent, (AX0 + AX1) / 2, -0.2, LINE_Z + 0.97);
  for (let x = AX0 + 1; x < AX1; x += 3) {
    for (const dz of [-0.75, 0.75]) box(0.1, 2.25, 0.1, steel, x, -1.5, LINE_Z + dz);
  }

  // scanner / sorting gate
  const gate = new THREE.Group();
  gate.position.set(GATE_X, 0, LINE_Z);
  g.add(gate);
  for (const dz of [-1.25, 1.25]) box(0.3, 2.6, 0.3, white, 0, 1.0, dz, gate);
  box(0.6, 0.45, 2.8, white, 0, 2.4, 0, gate);
  box(0.62, 0.06, 2.82, accent, 0, 2.18, 0, gate);
  const scanMat = new THREE.MeshBasicMaterial({ color: '#3dff9a', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const scanPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.1), scanMat);
  scanPlane.rotation.y = Math.PI / 2;
  scanPlane.position.y = 1.05;
  gate.add(scanPlane);
  const scanLineMat = new THREE.MeshBasicMaterial({ color: '#5dffb0', toneMapped: false });
  const scanLine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 2.3), scanLineMat);
  gate.add(scanLine);
  const gateLight = new THREE.PointLight('#3dff9a', 0, 5, 1.5);
  gateLight.position.set(GATE_X, 1.2, LINE_Z);

  // chute
  const chute = new THREE.Group();
  g.add(chute);
  const chuteLen = Math.hypot(FILL_X - BELT_END, 1.45);
  const chuteAng = Math.atan2(1.45, FILL_X - BELT_END);
  const slide = box(chuteLen, 0.06, 1.3, std({ color: '#9fd3ff', roughness: 0.2, clearcoat: 1 }), 0, 0, 0, chute);
  for (const dz of [-0.68, 0.68]) box(chuteLen, 0.35, 0.05, white, 0, 0.15, dz, chute);
  chute.position.set((BELT_END + FILL_X) / 2, -0.75, LINE_Z);
  chute.rotation.z = -chuteAng;
  slide.receiveShadow = true;

  // belt B (boxes)
  const BX0 = 6.0, BX1 = 19.4;
  const beltTexB = stripeTexture();
  beltTexB.repeat.set((BX1 - BX0) / 1.2, 1);
  box(BX1 - BX0, 0.3, 2.0, white, (BX0 + BX1) / 2, BOX_Y - 0.2, LINE_Z);
  const beltB = new THREE.Mesh(new THREE.BoxGeometry(BX1 - BX0, 0.04, 1.8), new THREE.MeshStandardMaterial({ map: beltTexB, roughness: 0.8 }));
  beltB.position.set((BX0 + BX1) / 2, BOX_Y - 0.02, LINE_Z);
  g.add(beltB);
  for (let x = BX0 + 0.5; x < BX1; x += 2.5) for (const dz of [-0.8, 0.8]) box(0.1, 0.7, 0.1, steel, x, -2.25, LINE_Z + dz);

  // spray vaccination station: a hood with nozzles; a fine mist falls when a chick passes
  const vax = new THREE.Group();
  vax.position.set(VAX_X, 0, LINE_Z);
  g.add(vax);
  for (const dz of [-1.1, 1.1]) box(0.22, 2.3, 0.22, white, 0, 0.95, dz, vax);
  box(1.3, 0.5, 2.5, white, 0, 2.2, 0, vax);
  box(1.32, 0.06, 2.52, new THREE.MeshStandardMaterial({ color: '#4fb8ff', roughness: 0.4 }), 0, 1.96, 0, vax);
  const nozzleGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.14, 10);
  for (const dz of [-0.6, -0.2, 0.2, 0.6]) {
    const nz = new THREE.Mesh(nozzleGeo, steel);
    nz.position.set(0, 1.86, dz);
    vax.add(nz);
  }
  const mistN = 260;
  const mistPos = new Float32Array(mistN * 3);
  const mistSeed = [];
  const rm = rng(19);
  for (let i = 0; i < mistN; i++) mistSeed.push([(rm() - 0.5) * 0.9, rm(), (rm() - 0.5) * 1.6, 0.5 + rm()]);
  const mistGeo = new THREE.BufferGeometry();
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
  const mistTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const mistMat = new THREE.PointsMaterial({ size: 0.32, map: mistTex, color: '#7fc4ff', transparent: true, opacity: 0, depthWrite: false });
  const mist = new THREE.Points(mistGeo, mistMat);
  vax.add(mist);
  const vaxSign = (() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#4fb8ff';
    x.font = '800 54px Unbounded, Manrope, sans-serif';
    x.fillText('ВАКЦИНАЦИЯ', 14, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.225), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
  })();
  vaxSign.position.set(0, 2.25, 1.26);
  vax.add(vaxSign);
  let mistLevel = 0;

  // back wall of the hall with a band of windows, for depth
  const wallTex = (() => {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#e4e8ec';
    x.fillRect(0, 0, 1024, 256);
    x.fillStyle = '#d6dbe0';
    for (let i = 0; i < 1024; i += 64) x.fillRect(i, 0, 3, 256);
    const win = x.createLinearGradient(0, 40, 0, 110);
    win.addColorStop(0, '#f8fbff');
    win.addColorStop(1, '#cfe2f2');
    x.fillStyle = win;
    for (let i = 8; i < 1024; i += 128) x.fillRect(i, 40, 110, 70);
    x.fillStyle = '#ffc93a';
    x.fillRect(0, 214, 1024, 10);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(4, 1);
    return t;
  })();
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(90, 11), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }));
  wall.position.set(10, 2.9, -9);
  wall.receiveShadow = true;
  g.add(wall);

  // box feeder housing
  const feeder = box(2.0, 1.15, 2.3, white, 7.1, BOX_Y + 0.55, LINE_Z);
  box(2.02, 0.08, 2.32, accent, 7.1, BOX_Y + 0.9, LINE_Z);
  feeder.castShadow = true;

  // transport boxes
  const cardSide = new THREE.MeshStandardMaterial({ map: cardboardTexture(true), roughness: 0.9 });
  const cardPlain = new THREE.MeshStandardMaterial({ color: '#c3955f', roughness: 0.95 });
  const boxes = [];
  const BL = 2.2, BW = 1.4, BH = 1.05, BT = 0.05;
  for (let j = 0; j < N_BOXES; j++) {
    const b = new THREE.Group();
    g.add(b);
    box(BL, BT, BW, cardPlain, 0, BT / 2, 0, b);
    box(BL, BH, BT, cardSide, 0, BH / 2, BW / 2, b);
    box(BL, BH, BT, cardSide, 0, BH / 2, -BW / 2, b);
    box(BT, BH, BW, cardPlain, BL / 2, BH / 2, 0, b);
    box(BT, BH, BW, cardPlain, -BL / 2, BH / 2, 0, b);
    const flaps = [];
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(0, BH, (s * BW) / 2);
      b.add(hinge);
      const f = box(BL, 0.04, BW / 2, cardPlain, 0, 0, (-s * BW) / 4, hinge);
      f.castShadow = true;
      flaps.push({ hinge, s });
    }
    boxes.push({ group: b, flaps });
  }

  // truck
  const truck = new THREE.Group();
  g.add(truck);
  const TX0 = 19.2, TX1 = 30.0, TY0 = -1.75, TY1 = 2.0, TZ = LINE_Z, TWID = 3.0;
  const sideTex = truckSideTexture();
  const sideMat = std({ map: sideTex, roughness: 0.4, clearcoat: 0.6 });
  const tlen = TX1 - TX0, th = TY1 - TY0;
  box(tlen, th, 0.08, sideMat, (TX0 + TX1) / 2, (TY0 + TY1) / 2, TZ + TWID / 2, truck);
  box(tlen, th, 0.08, white, (TX0 + TX1) / 2, (TY0 + TY1) / 2, TZ - TWID / 2, truck);
  box(tlen, 0.1, TWID, white, (TX0 + TX1) / 2, TY1, TZ, truck);
  box(tlen, 0.15, TWID, darkM, (TX0 + TX1) / 2, TY0 + 0.07, TZ, truck);
  box(0.1, th, TWID, white, TX1, (TY0 + TY1) / 2, TZ, truck);
  box(tlen + 0.4, 0.35, TWID - 0.3, darkM, (TX0 + TX1) / 2 + 0.6, TY0 - 0.25, TZ, truck);
  // rear frame
  for (const dz of [-TWID / 2, TWID / 2]) box(0.2, th, 0.2, darkM, TX0, (TY0 + TY1) / 2, TZ + dz, truck);
  box(0.2, 0.2, TWID, darkM, TX0, TY1, TZ, truck);
  // roll-up door
  const door = new THREE.Group();
  door.position.set(TX0 - 0.05, TY1, TZ);
  truck.add(door);
  const doorMesh = box(0.06, th, TWID - 0.1, new THREE.MeshStandardMaterial({ color: '#e2e6ea', roughness: 0.5, metalness: 0.3 }), 0, -th / 2, 0, door);
  // cab
  const cabMat = std({ color: '#16181b', roughness: 0.25, clearcoat: 1, metalness: 0.3 });
  box(2.4, 2.3, TWID - 0.1, cabMat, TX1 + 1.35, -0.5, TZ, truck);
  box(1.2, 1.0, TWID - 0.2, std({ color: '#7fb6e6', roughness: 0.05, metalness: 0.2, clearcoat: 1 }), TX1 + 2.0, 0.25, TZ, truck);
  box(0.3, 0.25, TWID - 0.2, accent, TX1 + 2.55, -1.3, TZ, truck);
  const lightMat = new THREE.MeshBasicMaterial({ color: '#fff6d8', toneMapped: false });
  for (const dz of [-1.1, 1.1]) box(0.06, 0.2, 0.4, lightMat, TX1 + 2.58, -1.0, TZ + dz, truck);
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.45, 28);
  wheelGeo.rotateX(Math.PI / 2);
  const tyre = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 });
  const hubGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.47, 6);
  hubGeo.rotateX(Math.PI / 2);
  for (const x of [TX0 + 1.5, TX0 + 2.9, TX1 + 1.6]) {
    for (const dz of [-TWID / 2 + 0.2, TWID / 2 - 0.2]) {
      const w = new THREE.Group();
      w.position.set(x, -2.0, TZ + dz);
      truck.add(w);
      const tm = new THREE.Mesh(wheelGeo, tyre);
      tm.castShadow = true;
      w.add(tm, new THREE.Mesh(hubGeo, steel));
      wheels.push(w);
    }
  }

  // chicks on the line (index 0 is the hero, supplied from outside)
  const others = [];
  const tints = ['#f2bd3b', '#f0b835', '#f4c443', '#eeb431', '#f3c040', '#f1ba38', '#f4c245'];
  for (let i = 1; i < N_CHICKS; i++) {
    const c = createChick({ color: tints[i - 1], seed: i * 3 + 1, layers: chickLayers });
    c.pose2 = createPose();
    c.blinkT = 0;
    g.add(c.root);
    others.push(c);
  }

  // timing helpers
  const landQ = (i) => Q_START + (FILL_X + 0.2 + i * CHICK_GAP) / V;
  const lastLand = landQ(N_CHICKS - 1);
  function boxOffset(q) {
    let o = 0;
    for (let j = 0; j < N_BOXES - 1; j++) {
      const a = landQ(2 * j + 1) + 0.85 / V, b = landQ(2 * j + 2) - 0.003;
      o += easeOut(range(q, a, b)) * (b > a ? 1 : 0);
    }
    o += range(q, lastLand + 0.85 / V + 0.004, 0.84) * 4.7;
    return o;
  }
  const deep = (j) => 28.6 - j * 2.35;

  const state = { scanned: 0, packed: 0, gateActive: -1 };
  const tmp = new THREE.Vector3();

  // Where is chick i at progress q?  Returns {x,y,z, mode}
  function chickPlace(i, q, out) {
    const s = Math.max(0, q - Q_START) * V - i * CHICK_GAP; // distance travelled from x = 0
    let x = s, y = 0, z = LINE_Z, mode = 'belt';
    if (s >= BELT_END && s < FILL_X + 0.2) {
      const f = range(s, BELT_END, FILL_X + 0.2);
      x = lerp(BELT_END, FILL_X, f);
      y = lerp(0, BOX_Y + 0.08, f);
      mode = 'chute';
    } else if (s >= FILL_X + 0.2) {
      mode = 'box';
    }
    out.x = x; out.y = y; out.z = z; out.mode = mode; out.s = s;
    return out;
  }

  const place = {};
  const boxPos = [];
  function update(q, time, dt, hero) {
    // belt motion
    const moving = range(q, Q_START, Q_START + 0.01);
    beltTexA.offset.x = -Math.max(0, q - Q_START) * V / 1.2;
    const o = boxOffset(q);
    beltTexB.offset.x = -o * BOX_GAP / 1.2;

    // truck
    const doorC = range(q, 0.84, 0.885);
    door.scale.y = Math.max(0.02, doorC);
    const drive = easeIn(range(q, 0.885, 1));
    const dx = drive * 34;
    truck.position.x = dx;
    for (const w of wheels) w.rotation.z = -dx / 0.6;

    // boxes
    for (let j = 0; j < N_BOXES; j++) {
      let x = FILL_X + (o - j) * BOX_GAP;
      const inside = x >= deep(j);
      x = Math.min(x, deep(j));
      if (x > TX0 + 0.5) x += dx;
      boxPos[j] = x;
      const b = boxes[j];
      b.group.position.set(x, BOX_Y, LINE_Z);
      b.group.visible = x > 6.4;
      const close = range(o, j + 0.08, j + 0.45);
      for (const f of b.flaps) f.hinge.rotation.x = f.s * (1 - close) * 2.3;
    }

    // chicks
    let scanned = 0, packed = 0, gateActive = -1, vaxActive = false;
    const all = [hero, ...others];
    for (let i = 0; i < N_CHICKS; i++) {
      const c = all[i];
      if (!c) continue;
      chickPlace(i, q, place);
      const p = i === 0 ? c.pose : c.pose2;
      if (i > 0) {
        // idle life
        p.blink = Math.max(bump((time + i * 1.3) % 3.7, 0.2, 0.12), 0);
        p.headYaw = Math.sin(time * 0.9 + i * 2.1) * 0.45;
        p.headPitch = Math.sin(time * 0.7 + i) * 0.12;
        p.wing = 0;
        p.hop = 0;
        p.walk = 0;
        p.lean = 0;
      }
      let sit = 0, scale = 1;
      if (place.mode === 'box') {
        const j = Math.floor(i / 2);
        const seat = SEAT[i % 2];
        const into = range(place.s, FILL_X + 0.2, FILL_X + 1.0);
        const bx = boxPos[j];
        place.x = lerp(FILL_X, bx + seat, into);
        place.y = BOX_Y + 0.06;
        sit = into;
        scale = lerp(1, 0.78, into);
        packed++;
      }
      if (place.mode === 'chute') {
        sit = 0.4;
      }
      if (place.s > GATE_X + 0.4) scanned++;
      if (Math.abs(place.s - GATE_X) < 0.9) gateActive = i;
      if (Math.abs(place.s - VAX_X) < 0.7) vaxActive = true;
      p.sit = sit;
      p.tuck = 0;
      c.root.position.set(place.x, place.y, place.z);
      c.root.scale.setScalar(scale);
      if (i > 0) {
        c.root.rotation.y = lerp(Math.PI / 2, 0.25, sit);
        c.apply(p, time + i, dt);
      }
      c.root.visible = place.x > -15.5;
    }
    state.scanned = scanned;
    state.packed = packed;
    state.gateActive = gateActive;

    // vaccination mist
    mistLevel += ((vaxActive ? 1 : 0) - mistLevel) * Math.min(1, dt * 6);
    mistMat.opacity = mistLevel * 0.85;
    mist.visible = mistLevel > 0.01;
    if (mist.visible) {
      for (let i = 0; i < mistN; i++) {
        const [x, ph, z, sp] = mistSeed[i];
        const f = (ph + time * sp * 0.9) % 1; // falls from the nozzles to the belt
        mistPos[i * 3] = x * (0.3 + f * 0.8);
        mistPos[i * 3 + 1] = 1.8 - f * 1.6;
        mistPos[i * 3 + 2] = z * (0.4 + f * 0.6);
      }
      mistGeo.attributes.position.needsUpdate = true;
    }

    // scanner animation
    const active = gateActive >= 0 ? 1 : 0;
    scanLine.position.y = 0.1 + (0.5 + 0.5 * Math.sin(time * 5)) * 1.9;
    scanMat.opacity = 0.08 + active * 0.14;
    gateLight.intensity = active * 6;
    scanLineMat.color.set(active ? '#7dffc0' : '#3dbb7a');
    return state;
  }

  const gateAnchor = new THREE.Vector3(GATE_X, 3.0, LINE_Z);
  const setFurDensity = (d) => others.forEach((c) => c.setFurDensity(d));
  return { group: g, update, gateAnchor, gateLight, setFurDensity, Q_START, others, chickPlace: (i, q) => chickPlace(i, q, {}) };
}
