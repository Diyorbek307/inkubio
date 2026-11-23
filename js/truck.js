import * as THREE from 'three';
import { drawLogo } from './logo.js';

const L = (s) => (window.I18N ? window.I18N.t(s) : s);

/*
 Refrigerated delivery truck in INKUBIO colours: a cab-over cab in brand green with a yellow line,
 an insulated white box with rounded aluminium corners, livery, side guards, dual rear wheels.
 It drives along +x; the open back of the box (x = x0) faces the packing belt; the viewer sees the +z side.
*/

// a box with rounded edges and corners (extruded rounded rectangle with a bevel), centred on the origin
export function roundBox(w, h, d, r, seg = 3) {
  r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  // the outline shrunk by r on every side; the bevel grows it back with rounded edges
  const g = new THREE.ExtrudeGeometry(shrink(w, h, r), { depth: Math.max(1e-3, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: seg, curveSegments: seg * 2 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  g.computeVertexNormals();
  return g;
}
// the outline the bevel grows from: the box minus the bevel on every side
function shrink(w, h, r) {
  const s = new THREE.Shape();
  const hw = w / 2 - r, hh = h / 2 - r, c = Math.min(r * 0.35, hw * 0.9, hh * 0.9);
  s.moveTo(-hw + c, -hh);
  s.lineTo(hw - c, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + c);
  s.lineTo(hw, hh - c);
  s.quadraticCurveTo(hw, hh, hw - c, hh);
  s.lineTo(-hw + c, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - c);
  s.lineTo(-hw, -hh + c);
  s.quadraticCurveTo(-hw, -hh, -hw + c, -hh);
  return s;
}

const tex = (w, h, draw, srgb = true) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

// livery on the long side of the box
function liveryTexture() {
  return tex(2048, 720, (x, W, H) => {
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#fbfcfd');
    g.addColorStop(1, '#e8ecef');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    // insulated sandwich panels: faint vertical joints
    x.fillStyle = 'rgba(120,130,140,0.18)';
    for (let i = 1; i < 8; i++) x.fillRect((i * W) / 8, 0, 3, H);
    // green brand wave from the back, under the logo
    x.fillStyle = '#1d5c2f';
    x.beginPath();
    x.moveTo(0, H);
    x.lineTo(0, H * 0.52);
    x.bezierCurveTo(W * 0.25, H * 0.36, W * 0.42, H * 0.9, W * 0.7, H * 0.78);
    x.bezierCurveTo(W * 0.85, H * 0.72, W * 0.95, H * 0.66, W, H * 0.68);
    x.lineTo(W, H);
    x.fill();
    x.fillStyle = '#f6bf1f';
    x.beginPath();
    x.moveTo(0, H * 0.52);
    x.bezierCurveTo(W * 0.25, H * 0.36, W * 0.42, H * 0.9, W * 0.7, H * 0.78);
    x.bezierCurveTo(W * 0.85, H * 0.72, W * 0.95, H * 0.66, W, H * 0.68);
    x.lineTo(W, H * 0.71);
    x.bezierCurveTo(W * 0.95, H * 0.69, W * 0.85, H * 0.75, W * 0.7, H * 0.81);
    x.bezierCurveTo(W * 0.42, H * 0.93, W * 0.25, H * 0.4, 0, H * 0.56);
    x.fill();
    // logo and name
    drawLogo(x, 1080, 70, 300);
    x.fillStyle = '#16181b';
    x.font = '800 160px Unbounded, Manrope, sans-serif';
    x.fillText('INKUBIO', 1330, 290, 680);
    x.font = '600 52px Manrope, sans-serif';
    x.fillStyle = '#4a535b';
    x.fillText(L('Суточные цыплята · Доставка с климат-контролем'), 1080, 450, 920);
    // climate badge
    x.fillStyle = 'rgba(29,92,47,0.1)';
    x.beginPath();
    x.roundRect(110, 80, 520, 130, 65);
    x.fill();
    x.fillStyle = '#1d5c2f';
    x.font = '800 74px Manrope, sans-serif';
    x.fillText('❄ 28–32 °C', 160, 172, 440);
  });
}

// cab door, window frame and badge on the cab side (green paint)
function cabSideTexture() {
  return tex(512, 512, (x, W, H) => {
    x.fillStyle = '#1d5c2f';
    x.fillRect(0, 0, W, H);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.18)');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    // yellow line low on the cab, lined up with the box stripe
    x.fillStyle = '#f6bf1f';
    x.fillRect(0, H * 0.73, W, H * 0.05);
    // door seams
    x.strokeStyle = 'rgba(0,0,0,0.45)';
    x.lineWidth = 3;
    x.strokeRect(W * 0.3, H * 0.06, W * 0.62, H * 0.86);
    // handle
    x.fillStyle = '#c9d0d6';
    x.fillRect(W * 0.36, H * 0.5, W * 0.12, H * 0.03);
    drawLogo(x, W * 0.55, H * 0.5, 82);
  });
}

// grille: dark with horizontal chrome slats and the logo
function grilleTexture() {
  return tex(512, 256, (x, W, H) => {
    x.fillStyle = '#121416';
    x.fillRect(0, 0, W, H);
    for (let i = 0; i < 7; i++) {
      const y = 22 + i * 32;
      const g = x.createLinearGradient(0, y, 0, y + 12);
      g.addColorStop(0, '#f2f5f7');
      g.addColorStop(1, '#7c858d');
      x.fillStyle = g;
      x.fillRect(10, y, W - 20, 11);
    }
    x.fillStyle = '#1d5c2f';
    x.beginPath();
    x.roundRect(W / 2 - 62, H / 2 - 70, 124, 140, 40);
    x.fill();
    drawLogo(x, W / 2 - 46, H / 2 - 60, 120);
  });
}

// tyre tread: blocks around the circumference (bump map)
function treadTexture() {
  const t = tex(256, 64, (x, W, H) => {
    x.fillStyle = '#9a9a9a';
    x.fillRect(0, 0, W, H);
    x.fillStyle = '#2a2a2a';
    for (let i = 0; i < W; i += 16) {
      x.fillRect(i, 0, 5, H * 0.42);
      x.fillRect(i + 8, H * 0.58, 5, H * 0.42);
    }
    x.fillRect(0, H * 0.47, W, 4);
  }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 1);
  return t;
}

// wheel rim face: polished steel disc, vent holes, hub and lug nuts
function rimTexture() {
  return tex(256, 256, (x, W) => {
    const c = W / 2;
    const g = x.createRadialGradient(c * 0.8, c * 0.7, 10, c, c, c);
    g.addColorStop(0, '#f3f6f8');
    g.addColorStop(0.7, '#b8c0c7');
    g.addColorStop(1, '#6e767d');
    x.fillStyle = g;
    x.beginPath();
    x.arc(c, c, c, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(40,44,48,0.6)';
    x.lineWidth = 6;
    x.beginPath();
    x.arc(c, c, c * 0.9, 0, Math.PI * 2);
    x.stroke();
    x.fillStyle = '#25292d';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      x.beginPath();
      x.ellipse(c + Math.cos(a) * c * 0.64, c + Math.sin(a) * c * 0.64, c * 0.13, c * 0.09, a, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = '#8b939a';
    x.beginPath();
    x.arc(c, c, c * 0.36, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#e6eaed';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      x.beginPath();
      x.arc(c + Math.cos(a) * c * 0.27, c + Math.sin(a) * c * 0.27, c * 0.045, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = '#1d5c2f';
    x.beginPath();
    x.arc(c, c, c * 0.14, 0, Math.PI * 2);
    x.fill();
  });
}

// tyre: a lathe of a rounded cross-section, axis along z
function tyreGeometry(R, r, w) {
  const pts = [];
  const sh = 0.09; // shoulder radius
  const arc = (cx, cy, a0, a1) => { for (let i = 0; i <= 6; i++) { const a = a0 + ((a1 - a0) * i) / 6; pts.push(new THREE.Vector2(cx + Math.cos(a) * sh, cy + Math.sin(a) * sh)); } };
  pts.push(new THREE.Vector2(r, -w / 2 + 0.02));
  arc(R - sh, -w / 2 + sh, -Math.PI / 2, 0);
  arc(R - sh, w / 2 - sh, 0, Math.PI / 2);
  pts.push(new THREE.Vector2(r, w / 2 - 0.02));
  const g = new THREE.LatheGeometry(pts, 40);
  g.rotateX(Math.PI / 2);
  return g;
}

export function createTruck({ x0, x1, y0, y1, z, width }) {
  const truck = new THREE.Group();
  const add = (geo, mat, x, y, zz, parent = truck, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, zz);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  /* materials */
  const paintWhite = new THREE.MeshPhysicalMaterial({ color: '#f4f6f8', roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const green = new THREE.MeshPhysicalMaterial({ color: '#1d5c2f', roughness: 0.3, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 });
  const alu = new THREE.MeshStandardMaterial({ color: '#c8cfd5', roughness: 0.28, metalness: 0.9 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#eef2f5', roughness: 0.12, metalness: 1 });
  const plastic = new THREE.MeshStandardMaterial({ color: '#1b1e21', roughness: 0.7 });
  const chassis = new THREE.MeshStandardMaterial({ color: '#22262a', roughness: 0.55, metalness: 0.4 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#0e1a21', roughness: 0.04, metalness: 0.6, clearcoat: 1, envMapIntensity: 1.8 });
  const headlight = new THREE.MeshBasicMaterial({ color: '#fffbea', toneMapped: false });
  const amber = new THREE.MeshBasicMaterial({ color: '#ffb12a', toneMapped: false });
  const red = new THREE.MeshBasicMaterial({ color: '#ff3b2f', toneMapped: false });
  const rubber = new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.92, bumpMap: treadTexture(), bumpScale: 2.5 });
  const rimMat = new THREE.MeshStandardMaterial({ map: rimTexture(), roughness: 0.25, metalness: 0.85 });

  const len = x1 - x0, h = y1 - y0, hw = width / 2, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;

  /* ---------- insulated box (open at the back for loading) ---------- */
  const liv = new THREE.MeshPhysicalMaterial({ map: liveryTexture(), roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  add(BOX(len, h, 0.08), liv, xm, ym, z + hw);
  add(BOX(len, h, 0.08), paintWhite, xm, ym, z - hw);
  add(BOX(len, 0.08, width), paintWhite, xm, y1, z);
  add(BOX(0.1, h, width), paintWhite, x1, ym, z);
  add(BOX(len, 0.12, width), new THREE.MeshStandardMaterial({ color: '#6d7378', roughness: 0.8 }), xm, y0 + 0.06, z); // ribbed floor
  // rounded aluminium corner posts and roof rails
  const post = new THREE.CylinderGeometry(0.09, 0.09, h + 0.1, 16);
  for (const x of [x0, x1]) for (const s of [-1, 1]) add(post, alu, x, ym, z + s * hw);
  const rail = new THREE.CylinderGeometry(0.08, 0.08, len, 16);
  rail.rotateZ(Math.PI / 2);
  for (const s of [-1, 1]) { add(rail, alu, xm, y1, z + s * hw); add(rail, alu, xm, y0 + 0.02, z + s * hw); }
  const railZ = new THREE.CylinderGeometry(0.08, 0.08, width, 16);
  railZ.rotateX(Math.PI / 2);
  for (const x of [x0, x1]) add(railZ, alu, x, y1, z);
  // rear portal: aluminium frame around the opening, tail lights, bumper with hazard stripes
  add(BOX(0.16, 0.18, width + 0.1), alu, x0 - 0.02, y0 - 0.02, z);
  for (const s of [-1, 1]) {
    add(BOX(0.06, 0.34, 0.22), red, x0 - 0.12, y0 - 0.32, z + s * (hw - 0.25), truck, false);
    add(BOX(0.06, 0.12, 0.22), amber, x0 - 0.12, y0 - 0.56, z + s * (hw - 0.25), truck, false);
  }
  const bumperTex = tex(256, 32, (x, W, H) => { x.fillStyle = '#e03a2c'; x.fillRect(0, 0, W, H); x.fillStyle = '#ffffff'; for (let i = -H; i < W; i += 40) { x.beginPath(); x.moveTo(i, H); x.lineTo(i + 20, 0); x.lineTo(i + 40, 0); x.lineTo(i + 20, H); x.fill(); } });
  add(BOX(0.18, 0.16, width - 0.3), new THREE.MeshStandardMaterial({ map: bumperTex, roughness: 0.5 }), x0 - 0.15, y0 - 0.72, z);
  // a roller door that rolls up into the roof
  const door = new THREE.Group();
  door.position.set(x0 - 0.05, y1 - 0.05, z);
  truck.add(door);
  const doorTex = tex(64, 512, (x, W, H) => { x.fillStyle = '#e6eaed'; x.fillRect(0, 0, W, H); x.fillStyle = 'rgba(90,100,110,0.35)'; for (let y = 0; y < H; y += 32) x.fillRect(0, y, W, 3); });
  add(BOX(0.06, h - 0.1, width - 0.2), new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.45, metalness: 0.4 }), 0, -(h - 0.1) / 2, 0, door);

  /* ---------- chassis, side guards, fuel tank, mud flaps ---------- */
  add(BOX(len + 2.4, 0.32, width - 0.9), chassis, xm + 1.2, y0 - 0.26, z);
  const guardX0 = x0 + 3.7, guardX1 = x1 - 0.4;
  for (const y of [y0 - 0.32, y0 - 0.62]) add(BOX(guardX1 - guardX0, 0.09, 0.05), alu, (guardX0 + guardX1) / 2, y, z + hw - 0.08);
  for (let x = guardX0 + 0.3; x < guardX1; x += 1.6) add(BOX(0.06, 0.4, 0.3), chassis, x, y0 - 0.45, z + hw - 0.25);
  const tank = new THREE.CylinderGeometry(0.32, 0.32, 1.3, 24);
  tank.rotateZ(Math.PI / 2);
  add(tank, alu, x1 - 1.4, y0 - 0.55, z + hw - 0.55);
  for (const x of [x0 + 0.55, x1 + 0.2]) for (const s of [-1, 1]) add(BOX(0.04, 0.55, 0.5), plastic, x, y0 - 0.62, z + s * (hw - 0.3));

  /* ---------- cab (cab-over, brand green) ---------- */
  const cx0 = x1 + 0.25, cx1 = x1 + 2.85, cy0 = y0 + 0.05, cy1 = 0.75;
  const cw = width - 0.1, cxm = (cx0 + cx1) / 2, cym = (cy0 + cy1) / 2;
  add(roundBox(cx1 - cx0, cy1 - cy0, cw, 0.2), green, cxm, cym, z);
  // painted cab sides with door, handle and badge
  const cabSide = new THREE.MeshPhysicalMaterial({ map: cabSideTexture(), roughness: 0.3, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 });
  for (const s of [-1, 1]) {
    const p = add(new THREE.PlaneGeometry(cx1 - cx0 - 0.4, cy1 - cy0 - 0.3), cabSide, cxm, cym - 0.05, z + s * (cw / 2 + 0.002), truck, false);
    if (s < 0) p.rotation.y = Math.PI;
  }
  // roof fairing up to the box height
  const fair = new THREE.Shape();
  fair.moveTo(cx0, cy1 - 0.1);
  fair.lineTo(cx0, y1);
  fair.lineTo(cx0 + 0.9, y1);
  fair.bezierCurveTo(cx0 + 1.7, y1 - 0.15, cx1 - 0.45, cy1 + 0.55, cx1 - 0.15, cy1 - 0.1);
  fair.lineTo(cx0, cy1 - 0.1);
  const fairGeo = new THREE.ExtrudeGeometry(fair, { depth: cw - 0.24, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 3, curveSegments: 16 });
  fairGeo.translate(0, 0, -(cw - 0.24) / 2);
  add(fairGeo, green, 0, 0, z);
  // windscreen, side windows, sun visor
  const ws = add(roundBox(0.08, 1.0, cw - 0.3, 0.035), glass, cx1 + 0.01, cy1 - 0.62, z, truck, false);
  ws.rotation.z = 0.1;
  add(BOX(0.18, 0.08, cw - 0.2), plastic, cx1 + 0.03, cy1 - 0.08, z);
  for (const s of [-1, 1]) add(roundBox(0.95, 0.72, 0.04, 0.06), glass, cx1 - 0.62, cy1 - 0.55, z + s * (cw / 2 + 0.005), truck, false);
  // grille, headlights, indicators, bumper, step, fenders
  const grille = new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.35, metalness: 0.6 });
  const gr = add(new THREE.PlaneGeometry(1.5, 0.75), grille, cx1 + 0.031, cy0 + 0.82, z, truck, false);
  gr.rotation.y = Math.PI / 2;
  for (const s of [-1, 1]) {
    add(roundBox(0.08, 0.24, 0.6, 0.05), chrome, cx1 + 0.02, cy0 + 0.62, z + s * 1.05, truck, false);
    add(roundBox(0.06, 0.16, 0.5, 0.04), headlight, cx1 + 0.06, cy0 + 0.62, z + s * 1.05, truck, false);
    add(BOX(0.05, 0.05, 0.5), headlight, cx1 + 0.07, cy0 + 0.78, z + s * 1.05, truck, false); // LED day-light strip
    add(BOX(0.05, 0.1, 0.16), amber, cx1 + 0.06, cy0 + 0.62, z + s * 1.42, truck, false);
    // mirror on an arm
    add(BOX(0.06, 0.06, 0.42), chassis, cx1 - 0.15, cy1 - 0.25, z + s * (cw / 2 + 0.2));
    add(roundBox(0.16, 0.62, 0.24, 0.06), plastic, cx1 - 0.15, cy1 - 0.42, z + s * (cw / 2 + 0.42));
    // entry steps
    add(BOX(0.5, 0.06, 0.3), alu, cx1 - 0.85, cy0 - 0.18, z + s * (cw / 2 - 0.05));
    add(BOX(0.5, 0.06, 0.3), alu, cx1 - 0.85, cy0 + 0.12, z + s * (cw / 2 - 0.05));
  }
  add(roundBox(0.34, 0.42, cw + 0.08, 0.1), new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.5, metalness: 0.3 }), cx1 + 0.08, cy0 + 0.12, z);
  for (let i = -1; i <= 1; i++) add(BOX(0.06, 0.05, 0.14), amber, cx1 - 0.25, y1 + 0.06, z + i * 0.5, truck, false); // roof marker lights

  /* ---------- wheels: single front, dual rear ---------- */
  const R = 0.6, wheels = [];
  const tyreF = tyreGeometry(R, 0.37, 0.4);
  const tyreR = tyreGeometry(R, 0.37, 0.62);
  const rimFace = new THREE.CircleGeometry(0.37, 32);
  const rimBarrel = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 24, 1, true);
  rimBarrel.rotateX(Math.PI / 2);
  const fender = new THREE.CylinderGeometry(R + 0.12, R + 0.12, 0.5, 24, 1, true, Math.PI / 2, Math.PI); // upper half after the turn below
  fender.rotateX(Math.PI / 2);
  const axles = [[x0 + 1.55, tyreR], [x0 + 2.95, tyreR], [cx0 + 1.25, tyreF]];
  for (const [x, tg] of axles) {
    for (const s of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(x, y0 - 0.25, z + s * (hw - 0.3));
      truck.add(w);
      add(tg, rubber, 0, 0, 0, w);
      add(rimBarrel, rimMat, 0, 0, 0, w, false);
      const face = add(rimFace, rimMat, 0, 0, s * (tg === tyreR ? 0.22 : 0.16), w, false);
      if (s < 0) face.rotation.y = Math.PI;
      wheels.push(w);
    }
    if (tg === tyreF) for (const s of [-1, 1]) add(fender, plastic, x, y0 - 0.25, z + s * (hw - 0.28));
  }
  return { group: truck, door, wheels, cabFront: cx1 };
}

/*
 Warehouse forklift: yellow body, counterweight, overhead guard, mast with forks, an amber beacon.
 Faces +x (forks in front). Returns the group and an update(time, speed) that spins wheels and blinks the beacon.
*/
export function createForklift({ cargo = null } = {}) {
  const f = new THREE.Group();
  const yellow = new THREE.MeshPhysicalMaterial({ color: '#f2b01e', roughness: 0.38, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: '#25282b', roughness: 0.6, metalness: 0.4 });
  const steel = new THREE.MeshStandardMaterial({ color: '#8e979f', roughness: 0.35, metalness: 0.85 });
  const seatMat = new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.75 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.9, bumpMap: treadTexture(), bumpScale: 2 });
  const beaconMat = new THREE.MeshBasicMaterial({ color: '#ffb12a', toneMapped: false, transparent: true });
  const add = (geo, mat, x, y, z, parent = f) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  // body and counterweight (the rounded back)
  add(roundBox(1.9, 0.75, 1.15, 0.14), yellow, -0.15, 0.62, 0);
  add(roundBox(0.55, 0.85, 1.12, 0.22), dark, -1.0, 0.75, 0);
  add(roundBox(0.7, 0.12, 0.9, 0.05), dark, -0.25, 1.02, 0); // floor plate
  // seat and steering column
  add(roundBox(0.5, 0.12, 0.55, 0.05), seatMat, -0.55, 1.15, 0);
  add(roundBox(0.12, 0.55, 0.5, 0.05), seatMat, -0.8, 1.42, 0);
  const col = add(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 10), dark, 0.15, 1.3, 0);
  col.rotation.z = 0.5;
  const wheel = add(new THREE.TorusGeometry(0.17, 0.025, 8, 24), dark, 0.02, 1.58, 0);
  wheel.rotation.set(0, Math.PI / 2, 0.5);
  // overhead guard: four posts and a slatted roof
  for (const [x, z] of [[0.35, 0.5], [0.35, -0.5], [-0.95, 0.5], [-0.95, -0.5]]) add(new THREE.BoxGeometry(0.07, 1.35, 0.07), dark, x, 1.65, z);
  add(new THREE.BoxGeometry(1.42, 0.06, 1.08), dark, -0.3, 2.34, 0);
  for (let i = -2; i <= 2; i++) add(new THREE.BoxGeometry(1.3, 0.03, 0.05), steel, -0.3, 2.38, i * 0.2);
  // beacon on the roof
  add(new THREE.CylinderGeometry(0.09, 0.1, 0.06, 14), dark, -0.85, 2.4, 0);
  const beacon = add(new THREE.SphereGeometry(0.08, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), beaconMat, -0.85, 2.43, 0);
  beacon.castShadow = false;
  // mast with two channels, carriage and forks
  for (const z of [-0.38, 0.38]) add(new THREE.BoxGeometry(0.12, 2.3, 0.1), steel, 0.95, 1.3, z);
  add(new THREE.BoxGeometry(0.1, 0.08, 0.86), steel, 0.95, 2.42, 0);
  const carriage = new THREE.Group();
  carriage.position.set(1.04, 0.2, 0);
  f.add(carriage);
  add(new THREE.BoxGeometry(0.06, 0.5, 0.9), dark, 0, 0.25, 0, carriage);
  for (const z of [-0.26, 0.26]) add(new THREE.BoxGeometry(1.15, 0.05, 0.11), steel, 0.58, 0.02, z, carriage);
  if (cargo) { cargo.position.set(0.62, 0.05, 0); carriage.add(cargo); }
  // wheels: big drive wheels under the mast, smaller steer wheels at the back
  const wheels = [];
  const front = tyreGeometry(0.32, 0.2, 0.26);
  const rear = tyreGeometry(0.25, 0.15, 0.22);
  const hubMat = new THREE.MeshStandardMaterial({ color: '#c9a21e', roughness: 0.4, metalness: 0.5 });
  for (const [x, geo, r] of [[0.55, front, 0.32], [-0.95, rear, 0.25]]) {
    for (const s of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(x, r, s * 0.52);
      f.add(w);
      add(geo, tyreMat, 0, 0, 0, w);
      const hub = add(new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.2, 16), hubMat, 0, 0, 0, w);
      hub.rotation.x = Math.PI / 2;
      wheels.push({ g: w, r });
    }
  }
  // INKUBIO plate on the counterweight
  const plate = add(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshBasicMaterial({
    map: tex(256, 92, (x, W, H) => { x.fillStyle = '#16181b'; x.fillRect(0, 0, W, H); drawLogo(x, 10, 10, 72); x.fillStyle = '#f2b01e'; x.font = '800 40px Manrope, sans-serif'; x.fillText('INKUBIO', 76, 62, 170); }),
  }), -1.0, 0.92, 0.565);
  plate.castShadow = false;
  function update(time, travelled, lift = 0) {
    for (const w of wheels) w.g.rotation.z = -travelled / w.r;
    beaconMat.opacity = 0.45 + 0.55 * Math.max(0, Math.sin(time * 7));
    carriage.position.y = 0.2 + lift;
  }
  return { group: f, update };
}
