import * as THREE from 'three';
import { std } from './mat.js';
import { createChick, createPose } from './chick.js';
import { range, kf, easeIn, easeOut, lerp, bump, rng } from './util.js';
import { drawLogo } from './logo.js';
const L = (s) => (window.I18N ? window.I18N.t(s) : s); // texts painted on the model, in the page language

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

const canvasTex = (w, h, draw, { srgb = true, rx = 1, ry = 1 } = {}) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

// polished concrete: soft blotches, fine speckle, saw-cut joints every 6 m, faint tyre marks
function concreteTexture() {
  return canvasTex(1024, 1024, (x, N) => {
    x.fillStyle = '#b3b7ba';
    x.fillRect(0, 0, N, N);
    const r = rng(23);
    for (let i = 0; i < 260; i++) {
      const cx = r() * N, cy = r() * N, rad = 30 + r() * 170;
      const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const dark = r() < 0.6;
      gr.addColorStop(0, dark ? `rgba(80,86,92,${0.04 + r() * 0.06})` : `rgba(255,255,255,${0.03 + r() * 0.05})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr;
      x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
    const img = x.getImageData(0, 0, N, N);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * 16;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    x.putImageData(img, 0, 0);
    x.strokeStyle = 'rgba(70,74,78,0.18)';
    x.lineWidth = 7;
    for (let i = 0; i < 9; i++) {
      x.beginPath();
      const y0 = r() * N;
      x.moveTo(0, y0);
      x.bezierCurveTo(N * 0.3, y0 + (r() - 0.5) * 300, N * 0.7, y0 + (r() - 0.5) * 300, N, y0 + (r() - 0.5) * 120);
      x.stroke();
    }
    x.fillStyle = 'rgba(55,60,64,0.55)';
    for (let i = 0; i < N; i += 256) { x.fillRect(i, 0, 3, N); x.fillRect(0, i, N, 3); }
  }, { rx: 400 / 24, ry: 400 / 24 });
}

// profiled steel cladding (vertical ribs)
function claddingTexture(rx, ry) {
  return canvasTex(256, 64, (x, w, h) => {
    x.fillStyle = '#dde1e4';
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 32) {
      const gr = x.createLinearGradient(i, 0, i + 32, 0);
      gr.addColorStop(0, '#c9ced2');
      gr.addColorStop(0.18, '#f1f3f5');
      gr.addColorStop(0.32, '#d3d8dc');
      gr.addColorStop(0.5, '#dfe3e6');
      gr.addColorStop(1, '#d9dde1');
      x.fillStyle = gr;
      x.fillRect(i, 0, 32, h);
    }
  }, { rx, ry });
}

// high window band: glazing in a mullion grid, daylight behind
function glazingTexture(rx) {
  return canvasTex(512, 128, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#f6fbff');
    gr.addColorStop(1, '#cfe1ef');
    x.fillStyle = gr;
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#7d8a96';
    for (let i = 0; i < w; i += 64) x.fillRect(i, 0, 6, h);
    x.fillRect(0, 0, w, 7);
    x.fillRect(0, h - 7, w, 7);
    x.fillRect(0, h / 2 - 2, w, 4);
  }, { rx, ry: 1 });
}

// yellow / black safety hatching
function hazardTexture(rx, ry) {
  return canvasTex(128, 128, (x, w) => {
    x.fillStyle = '#f2c21b';
    x.fillRect(0, 0, w, w);
    x.fillStyle = '#1b1c1e';
    for (let i = -w; i < w * 2; i += 48) {
      x.beginPath();
      x.moveTo(i, 0); x.lineTo(i + 24, 0); x.lineTo(i + 24 - w, w); x.lineTo(i - w, w);
      x.fill();
    }
  }, { rx, ry });
}

/*
 Steel-framed hangar: back wall at z = -15 (x from -40 to 46), end wall with an open gate at x = 46,
 roof at y = 13. Floor level y = -2.6.
*/
function buildHall(g) {
  const FY = -2.6, BZ = -15, EX = 46, RY = 13;
  const hall = new THREE.Group();
  g.add(hall);
  const plane = (w, h, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    hall.add(m);
    return m;
  };

  // floor
  const concrete = concreteTexture();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.62, roughnessMap: concrete, envMapIntensity: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FY;
  floor.receiveShadow = true;
  hall.add(floor);
  // painted walkway lines and a hatched zone at the gate
  const paint = new THREE.MeshStandardMaterial({ color: '#f2c21b', roughness: 0.5 });
  for (const z of [3.4, -6.4, BZ + 3.3]) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(86, 0.16), paint);
    l.rotation.x = -Math.PI / 2;
    l.position.set(3, FY + 0.012, z);
    hall.add(l);
  }
  const hatch = new THREE.Mesh(new THREE.PlaneGeometry(5, 10), new THREE.MeshStandardMaterial({ map: hazardTexture(5, 10), roughness: 0.5 }));
  hatch.rotation.x = -Math.PI / 2;
  hatch.position.set(EX - 2.6, FY + 0.012, -1.5);
  hall.add(hatch);

  // walls: concrete plinth, profiled cladding, a band of high windows, cladding up to the roof
  const plinth = new THREE.MeshStandardMaterial({ color: '#9ea4a9', roughness: 0.9 });
  const cladMat = (w, h) => new THREE.MeshStandardMaterial({ map: claddingTexture(w / 2.4, 1), roughness: 0.6, metalness: 0.2 });
  const glaze = (w) => new THREE.MeshBasicMaterial({ map: glazingTexture(w / 4) });
  const BW = EX + 40, BX = (EX - 40) / 2;
  plane(BW, 1.4, plinth, BX, FY + 0.7, BZ);
  plane(BW, 7.6, cladMat(BW, 7.6), BX, FY + 1.4 + 3.8, BZ);
  plane(BW, 2.4, glaze(BW), BX, 7.6, BZ + 0.01);
  plane(BW, RY - 8.8, cladMat(BW, RY - 8.8), BX, (8.8 + RY) / 2, BZ);
  // end wall with the open gate (z from -6.5 to 3.5, up to y = 6.2)
  const GZ0 = -6.5, GZ1 = 3.5, GY = 6.2, EZ1 = 60;
  const side = (z0, z1, y0, y1, mat) => plane(z1 - z0, y1 - y0, mat, EX, (y0 + y1) / 2, (z0 + z1) / 2, -Math.PI / 2);
  side(BZ, GZ0, FY, RY, cladMat(GZ0 - BZ, 10));
  side(GZ1, EZ1, FY, RY, cladMat(EZ1 - GZ1, 10));
  side(GZ0, GZ1, GY, RY, cladMat(GZ1 - GZ0, 6));
  // gate frame, rolled-up door, bollards
  const hz = new THREE.MeshStandardMaterial({ map: hazardTexture(1, 6), roughness: 0.5 });
  for (const z of [GZ0, GZ1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, GY - FY, 0.5), hz);
    post.position.set(EX - 0.25, (FY + GY) / 2, z);
    hall.add(post);
  }
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, GZ1 - GZ0 + 0.6, 24), new THREE.MeshStandardMaterial({ color: '#8e979f', roughness: 0.4, metalness: 0.7 }));
  roll.rotation.x = Math.PI / 2;
  roll.position.set(EX - 0.6, GY + 0.45, (GZ0 + GZ1) / 2);
  hall.add(roll);
  const bollardMat = new THREE.MeshStandardMaterial({ color: '#f2c21b', roughness: 0.45 });
  for (const z of [GZ0 - 0.9, GZ1 + 0.9]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.4, 16), bollardMat);
    b.position.set(EX - 1.2, FY + 0.7, z);
    hall.add(b);
  }
  // daylight outside the gate: yard and bright sky
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(120, 160), new THREE.MeshStandardMaterial({ color: '#5d6266', roughness: 0.95 }));
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(EX + 60, FY + 0.01, 0);
  hall.add(yard);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(200, 80), new THREE.MeshBasicMaterial({ color: '#f4f8fb', fog: false }));
  sky.rotation.y = -Math.PI / 2;
  sky.position.set(EX + 70, 30, 0);
  hall.add(sky);

  // steel frame: I-beam columns every 8 m along the back wall, rafters across, purlins along
  const frameMat = new THREE.MeshStandardMaterial({ color: '#4d5964', roughness: 0.5, metalness: 0.6 });
  const colXs = [];
  for (let x = -36; x <= EX - 2; x += 8) colXs.push(x);
  const n = colXs.length;
  const colH = RY - FY;
  const web = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, colH, 0.5), frameMat, n);
  const flange = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, colH, 0.1), frameMat, n * 2);
  const guard = new THREE.InstancedMesh(new THREE.BoxGeometry(0.75, 1.3, 0.75), new THREE.MeshStandardMaterial({ map: hazardTexture(1, 2), roughness: 0.5 }), n);
  const rafter = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.8, 72), frameMat, n);
  const m4 = new THREE.Matrix4();
  colXs.forEach((x, i) => {
    web.setMatrixAt(i, m4.makeTranslation(x, FY + colH / 2, BZ + 0.55));
    flange.setMatrixAt(i * 2, m4.makeTranslation(x, FY + colH / 2, BZ + 0.3));
    flange.setMatrixAt(i * 2 + 1, m4.makeTranslation(x, FY + colH / 2, BZ + 0.8));
    guard.setMatrixAt(i, m4.makeTranslation(x, FY + 0.65, BZ + 0.55));
    rafter.setMatrixAt(i, m4.makeTranslation(x, RY - 0.4, BZ + 36));
  });
  const purlins = new THREE.InstancedMesh(new THREE.BoxGeometry(EX + 40, 0.18, 0.12), frameMat, 12);
  for (let i = 0; i < 12; i++) purlins.setMatrixAt(i, m4.makeTranslation(BX, RY - 0.9, BZ + 1 + i * 6));
  hall.add(web, flange, guard, rafter, purlins);
  // roof sheets with two skylight strips
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(EX + 40, 72), new THREE.MeshStandardMaterial({ map: claddingTexture((EX + 40) / 2.4, 1), color: '#c9ced2', roughness: 0.7, side: THREE.DoubleSide }));
  roof.rotation.x = Math.PI / 2;
  roof.position.set(BX, RY, BZ + 36);
  hall.add(roof);
  const skyMat = new THREE.MeshBasicMaterial({ color: '#f7fbff' });
  for (const z of [2, 16]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(EX + 40, 2.2), skyMat);
    s.rotation.x = Math.PI / 2;
    s.position.set(BX, RY - 0.02, z);
    hall.add(s);
  }
  // round high-bay LED lamps
  const lampXs = colXs.map((x) => x + 4).filter((x) => x < EX);
  const lampZs = [-8, 4];
  const lampBody = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.75, 0.45, 24), new THREE.MeshStandardMaterial({ color: '#2b2f34', roughness: 0.4, metalness: 0.6 }), lampXs.length * lampZs.length);
  const lampGlow = new THREE.InstancedMesh(new THREE.CircleGeometry(0.7, 24), new THREE.MeshBasicMaterial({ color: '#fff7e6', toneMapped: false, side: THREE.DoubleSide }), lampXs.length * lampZs.length);
  const cable = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 4), frameMat, lampXs.length * lampZs.length);
  const rotDown = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  let k = 0;
  for (const x of lampXs) for (const z of lampZs) {
    lampBody.setMatrixAt(k, m4.makeTranslation(x, RY - 2.4, z));
    lampGlow.setMatrixAt(k, m4.makeTranslation(x, RY - 2.64, z).multiply(rotDown));
    cable.setMatrixAt(k, m4.makeTranslation(x, RY - 1.4, z));
    k++;
  }
  hall.add(lampBody, lampGlow, cable);

  // pallet racking along the back wall: blue uprights, orange beams, pallets with cartons
  const RZ0 = BZ + 1.2, RZ1 = BZ + 2.4, LEVELS = [FY + 1.25, FY + 3.55, FY + 5.85], BAY = 2.7;
  const bays = [];
  for (const x0 of colXs.slice(0, -1)) for (let b = 0; b < 2; b++) bays.push(x0 + 1.1 + b * (BAY + 0.6));
  const upright = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 7.3, 0.12), new THREE.MeshStandardMaterial({ color: '#2f5d9a', roughness: 0.5, metalness: 0.3 }), bays.length * 4);
  const beam = new THREE.InstancedMesh(new THREE.BoxGeometry(BAY, 0.16, 0.08), new THREE.MeshStandardMaterial({ color: '#e8772e', roughness: 0.45, metalness: 0.2 }), bays.length * LEVELS.length * 2);
  const pallet = new THREE.InstancedMesh(new THREE.BoxGeometry(BAY - 0.25, 0.16, 1.1), new THREE.MeshStandardMaterial({ color: '#b48a5a', roughness: 0.9 }), bays.length * LEVELS.length);
  const cartonTex = canvasTex(256, 256, (x, w) => {
    x.fillStyle = '#c99a62'; x.fillRect(0, 0, w, w);
    x.fillStyle = 'rgba(120,80,40,0.25)'; x.fillRect(0, w * 0.46, w, w * 0.08);
    drawLogo(x, 20, 20, 64);
    x.fillStyle = '#3a2717'; x.font = '800 30px Manrope, sans-serif'; x.fillText('INKUBIO', 78, 64);
  });
  const carton = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: cartonTex, roughness: 0.9 }), bays.length * LEVELS.length * 4);
  const rr = rng(31);
  let iu = 0, ib = 0, ip = 0, ic = 0;
  const tint = new THREE.Color();
  for (const bx of bays) {
    for (const ux of [bx, bx + BAY]) for (const z of [RZ0, RZ1]) upright.setMatrixAt(iu++, m4.makeTranslation(ux, FY + 3.65, z));
    for (const y of LEVELS) {
      for (const z of [RZ0, RZ1]) beam.setMatrixAt(ib++, m4.makeTranslation(bx + BAY / 2, y, z));
      pallet.setMatrixAt(ip++, m4.makeTranslation(bx + BAY / 2, y + 0.16, (RZ0 + RZ1) / 2));
      // a few cartons on each pallet, stacked a little unevenly
      const full = rr();
      for (let c = 0; c < 4; c++) {
        const s = full < 0.12 ? 0.0001 : 1;
        const cx = bx + 0.25 + (c % 2) * 1.12 + 0.52, cy = y + 0.24 + 0.46 + (c > 1 && rr() < 0.6 ? 0.92 : 0), cz = (RZ0 + RZ1) / 2;
        const h = c > 1 && cy < y + 1 ? 0.0001 : s;
        m4.compose(new THREE.Vector3(cx + (rr() - 0.5) * 0.08, cy, cz + (rr() - 0.5) * 0.08), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rr() - 0.5) * 0.06), new THREE.Vector3(1.04 * h, 0.9 * h, 1.0 * h));
        carton.setMatrixAt(ic, m4);
        carton.setColorAt(ic, tint.setHSL(0.08, 0.2, 0.92 + rr() * 0.08));
        ic++;
      }
    }
  }
  for (const m of [web, flange, guard, rafter, upright, beam, pallet, carton]) { m.castShadow = false; m.receiveShadow = true; }
  hall.add(upright, beam, pallet, carton);

  // round ventilation duct along the roof
  const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, EX + 40, 24), new THREE.MeshStandardMaterial({ color: '#c4cad0', roughness: 0.3, metalness: 0.85 }));
  duct.rotation.z = Math.PI / 2;
  duct.position.set(BX, RY - 2.2, BZ + 3.6);
  hall.add(duct);
  return hall;
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
    drawLogo(x, 40, 118, 74);
    x.font = '800 44px Unbounded, Manrope, sans-serif';
    x.fillStyle = '#3a2717';
    x.fillText('INKUBIO', 110, 170);
    x.font = '700 24px Manrope, sans-serif';
    x.fillText(L('ЖИВЫЕ ЦЫПЛЯТА · ОСТОРОЖНО'), 110, 215, 390);
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
  drawLogo(x, 135, 120, 340);
  x.font = '800 190px Unbounded, Manrope, sans-serif';
  x.fillStyle = '#16181b';
  x.fillText('INKUBIO', 440, 360);
  x.font = '600 64px Manrope, sans-serif';
  x.fillStyle = '#5b636b';
  x.fillText(L('Суточные цыплята · Доставка с климат-контролем'), 450, 470, 1560);
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

  // the hangar around the line: floor, walls, steel frame, racks, lights, the gate the truck leaves through
  buildHall(g);

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
    x.fillText(L('ВАКЦИНАЦИЯ'), 14, 70, 484);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.225), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
  })();
  vaxSign.position.set(0, 2.25, 1.26);
  vax.add(vaxSign);
  let mistLevel = 0;

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
  const tints = ['#f5cb4c', '#f3c74a', '#f7d055', '#f2c548', '#f6ce52', '#f4c94d', '#f8d258'];
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
