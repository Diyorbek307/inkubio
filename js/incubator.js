import * as THREE from 'three';
import { std } from './mat.js';
import { eggProfile, shellMaps } from './egg.js';
import { rng, clamp, easeOut } from './util.js';
import { drawLogo } from './logo.js';
const L = (s) => (window.I18N ? window.I18N.t(s) : s); // texts painted on the model, in the page language

function roundedRectShape(x0, y0, x1, y1, r) {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
function roundedRectPath(x0, y0, x1, y1, r) {
  const s = roundedRectShape(x0, y0, x1, y1, r);
  const p = new THREE.Path();
  p.curves = s.curves;
  return p;
}

// fine horizontal streaks of brushed stainless steel (used as a roughness map)
let brushedImage = null;
function brushedTexture(rx, ry) {
  if (!brushedImage) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#9a9a9a';
    x.fillRect(0, 0, 256, 256);
    const r = rng(5);
    for (let i = 0; i < 900; i++) {
      const v = Math.round(110 + r() * 110);
      x.fillStyle = `rgba(${v},${v},${v},${0.2 + r() * 0.4})`;
      x.fillRect(0, r() * 256, 256, 0.6 + r() * 1.3);
    }
    brushedImage = c;
  }
  const t = new THREE.CanvasTexture(brushedImage);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

/*
 Professional floor-standing setter cabinet, about 2 m tall: seven egg trays on a rack,
 a full-height stainless door with a big window, a control header with a touch screen,
 a signal beacon and an exhaust on the roof, three circulation fans with heaters inside.
 The hero egg's slot is at the origin (tray top at y = 0).
*/
export const CABINET = { y0: -9.9, y1: 14.2 }; // outer bottom and top, for framing the camera
export function createIncubator() {
  const g = new THREE.Group();
  const X0 = -7, X1 = 7, Y0 = -9.9, Y1 = 11.6, Z0 = -5, Z1 = 4.6, T = 0.3;
  const YT = CABINET.y1; // the control header sits between Y1 and YT
  const LEVELS = [-8.1, -5.4, -2.7, 0, 2.7, 5.4, 8.1];
  const lvlOf = (y) => clamp(Math.round(y / 2.7) + 3, 0, 6);

  const body = std({ color: '#e6e9ec', roughness: 0.42, metalness: 0.12, envMapIntensity: 0.85 });
  const steel = new THREE.MeshStandardMaterial({ color: '#cfd4d9', roughness: 0.5, roughnessMap: brushedTexture(0.12, 0.12), metalness: 0.92, envMapIntensity: 1.1 });
  const steelBox = new THREE.MeshStandardMaterial({ color: '#c3c9cf', roughness: 0.5, roughnessMap: brushedTexture(1, 4), metalness: 0.9, envMapIntensity: 1 });
  const inner = new THREE.MeshStandardMaterial({ color: '#6a7178', roughness: 0.42, roughnessMap: brushedTexture(1, 3), metalness: 0.75, envMapIntensity: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1b1e22', roughness: 0.55, metalness: 0.35 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#0f1113', roughness: 0.85 });
  const box = (w, h, d, mat, x, y, z, parent = g) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const cyl = (rt, rb, h, mat, x, y, z, seg = 24, parent = g) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  /* carcass: outer panels + brushed inner skin */
  const W = X1 - X0, H = YT - Y0, D = Z1 - Z0;
  const cx = (X0 + X1) / 2, cy = (Y0 + YT) / 2, cz = (Z0 + Z1) / 2;
  box(W, H, T, body, cx, cy, Z0 + T / 2); // back
  box(T, H, D, body, X0 + T / 2, cy, cz); // left
  box(T, H, D, body, X1 - T / 2, cy, cz); // right
  box(W, T, D, body, cx, YT - T / 2, cz); // roof
  box(W, T, D, body, cx, Y0 + T / 2, cz); // floor
  box(W - 2 * T - 0.02, Y1 - Y0 - 2 * T, 0.02, inner, cx, (Y0 + Y1) / 2, Z0 + T + 0.02);
  box(0.02, Y1 - Y0 - 2 * T, D - T, inner, X0 + T + 0.02, (Y0 + Y1) / 2, cz);
  box(0.02, Y1 - Y0 - 2 * T, D - T, inner, X1 - T - 0.02, (Y0 + Y1) / 2, cz);
  box(W - 2 * T, 0.06, D - T, inner, cx, Y1 - 0.03, cz); // ceiling of the egg chamber

  /* front frame around the door opening */
  const DX0 = X0 + 0.55, DX1 = X1 - 0.55, DY0 = Y0 + 0.55, DY1 = Y1 - 0.15;
  const front = roundedRectShape(X0, Y0, X1, YT, 0.3);
  front.holes.push(roundedRectPath(DX0 - 0.04, DY0 - 0.04, DX1 + 0.04, DY1 + 0.04, 0.25));
  const frontMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(front, { depth: 0.22, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3, curveSegments: 8 }), body);
  frontMesh.position.z = Z1 - 0.22;
  g.add(frontMesh);

  /* door: stainless frame, big window, gasket, long handle, hinges */
  const door = new THREE.Group();
  door.position.z = Z1;
  g.add(door);
  const WX0 = DX0 + 1.05, WX1 = DX1 - 1.05, WY0 = DY0 + 1.0, WY1 = DY1 - 0.95;
  const doorShape = roundedRectShape(DX0, DY0, DX1, DY1, 0.22);
  doorShape.holes.push(roundedRectPath(WX0, WY0, WX1, WY1, 0.35));
  const doorMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(doorShape, { depth: 0.3, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3, curveSegments: 10 }), steel);
  door.add(doorMesh);
  const gasket = roundedRectShape(WX0 - 0.16, WY0 - 0.16, WX1 + 0.16, WY1 + 0.16, 0.45);
  gasket.holes.push(roundedRectPath(WX0, WY0, WX1, WY1, 0.35));
  const gasketMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(gasket, { depth: 0.06, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2 }), rubber);
  gasketMesh.position.z = 0.33;
  door.add(gasketMesh);
  // vertical bar handle on two stand-offs
  const HX = DX1 - 0.55;
  cyl(0.11, 0.11, 6.2, steel, HX, 1.6, 1.0, 20, door);
  for (const y of [-1.2, 4.4]) {
    const so = cyl(0.08, 0.08, 0.62, steel, HX, y, 0.66, 14, door);
    so.rotation.x = Math.PI / 2;
  }
  // three hinges on the left
  for (const y of [-7.4, 1.0, 9.4]) {
    cyl(0.16, 0.16, 1.1, steel, DX0 - 0.02, y, 0.32, 18, door);
  }
  // window glass + soft reflections
  const glassMat = std({ color: '#d6ecff', transparent: true, opacity: 0.07, roughness: 0.05, metalness: 0, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide });
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(WX0, WY0, WX1, WY1, 0.35)), glassMat);
  glass.position.z = 0.16;
  door.add(glass);
  const streakMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.035, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const [x, w, y] of [[-2.6, 1.6, 4], [-0.8, 0.45, 4.6], [2.4, 1.0, -2.5]]) {
    const st = new THREE.Mesh(new THREE.PlaneGeometry(w, 7), streakMat);
    st.position.set(x, y, 0.18);
    st.rotation.z = -0.45;
    door.add(st);
  }
  // door label
  const labelC = document.createElement('canvas');
  labelC.width = 512; labelC.height = 96;
  const lc = labelC.getContext('2d');
  lc.fillStyle = '#3a4047';
  lc.font = '700 40px Manrope, sans-serif';
  lc.fillText(L('ЛОТКИ 1–7 · 147 ЯИЦ'), 8, 62, 496);
  const labelTex = new THREE.CanvasTexture(labelC);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.49), new THREE.MeshBasicMaterial({ map: labelTex, transparent: true }));
  label.position.set((DX0 + DX1) / 2, DY0 + 0.5, 0.37);
  door.add(label);

  /* control header: dark glass strip with logo, touch screen, buttons, emergency stop */
  const HY = (Y1 + YT) / 2;
  const strip = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRectShape(X0 + 0.45, Y1 + 0.35, X1 - 0.45, YT - 0.35, 0.2), { depth: 0.06, bevelEnabled: false }),
    std({ color: '#0d1013', roughness: 0.18, metalness: 0.4, envMapIntensity: 1.2 }));
  strip.position.z = Z1 + 0.02;
  g.add(strip);

  const plate = document.createElement('canvas');
  plate.width = 1024; plate.height = 256;
  const pc = plate.getContext('2d');
  drawLogo(pc, 24, 28, 200);
  pc.fillStyle = '#f2f4f6';
  pc.font = '800 96px Unbounded, Manrope, sans-serif';
  pc.fillText('INKUBIO', 214, 140);
  pc.font = '600 40px Manrope, sans-serif';
  pc.fillStyle = '#8b949c';
  pc.fillText(L('PRO S-147 · ИНКУБАЦИОННЫЙ ШКАФ'), 218, 206, plate.width - 236);
  const plateTex = new THREE.CanvasTexture(plate);
  plateTex.colorSpace = THREE.SRGBColorSpace;
  plateTex.anisotropy = 4;
  const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), new THREE.MeshBasicMaterial({ map: plateTex, transparent: true }));
  plateMesh.position.set(-3.45, HY, Z1 + 0.09);
  g.add(plateMesh);

  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 1024; screenCanvas.height = 512;
  const sctx = screenCanvas.getContext('2d');
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const bezel = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRectShape(-1.85, -0.98, 1.85, 0.98, 0.12), { depth: 0.08, bevelEnabled: false }), dark);
  bezel.position.set(2.15, HY, Z1 + 0.08);
  g.add(bezel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(2.15, HY, Z1 + 0.17);
  g.add(screen);
  let lastDay = -1;
  function drawScreen(day = 1) {
    const d = Math.round(day);
    if (d === lastDay) return;
    lastDay = d;
    const c = sctx;
    c.fillStyle = '#05080a';
    c.fillRect(0, 0, 1024, 512);
    c.fillStyle = '#0e1a13';
    c.fillRect(0, 0, 1024, 76);
    c.fillStyle = '#7dffb2';
    c.font = '700 34px Manrope, sans-serif';
    c.fillText(L('ИНКУБАЦИЯ · ЛОТКИ 1–7'), 32, 50, 780);
    c.fillStyle = '#46ff9a';
    c.beginPath(); c.arc(842, 38, 12, 0, Math.PI * 2); c.fill();
    c.fillText(L('НОРМА'), 866, 50, 148);
    const col = (x, title, value, color) => {
      c.fillStyle = '#6f8a7c';
      c.font = '600 32px Manrope, sans-serif';
      c.fillText(title, x, 140, 320);
      c.fillStyle = color;
      c.font = '800 104px Manrope, sans-serif';
      c.fillText(value, x - 4, 250);
    };
    col(36, L('ТЕМПЕРАТУРА'), '37.5°', '#ffd27a');
    col(392, L('ВЛАЖНОСТЬ'), '58%', '#9fd8ff');
    col(690, L('ДЕНЬ'), `${d}/21`, '#ffffff');
    c.fillStyle = '#16231c';
    c.fillRect(36, 318, 952, 22);
    c.fillStyle = '#46ff9a';
    c.fillRect(36, 318, 952 * (d / 21), 22);
    c.fillStyle = '#6f8a7c';
    c.font = '600 30px Manrope, sans-serif';
    c.fillText(L('ПОВОРОТ ЛОТКОВ ±45° · КАЖДЫЙ ЧАС'), 36, 410, 952);
    c.fillText(L('CO₂ 0.3% · ВЕНТИЛЯЦИЯ 3 × 1450 об/мин'), 36, 462, 952);
    screenTex.needsUpdate = true;
  }
  drawScreen(1);

  // buttons and an emergency stop to the right of the screen
  const btnMat = std({ color: '#2a2f35', roughness: 0.35, metalness: 0.5 });
  for (let i = 0; i < 3; i++) {
    const b = cyl(0.16, 0.16, 0.1, btnMat, 4.55, HY + 0.55 - i * 0.55, Z1 + 0.14, 18);
    b.rotation.x = Math.PI / 2;
  }
  const ledMat = new THREE.MeshBasicMaterial({ color: '#46ff9a', toneMapped: false });
  for (let i = 0; i < 3; i++) {
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), ledMat);
    led.position.set(4.92, HY + 0.55 - i * 0.55, Z1 + 0.1);
    g.add(led);
  }
  const eBase = cyl(0.42, 0.42, 0.08, std({ color: '#f2c21b', roughness: 0.5 }), 5.75, HY, Z1 + 0.12, 28);
  eBase.rotation.x = Math.PI / 2;
  const eStop = cyl(0.3, 0.26, 0.26, std({ color: '#d0201a', roughness: 0.35, envMapIntensity: 0.8 }), 5.75, HY, Z1 + 0.28, 24);
  eStop.rotation.x = Math.PI / 2;

  /* roof: signal beacon and exhaust damper */
  const beacon = new THREE.Group();
  beacon.position.set(5.6, YT, 2.9);
  g.add(beacon);
  cyl(0.26, 0.3, 0.2, dark, 0, 0.1, 0, 20, beacon);
  const beaconMats = ['#2bff7a', '#ffb02e', '#ff3b30'].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0, roughness: 0.3, transparent: true, opacity: 0.92 }));
  beaconMats.forEach((m, i) => cyl(0.22, 0.22, 0.34, m, 0, 0.38 + i * 0.36, 0, 20, beacon));
  cyl(0.16, 0.22, 0.12, dark, 0, 1.36, 0, 20, beacon);
  const exhaust = new THREE.Group();
  exhaust.position.set(-3.6, YT, -1.8);
  g.add(exhaust);
  cyl(0.62, 0.62, 1.3, steelBox, 0, 0.65, 0, 28, exhaust);
  cyl(0.7, 0.7, 0.12, steelBox, 0, 1.32, 0, 28, exhaust);
  cyl(0.82, 0.82, 0.08, dark, 0, 0.04, 0, 28, exhaust);
  box(2.4, 0.5, 1.4, body, 1.5, YT + 0.25, 0.6); // electrical box

  /* plinth with levelling feet */
  box(W - 0.5, 0.5, D - 0.5, dark, cx, Y0 - 0.25, cz);
  for (const x of [X0 + 0.8, X1 - 0.8]) for (const z of [Z0 + 0.8, Z1 - 0.8]) {
    cyl(0.32, 0.32, 0.14, steel, x, Y0 - 0.57, z, 6);
    cyl(0.1, 0.1, 0.3, steel, x, Y0 - 0.4, z, 10);
  }
  const floorMat = new THREE.MeshStandardMaterial({ color: '#0d0e10', roughness: 0.35, metalness: 0.5, transparent: true });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = Y0 - 0.64;
  floor.receiveShadow = true;
  g.add(floor);

  /* inside: three circulation fans with heater rings on the back wall */
  const fans = [];
  const guardMat = new THREE.MeshStandardMaterial({ color: '#9aa1a8', roughness: 0.35, metalness: 0.85 });
  const heatMat = new THREE.MeshBasicMaterial({ color: '#ff8a3a', toneMapped: false });
  const bladeGeo = new THREE.CircleGeometry(1.25, 20, 0, 0.62);
  for (const fy of [-5.2, 1.35, 7.6]) {
    const fan = new THREE.Group();
    fan.position.set(0, fy, Z0 + T + 0.14);
    g.add(fan);
    for (const r of [0.45, 0.95, 1.45]) fan.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 6, 48), guardMat));
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.05, 0.05), guardMat);
      sp.rotation.z = (i / 4) * Math.PI;
      sp.position.z = 0.12;
      fan.add(sp);
    }
    const heater = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.05, 8, 64), heatMat);
    heater.position.z = -0.04;
    fan.add(heater);
    const blades = new THREE.Group();
    blades.position.z = -0.06;
    fan.add(blades);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(bladeGeo, inner);
      b.rotation.z = (i / 6) * Math.PI * 2;
      blades.add(b);
    }
    fan.add(new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), dark));
    fans.push(blades);
  }

  /* tray rack: four posts with rails, a tray on each level */
  const PX = 6.45;
  for (const x of [-PX, PX]) {
    for (const z of [1.55, -4.5]) box(0.2, Y1 - Y0 - 0.7, 0.2, steelBox, x, (Y0 + Y1) / 2, z);
  }
  const trayMat = new THREE.MeshStandardMaterial({ color: '#6f7984', roughness: 0.55, metalness: 0.25, envMapIntensity: 0.5 });
  for (const ty of LEVELS) {
    box(12.6, 0.08, 5.6, trayMat, 0, ty - 0.04, -1.7);
    for (const z of [1.05, -4.45]) box(12.6, 0.2, 0.07, trayMat, 0, ty + 0.06, z);
    for (const x of [-PX + 0.12, PX - 0.12]) box(0.1, 0.1, 6.2, steelBox, x, ty - 0.13, -1.47); // rails
  }

  // warm LED strips down both sides of the door opening
  const stripMat = new THREE.MeshBasicMaterial({ color: '#ffe0b0', toneMapped: false });
  for (const x of [DX0 + 0.15, DX1 - 0.15]) box(0.07, DY1 - DY0 - 0.8, 0.05, stripMat, x, (DY0 + DY1) / 2, Z1 - 0.32);

  /* eggs and cups */
  const cupMat = new THREE.MeshStandardMaterial({ color: '#59626b', roughness: 0.45, metalness: 0.5 });
  // 146 small eggs on the trays: a light mesh each (it was 3200 triangles per egg — a third of the whole frame)
  const eggGeo = new THREE.LatheGeometry(eggProfile(16), 22);
  const { bumpTex, roughTex } = shellMaps();
  const eggMat = std({ color: '#e9e0d2', roughness: 0.8, roughnessMap: roughTex, bumpMap: bumpTex, bumpScale: 1.2, envMapIntensity: 0.35 });
  const eggLit = new THREE.Color('#e9e0d2'), eggDim = new THREE.Color('#7d756a');
  const cols = [-5.1, -3.4, -1.7, 0, 1.7, 3.4, 5.1];
  const rows = [0, -1.7, -3.4];
  const slots = [];
  for (const ty of LEVELS) for (const x of cols) for (const z of rows) if (!(ty === 0 && x === 0 && z === 0)) slots.push([x, ty, z]);
  const eggs = new THREE.InstancedMesh(eggGeo, eggMat, slots.length);
  const cups = new THREE.InstancedMesh(new THREE.TorusGeometry(0.45, 0.05, 8, 24), cupMat, slots.length + 1);
  const r = rng(3);
  const m4 = new THREE.Matrix4(), e = new THREE.Euler();
  const eggBase = slots.map(([x, y, z]) => {
    e.set((r() - 0.5) * 0.06, r() * Math.PI * 2, (r() - 0.5) * 0.06);
    return { pos: new THREE.Vector3(x, y + 0.02, z), q: new THREE.Quaternion().setFromEuler(e), d: Math.hypot(x, y * 0.8, z) };
  });
  const cupQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const cupBase = [...slots, [0, 0, 0]].map(([x, y, z]) => ({ pos: new THREE.Vector3(x, y + 0.22, z), lvl: lvlOf(y) }));
  const vS = new THREE.Vector3(), vP = new THREE.Vector3();
  const backOut = (t) => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  let lastBuild = -1;
  function placeInstances(b) {
    eggBase.forEach((it, i) => {
      const l = clamp((b - (0.32 + it.d * 0.022)) / 0.22);
      const k = l <= 0 ? 0.0001 : backOut(l) * 0.96;
      vP.copy(it.pos);
      vP.y += (1 - easeOut(l)) * 0.8;
      m4.compose(vP, it.q, vS.set(k, k, k));
      eggs.setMatrixAt(i, m4);
    });
    cupBase.forEach((it, i) => {
      const l = clamp((b - (0.05 + it.lvl * 0.05)) / 0.3);
      vP.copy(it.pos);
      vP.y -= (1 - easeOut(l)) * 12;
      vS.set(1, 1, 1).multiplyScalar(l <= 0 ? 0.0001 : 1);
      m4.compose(vP, cupQ, vS);
      cups.setMatrixAt(i, m4);
    });
    eggs.instanceMatrix.needsUpdate = true;
    cups.instanceMatrix.needsUpdate = true;
  }
  eggs.castShadow = true;
  g.add(eggs, cups);

  /* assembly: every part flies in from its own side */
  const parts = [];
  for (const m of g.children) {
    if (m === eggs || m === cups || m === floor) continue;
    const p = m.position;
    let off, d0, d1;
    if (m === door || p.z > Z1 - 0.25) { off = [0, 16, 0]; d0 = 0.6; d1 = 0.95; }
    else if (fans.some((b) => b.parent === m) || p.z < Z0 + 0.6) { off = [0, 0, -12]; d0 = 0.2; d1 = 0.55; }
    else if (p.x < X0 + 0.5) { off = [-12, 0, 0]; d0 = 0.28; d1 = 0.62; }
    else if (p.x > X1 - 0.5) { off = [12, 0, 0]; d0 = 0.28; d1 = 0.62; }
    else if (p.y > Y1 - 0.2) { off = [0, 14, 0]; d0 = 0.42; d1 = 0.8; }
    else if (p.y < Y0 + 0.4) { off = [0, -9, 0]; d0 = 0.0; d1 = 0.35; }
    else { const lvl = lvlOf(p.y); off = [0, -12, 0]; d0 = 0.05 + lvl * 0.05; d1 = d0 + 0.3; }
    parts.push({ m, base: p.clone(), off: new THREE.Vector3(...off), d0, d1 });
  }
  function setBuild(b) {
    if (Math.abs(b - lastBuild) < 1e-4) return;
    lastBuild = b;
    for (const it of parts) {
      const l = clamp((b - it.d0) / (it.d1 - it.d0));
      it.m.visible = l > 0.001;
      it.m.position.copy(it.base).addScaledVector(it.off, 1 - easeOut(l));
    }
    floorMat.opacity = clamp(b * 2);
    floor.visible = b > 0.001;
    placeInstances(b);
  }

  /* warm interior lights, spread over the height of the chamber */
  const l1 = new THREE.PointLight('#ffb36b', 5, 16, 1.6);
  l1.position.set(-3, 6.5, -0.5);
  const l2 = new THREE.PointLight('#ffc48a', 4, 15, 1.6);
  l2.position.set(3.5, 2.2, 0.8);
  const l3 = new THREE.PointLight('#ffa860', 3, 15, 1.6);
  l3.position.set(0, -4.5, 0.5);
  // soft light on the outside of the cabinet while we look at it from the room
  const show = new THREE.DirectionalLight('#fff1e2', 0);
  show.position.set(-9, 16, 24);
  show.target.position.set(0, 2, 0);
  const lightGroup = new THREE.Group();
  lightGroup.add(l1, l2, l3, show, show.target);
  const lights = [l1, l2, l3];
  const baseI = lights.map((l) => l.intensity);
  const stripOn = new THREE.Color('#ffe0b0'), heatOn = new THREE.Color('#ff8a3a'), off = new THREE.Color('#202020');

  function update(time, { day = 1, dim = 0, on = 1, build = 1, glass = 1 } = {}) {
    glassMat.opacity = 0.07 * glass;
    streakMat.opacity = 0.035 * glass;
    setBuild(build);
    on *= build;
    for (const b of fans) b.rotation.z = -time * 5;
    drawScreen(day);
    eggMat.color.copy(eggLit).lerp(eggDim, dim);
    lights.forEach((l, i) => (l.intensity = baseI[i] * (1 - dim * 0.8) * on));
    show.intensity = 1.5 * glass * on;
    stripMat.color.copy(off).lerp(stripOn, on * (1 - dim * 0.75));
    heatMat.color.copy(off).lerp(heatOn, on * (0.55 + 0.25 * Math.sin(time * 1.3)));
    ledMat.color.setHSL(0.4, 1, 0.45 + 0.15 * Math.sin(time * 3));
    beaconMats[0].emissiveIntensity = on * (1.6 + 0.4 * Math.sin(time * 2));
  }

  setBuild(1);
  return { group: g, update, lightGroup };
}
