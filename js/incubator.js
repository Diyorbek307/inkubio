import * as THREE from 'three';
import { std } from './mat.js';
import { eggProfile, shellMaps } from './egg.js';
import { rng, clamp, easeOut } from './util.js';

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

// Cabinet incubator. The hero egg's slot is at the origin (tray top at y = 0).
export function createIncubator() {
  const g = new THREE.Group();
  const X0 = -7, X1 = 7, Y0 = -3.4, Y1 = 5.4, Z0 = -5, Z1 = 4.6, T = 0.3;

  const shell = std({ color: '#e8ebee', roughness: 0.32, metalness: 0.35, clearcoat: 0.6, envMapIntensity: 0.9 });
  const inner = new THREE.MeshStandardMaterial({ color: '#5d646b', roughness: 0.45, metalness: 0.7, envMapIntensity: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1b1e22', roughness: 0.5, metalness: 0.4 });
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // walls (outer + inner skin so the interior reads as brushed steel)
  const W = X1 - X0, H = Y1 - Y0, D = Z1 - Z0;
  const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2, cz = (Z0 + Z1) / 2;
  box(W, H, T, shell, cx, cy, Z0 + T / 2); // back
  box(T, H, D, shell, X0 + T / 2, cy, cz); // left
  box(T, H, D, shell, X1 - T / 2, cy, cz); // right
  box(W, T, D, shell, cx, Y1 - T / 2, cz); // top
  box(W, T, D, shell, cx, Y0 + T / 2, cz); // bottom
  box(W - 2 * T - 0.02, H - 2 * T - 0.02, 0.02, inner, cx, cy, Z0 + T + 0.02);
  box(0.02, H - 2 * T, D - T, inner, X0 + T + 0.02, cy, cz);
  box(0.02, H - 2 * T, D - T, inner, X1 - T - 0.02, cy, cz);

  // front panel with a window hole
  const WX0 = -4.6, WX1 = 4.6, WY0 = -1.7, WY1 = 3.8;
  const front = roundedRectShape(X0, Y0, X1, Y1, 0.35);
  front.holes.push(roundedRectPath(WX0, WY0, WX1, WY1, 0.4));
  const frontGeo = new THREE.ExtrudeGeometry(front, { depth: 0.25, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3, curveSegments: 10 });
  const frontMesh = new THREE.Mesh(frontGeo, shell);
  frontMesh.position.z = Z1 - 0.25;
  g.add(frontMesh);

  // window gasket
  const ring = roundedRectShape(WX0 - 0.25, WY0 - 0.25, WX1 + 0.25, WY1 + 0.25, 0.55);
  ring.holes.push(roundedRectPath(WX0, WY0, WX1, WY1, 0.4));
  const ringMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }), dark);
  ringMesh.position.z = Z1 + 0.06;
  g.add(ringMesh);

  // glass
  const glassMat = std({
    color: '#cfe8ff', transparent: true, opacity: 0.06, roughness: 0.05, metalness: 0, clearcoat: 1,
    envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide,
  });
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(WX0, WY0, WX1, WY1, 0.4)), glassMat);
  glass.position.z = Z1 - 0.1;
  g.add(glass);
  const streakMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.035, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const [x, w] of [[-2.2, 1.4], [-0.6, 0.4], [2.6, 0.9]]) {
    const st = new THREE.Mesh(new THREE.PlaneGeometry(w, 9), streakMat);
    st.position.set(x, 1, Z1 - 0.08);
    st.rotation.z = -0.5;
    g.add(st);
  }
  // clip streaks to window bounds visually by keeping them short
  g.children.slice(-3).forEach((m) => m.scale.set(1, 0.6, 1));

  // control panel with a live screen
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 512; screenCanvas.height = 640;
  const sctx = screenCanvas.getContext('2d');
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRectShape(-0.85, -1.1, 0.85, 1.1, 0.15), { depth: 0.08, bevelEnabled: false }), dark);
  panel.position.set(5.8, 2.6, Z1 + 0.06);
  g.add(panel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.875), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(5.8, 2.6, Z1 + 0.15);
  g.add(screen);
  let lastDay = -1;
  function drawScreen(day = 1) {
    const d = Math.round(day);
    if (d === lastDay) return;
    lastDay = d;
    const c = sctx;
    c.fillStyle = '#070a0c';
    c.fillRect(0, 0, 512, 640);
    c.fillStyle = '#7dffb2';
    c.font = '600 34px Manrope, sans-serif';
    c.fillText('ТЕМП.', 40, 80);
    c.font = '800 120px Manrope, sans-serif';
    c.fillStyle = '#ffd27a';
    c.fillText('37.5°', 34, 200);
    c.font = '600 34px Manrope, sans-serif';
    c.fillStyle = '#7dffb2';
    c.fillText('ВЛАЖН.', 40, 290);
    c.font = '800 96px Manrope, sans-serif';
    c.fillStyle = '#9fd8ff';
    c.fillText('58%', 34, 390);
    c.fillStyle = '#7dffb2';
    c.font = '600 34px Manrope, sans-serif';
    c.fillText('ДЕНЬ', 40, 480);
    c.font = '800 96px Manrope, sans-serif';
    c.fillStyle = '#ffffff';
    c.fillText(`${d}/21`, 34, 580);
    screenTex.needsUpdate = true;
  }
  drawScreen(1);

  // LEDs
  const ledMat = new THREE.MeshBasicMaterial({ color: '#46ff9a', toneMapped: false });
  for (let i = 0; i < 3; i++) {
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), ledMat);
    led.position.set(5.35 + i * 0.45, 1.25, Z1 + 0.15);
    g.add(led);
  }

  // brand plate
  const plate = document.createElement('canvas');
  plate.width = 1024; plate.height = 160;
  const pc = plate.getContext('2d');
  pc.fillStyle = '#1b1e22';
  pc.font = '800 92px Unbounded, Manrope, sans-serif';
  pc.fillText('INKUBIO', 20, 112);
  pc.font = '600 34px Manrope, sans-serif';
  pc.fillStyle = '#6b737b';
  pc.fillText('PRO · 21', 560, 108);
  const plateTex = new THREE.CanvasTexture(plate);
  plateTex.colorSpace = THREE.SRGBColorSpace;
  const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.625), new THREE.MeshBasicMaterial({ map: plateTex, transparent: true }));
  plateMesh.position.set(-4.2, -2.55, Z1 + 0.1);
  g.add(plateMesh);

  // plinth + floor
  box(W - 0.6, 0.5, D - 0.6, dark, cx, Y0 - 0.25, cz);
  const floorMat = new THREE.MeshStandardMaterial({ color: '#0d0e10', roughness: 0.35, metalness: 0.5, transparent: true });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = Y0 - 0.5;
  floor.receiveShadow = true;
  g.add(floor);

  // heating strip
  const heat = new THREE.Mesh(new THREE.BoxGeometry(W - 1.2, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: '#ff9a40', toneMapped: false }));
  heat.position.set(0, Y1 - T - 0.2, Z1 - 0.8);
  g.add(heat);

  // fan on the back wall
  const fan = new THREE.Group();
  fan.position.set(0, 1.3, Z0 + T + 0.1);
  g.add(fan);
  const fanRing = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 10, 48), dark);
  fan.add(fanRing);
  const bladeGeo = new THREE.CircleGeometry(0.95, 24, 0, 0.55);
  const blades = new THREE.Group();
  fan.add(blades);
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(bladeGeo, inner);
    b.rotation.z = (i / 5) * Math.PI * 2;
    blades.add(b);
  }

  // trays + eggs
  const trayMat = new THREE.MeshStandardMaterial({ color: '#5f666d', roughness: 0.4, metalness: 0.8, envMapIntensity: 0.4 });
  const cupMat = new THREE.MeshStandardMaterial({ color: '#545b62', roughness: 0.4, metalness: 0.7 });
  const eggGeo = new THREE.LatheGeometry(eggProfile(40), 40);
  const { bumpTex, roughTex } = shellMaps();
  const eggMat = std({ color: '#e9e0d2', roughness: 0.8, roughnessMap: roughTex, bumpMap: bumpTex, bumpScale: 1.2, sheen: 0.3, sheenColor: new THREE.Color('#fff0dc'), envMapIntensity: 0.35 });
  const eggLit = new THREE.Color('#e9e0d2'), eggDim = new THREE.Color('#7d756a');
  const trays = [-2.7, 0, 2.7];
  const cols = [-5.1, -3.4, -1.7, 0, 1.7, 3.4, 5.1];
  const rows = [0, -1.7, -3.4];
  const slots = [];
  for (const ty of trays) for (const x of cols) for (const z of rows) if (!(ty === 0 && x === 0 && z === 0)) slots.push([x, ty, z]);
  const eggs = new THREE.InstancedMesh(eggGeo, eggMat, slots.length);
  const cups = new THREE.InstancedMesh(new THREE.TorusGeometry(0.45, 0.05, 8, 24), cupMat, slots.length + 1);
  const r = rng(3);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const eggBase = slots.map(([x, y, z]) => {
    e.set((r() - 0.5) * 0.06, r() * Math.PI * 2, (r() - 0.5) * 0.06);
    return { pos: new THREE.Vector3(x, y + 0.02, z), q: new THREE.Quaternion().setFromEuler(e), d: Math.hypot(x, (y - 0) * 1.2, z) };
  });
  const cupQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const cupBase = [...slots, [0, 0, 0]].map(([x, y, z]) => ({ pos: new THREE.Vector3(x, y + 0.22, z), lvl: Math.round(y / 2.7) + 1 }));
  const vS = new THREE.Vector3(), vP = new THREE.Vector3();
  const backOut = (t) => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  let lastBuild = -1;
  function placeInstances(b) {
    eggBase.forEach((it, i) => {
      const l = clamp((b - (0.32 + it.d * 0.028)) / 0.22);
      const k = l <= 0 ? 0.0001 : backOut(l) * 0.96;
      vP.copy(it.pos);
      vP.y += (1 - easeOut(l)) * 0.8;
      m4.compose(vP, it.q, vS.set(k, k, k));
      eggs.setMatrixAt(i, m4);
    });
    cupBase.forEach((it, i) => {
      const l = clamp((b - (0.05 + it.lvl * 0.08)) / 0.3);
      vP.copy(it.pos);
      vP.y -= (1 - easeOut(l)) * 9;
      vS.set(1, 1, 1).multiplyScalar(l <= 0 ? 0.0001 : 1);
      m4.compose(vP, cupQ, vS);
      cups.setMatrixAt(i, m4);
    });
    eggs.instanceMatrix.needsUpdate = true;
    cups.instanceMatrix.needsUpdate = true;
  }
  eggs.castShadow = true;
  g.add(eggs, cups);
  for (const ty of trays) {
    box(12.8, 0.08, 5.6, trayMat, 0, ty - 0.04, -1.7);
    for (const z of [1.05, -4.45]) box(12.8, 0.18, 0.06, trayMat, 0, ty + 0.05, z);
  }

  // assembly: every part flies in from its own side
  const parts = [];
  for (const m of g.children) {
    if (m === eggs || m === cups || m === floor) continue;
    const p = m.position;
    let off, d0, d1;
    if (p.z > Z1 - 0.4) { off = [0, 9, 0]; d0 = 0.6; d1 = 0.95; }
    else if (m === fan || p.z < Z0 + 0.6) { off = [0, 0, -10]; d0 = 0.2; d1 = 0.55; }
    else if (p.x < X0 + 0.5) { off = [-10, 0, 0]; d0 = 0.28; d1 = 0.62; }
    else if (p.x > X1 - 0.5) { off = [10, 0, 0]; d0 = 0.28; d1 = 0.62; }
    else if (p.y > Y1 - 0.8) { off = [0, 9, 0]; d0 = 0.42; d1 = 0.78; }
    else if (p.y < Y0 + 0.3) { off = [0, -7, 0]; d0 = 0.0; d1 = 0.35; }
    else { const lvl = Math.round(p.y / 2.7) + 1; off = [0, -9, 0]; d0 = 0.05 + lvl * 0.08; d1 = d0 + 0.3; }
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

  // warm interior lights
  const l1 = new THREE.PointLight('#ffb36b', 5, 14, 1.6);
  l1.position.set(-3, 4.2, -0.5);
  const l2 = new THREE.PointLight('#ffc48a', 3.5, 14, 1.6);
  l2.position.set(3.5, 2.2, 0.8);
  const l3 = new THREE.PointLight('#ffa860', 2.5, 12, 1.6);
  l3.position.set(0, -1.2, 0.5);
  const lightGroup = new THREE.Group();
  lightGroup.add(l1, l2, l3);
  const lights = [l1, l2, l3];
  const baseI = lights.map((l) => l.intensity);

  function update(time, { day = 1, dim = 0, on = 1, build = 1, glass = 1 } = {}) {
    glassMat.opacity = 0.06 * glass;
    streakMat.opacity = 0.035 * glass;
    setBuild(build);
    on *= build;
    blades.rotation.z = -time * 4;
    drawScreen(day);
    eggMat.color.copy(eggLit).lerp(eggDim, dim);
    lights.forEach((l, i) => (l.intensity = baseI[i] * (1 - dim * 0.8) * on));
    ledMat.color.setHSL(0.4, 1, 0.45 + 0.15 * Math.sin(time * 3));
  }

  setBuild(1);
  return { group: g, update, lightGroup };
}
