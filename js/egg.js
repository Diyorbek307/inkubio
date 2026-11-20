import * as THREE from 'three';
import { range, easeOut, easeIn, lerp, rng } from './util.js';

// Egg is built in "egg space": bottom at y = 0, top at y = 2, centre at y = 1.
// Pointed end down, blunt end (with the air cell) up — the way eggs sit in an incubator.
export const EGG_H = 1;
export const EGG_R = 0.75;
const RINGS = 160;
const SEGS = 256;

export const radiusAtT = (t) => Math.sin(t) * EGG_R * (1 - 0.12 * Math.cos(t));
export const tFromYc = (yc) => Math.acos(Math.max(-1, Math.min(1, -yc / EGG_H)));
export function eggPoint(phi, yc, k = 1, out = new THREE.Vector3()) {
  const t = tFromYc(yc);
  const r = radiusAtT(t) * k;
  return out.set(r * Math.sin(phi), 1 - Math.cos(t) * EGG_H * k, r * Math.cos(phi));
}

export function eggProfile(rings = RINGS) {
  const pts = [];
  for (let j = 0; j <= rings; j++) {
    const t = (j / rings) * Math.PI;
    pts.push(new THREE.Vector2(Math.max(radiusAtT(t), 1e-4), 1 - Math.cos(t) * EGG_H));
  }
  return pts;
}

// The "zip" line the chick pecks around the blunt end (centre-relative height).
const TEETH = 15;
export const ZIP_Y = 0.35;
export const PIP_Y = 0.38; // first hole ("pip"), facing the viewer
export function breakLine(phi) {
  const f = (phi / (Math.PI * 2)) * TEETH + 0.25;
  const tri = 4 * Math.abs(f - Math.floor(f) - 0.5) - 1;
  return ZIP_Y + 0.028 * tri + 0.014 * Math.sin(phi * 4 + 1);
}

/* ---------------- Shell texture with progressive cracks ---------------- */
function makeCrackPainter() {
  const W = 1024, H = 512;
  const base = document.createElement('canvas');
  base.width = W; base.height = H;
  const b = base.getContext('2d');
  const g = b.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f7f3ec');
  g.addColorStop(0.55, '#f3eee5');
  g.addColorStop(1, '#eae2d5');
  b.fillStyle = g;
  b.fillRect(0, 0, W, H);
  const r = rng(7);
  // soft mottling of the shell colour
  for (let i = 0; i < 260; i++) {
    const x = r() * W, y = r() * H, rad = 20 + r() * 90;
    const m = b.createRadialGradient(x, y, 0, x, y, rad);
    const warm = r() > 0.5;
    m.addColorStop(0, warm ? 'rgba(205,180,150,0.10)' : 'rgba(250,246,238,0.12)');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = m;
    b.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // tiny calcium speckles
  for (let i = 0; i < 900; i++) {
    const a = 0.03 + r() * 0.07;
    b.fillStyle = `rgba(${150 + r() * 40},${125 + r() * 25},${95 + r() * 20},${a})`;
    const s = 0.5 + r() * 1.4;
    b.beginPath();
    b.ellipse(r() * W, r() * H, s, s * (0.6 + r() * 0.6), r() * 3, 0, Math.PI * 2);
    b.fill();
  }

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // (phi, yc) -> canvas coords, phi unwrapped in [-PI, PI]
  const toXY = (phi, yc) => [(phi / (Math.PI * 2)) * W, (1 - tFromYc(yc) / Math.PI) * H];

  // Main ring crack
  const rr = rng(21);
  const ring = [];
  for (let phi = 0; phi <= Math.PI * 2 + 1e-6; phi += 0.01) {
    ring.push([phi, breakLine(phi) + (rr() - 0.5) * 0.012]);
  }
  // Star crack around the pip (front, phi = 0)
  const star = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rr() * 0.4;
    const path = [[0, PIP_Y]];
    let p = 0, y = PIP_Y;
    const len = 0.05 + rr() * 0.09;
    for (let s = 0; s < 8; s++) {
      p += Math.cos(a) * (len / 8) / 0.7 + (rr() - 0.5) * 0.015;
      y += Math.sin(a) * (len / 8) + (rr() - 0.5) * 0.015;
      path.push([p, y]);
    }
    star.push(path);
  }
  // Branches leaving the ring
  const branches = [];
  for (let k = 0; k < 26; k++) {
    const phi0 = rr() * Math.PI * 2;
    const up = rr() > 0.5 ? 1 : -1;
    const path = [[phi0, breakLine(phi0)]];
    let p = phi0, y = breakLine(phi0);
    const steps = 3 + Math.floor(rr() * 5);
    for (let s = 0; s < steps; s++) {
      p += (rr() - 0.5) * 0.08;
      y += up * (0.015 + rr() * 0.02);
      path.push([p, y]);
    }
    branches.push({ path, at: phi0 / (Math.PI * 2) });
  }

  function stroke(path, upto) {
    if (upto <= 0 || path.length < 2) return;
    const n = Math.min(path.length, Math.max(2, Math.floor(path.length * upto)));
    for (const off of [0, W]) {
      ctx.save();
      ctx.translate(off, 0);
      for (const [style, w, dy] of [['rgba(255,255,255,0.55)', 2.6, 1.6], ['rgba(66,48,32,0.9)', 1.7, 0]]) {
        ctx.strokeStyle = style;
        ctx.lineWidth = w;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const [x, y] = toXY(path[i][0], path[i][1]);
          if (i === 0) ctx.moveTo(x, y + dy);
          else ctx.lineTo(x, y + dy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  let last = -1;
  function paint(crack) {
    if (Math.abs(crack - last) < 0.012 && !(crack === 1 && last !== 1) && !(crack === 0 && last !== 0)) return false;
    last = crack;
    ctx.drawImage(base, 0, 0);
    if (crack <= 0) return true;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const starP = range(crack, 0, 0.2);
    for (const s of star) stroke(s, starP);
    const ringP = range(crack, 0.2, 1);
    if (ringP > 0) {
      // the chick turns inside and pecks its way round, in one direction
      stroke(ring, ringP);
      for (const br of branches) stroke(br.path, range(ringP, br.at, br.at + 0.06));
    }
    return true;
  }
  return { canvas, paint };
}

/* ---------------- Pores and roughness for a real shell surface ---------------- */
function makeSurfaceMaps() {
  const W = 1024, H = 512;
  const r = rng(77);
  const bump = document.createElement('canvas');
  bump.width = W; bump.height = H;
  const b = bump.getContext('2d');
  b.fillStyle = '#808080';
  b.fillRect(0, 0, W, H);
  // gentle undulation
  for (let i = 0; i < 400; i++) {
    const x = r() * W, y = r() * H, rad = 10 + r() * 40;
    const m = b.createRadialGradient(x, y, 0, x, y, rad);
    const v = r() > 0.5 ? 255 : 0;
    m.addColorStop(0, `rgba(${v},${v},${v},0.06)`);
    m.addColorStop(1, `rgba(${v},${v},${v},0)`);
    b.fillStyle = m;
    b.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // pores
  for (let i = 0; i < 26000; i++) {
    b.fillStyle = `rgba(0,0,0,${0.12 + r() * 0.25})`;
    const s = 0.4 + r() * 0.9;
    b.fillRect(r() * W, r() * H, s, s);
  }
  for (let i = 0; i < 9000; i++) {
    b.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.12})`;
    b.fillRect(r() * W, r() * H, 1, 1);
  }
  const rough = document.createElement('canvas');
  rough.width = 512; rough.height = 256;
  const q = rough.getContext('2d');
  q.fillStyle = '#d0d0d0';
  q.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 300; i++) {
    const x = r() * 512, y = r() * 256, rad = 8 + r() * 40;
    const m = q.createRadialGradient(x, y, 0, x, y, rad);
    const v = r() > 0.4 ? 150 : 255;
    m.addColorStop(0, `rgba(${v},${v},${v},0.35)`);
    m.addColorStop(1, `rgba(${v},${v},${v},0)`);
    q.fillStyle = m;
    q.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const bumpTex = new THREE.CanvasTexture(bump);
  const roughTex = new THREE.CanvasTexture(rough);
  bumpTex.anisotropy = roughTex.anisotropy = 8;
  return { bumpTex, roughTex };
}
export const shellMaps = /* @__PURE__ */ (() => {
  let cache = null;
  return () => (cache ||= makeSurfaceMaps());
})();

/* ---------------- Shell geometry split into pieces ---------------- */
function splitShell() {
  const geo = new THREE.LatheGeometry(eggProfile(), SEGS).toNonIndexed();
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;

  const pip = eggPoint(0, PIP_Y);
  const buckets = [[], [], []]; // bottom, cap, pip
  const c = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  for (let tri = 0; tri < pos.count / 3; tri++) {
    c.set(0, 0, 0);
    for (let v = 0; v < 3; v++) c.add(tmp.fromBufferAttribute(pos, tri * 3 + v));
    c.multiplyScalar(1 / 3);
    const phi = Math.atan2(c.x, c.z);
    const wobble = 0.012 * Math.sin(Math.atan2(c.y - pip.y, c.x) * 7);
    if (c.distanceTo(pip) < 0.085 + wobble) buckets[2].push(tri);
    else if (c.y - 1 < breakLine(phi)) buckets[0].push(tri);
    else buckets[1].push(tri);
  }

  return buckets.map((tris) => {
    const n = tris.length * 3;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
    const centre = new THREE.Vector3();
    tris.forEach((tri, i) => {
      for (let v = 0; v < 3; v++) {
        const src = tri * 3 + v, dst = i * 3 + v;
        P.set([pos.getX(src), pos.getY(src), pos.getZ(src)], dst * 3);
        N.set([nor.getX(src), nor.getY(src), nor.getZ(src)], dst * 3);
        U.set([uv.getX(src), uv.getY(src)], dst * 2);
        centre.x += pos.getX(src); centre.y += pos.getY(src); centre.z += pos.getZ(src);
      }
    });
    centre.multiplyScalar(1 / n);
    for (let i = 0; i < n; i++) {
      P[i * 3] -= centre.x; P[i * 3 + 1] -= centre.y; P[i * 3 + 2] -= centre.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    return { geometry: g, centre };
  });
}

/* ---------------- Egg object ---------------- */
export function createEgg() {
  const pivot = new THREE.Group(); // rotate around egg centre
  pivot.position.set(0, 1, 0);
  const group = new THREE.Group();
  group.position.set(0, -1, 0);
  pivot.add(group);

  const painter = makeCrackPainter();
  painter.paint(0);
  const map = new THREE.CanvasTexture(painter.canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  const { bumpTex, roughTex } = shellMaps();
  const common = {
    map, bumpMap: bumpTex, bumpScale: 0.9, roughnessMap: roughTex, roughness: 0.58,
    clearcoat: 0.3, clearcoatRoughness: 0.32,
    sheen: 0.35, sheenColor: new THREE.Color('#fff0dc'), sheenRoughness: 0.7,
    envMapIntensity: 1.0,
  };
  const matOpaque = new THREE.MeshPhysicalMaterial({ ...common, side: THREE.DoubleSide });
  const matCandle = new THREE.MeshPhysicalMaterial({
    ...common, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.FrontSide,
    emissive: new THREE.Color('#ff9a45'), emissiveIntensity: 0.0,
  });
  const matFrag = new THREE.MeshPhysicalMaterial({ ...common, side: THREE.DoubleSide, transparent: true });
  const matBottom = new THREE.MeshPhysicalMaterial({ ...common, side: THREE.DoubleSide, transparent: true });

  const pieces = splitShell();
  const parts = pieces.map((p, i) => {
    const mesh = new THREE.Mesh(p.geometry, matOpaque);
    mesh.position.copy(p.centre);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const dir = new THREE.Vector3(p.centre.x, (p.centre.y - 1) * 0.6, p.centre.z).normalize();
    // a few vertices to find where the piece touches the floor
    const pa = p.geometry.attributes.position;
    const samples = [];
    for (let k = 0; k < pa.count; k += Math.max(1, Math.floor(pa.count / 400))) samples.push(new THREE.Vector3().fromBufferAttribute(pa, k));
    return { mesh, centre: p.centre.clone(), dir, samples };
  });
  const bottom = parts[0];
  const cap = parts[1];
  const pipPiece = parts[2];
  const frags = [cap, pipPiece];

  const sv = new THREE.Vector3();
  function lowestY(part) {
    part.mesh.updateMatrix();
    let m = Infinity;
    for (const v of part.samples) m = Math.min(m, sv.copy(v).applyMatrix4(part.mesh.matrix).y);
    return m;
  }
  // where the shell pieces end up
  const TIP_PIVOT = new THREE.Vector3(0.3, 0.02, 0.05);
  const TIP_ANGLE = -1.32;
  const tipQ = new THREE.Quaternion();
  const tipAxis = new THREE.Vector3(0.12, 0.25, 1).normalize();
  const rider = new THREE.Matrix4();
  const restInv = new THREE.Matrix4();
  const eCap = new THREE.Euler();

  // warm light inside for "candling"
  const candle = new THREE.PointLight('#ffb15a', 0, 4, 1.5);
  candle.position.set(0, 0.9, 0);

  const q = new THREE.Quaternion();
  function setMaterial(m) {
    for (const p of parts) p.mesh.material = m;
  }

  /**
   * state: { mode: 'opaque'|'candle'|'broken', opacity, glow, crack, peck, burst, bottomFade }
   */
  function update(s) {
    if (painter.paint(s.crack || 0)) map.needsUpdate = true;

    if (s.mode === 'candle') {
      setMaterial(matCandle);
      matCandle.opacity = s.opacity;
      matCandle.emissiveIntensity = s.glow * 0.55;
      candle.intensity = s.glow * 6;
    } else if (s.mode === 'broken') {
      for (const f of frags) f.mesh.material = matFrag;
      bottom.mesh.material = matBottom;
      candle.intensity = 0;
    } else {
      setMaterial(matOpaque);
      candle.intensity = 0;
    }

    for (const f of parts) {
      f.mesh.position.copy(f.centre);
      f.mesh.quaternion.identity();
      f.mesh.visible = true;
    }

    // 1. the pip: a small chip of shell is pushed out and drops in front of the egg
    const pk = s.peck || 0;
    if (pk > 0) {
      const e = easeOut(range(pk, 0, 0.4));
      const fall = range(pk, 0.25, 1);
      pipPiece.mesh.position.addScaledVector(pipPiece.dir, 0.04 + e * 0.12 + fall * 0.35);
      q.setFromAxisAngle(sv.set(1, 0.3, 0).normalize(), e * 0.8 + fall * 2.4);
      pipPiece.mesh.quaternion.copy(q);
      const yRest = pipPiece.mesh.position.y - lowestY(pipPiece) + 0.002;
      pipPiece.mesh.position.y = lerp(pipPiece.mesh.position.y, yRest, easeIn(fall));
    }

    // 2. the cap: pushed up by the head, tilts back and slides off behind the egg
    const cp = s.cap || 0;
    if (cp > 0) {
      const a = easeOut(range(cp, 0, 0.4));
      const b = range(cp, 0.4, 1);
      eCap.set(-0.55 * a + -2.2 * easeIn(b), 0.3 * b, 0.45 * b);
      cap.mesh.quaternion.setFromEuler(eCap);
      cap.mesh.position.set(
        cap.centre.x - 0.95 * b,
        cap.centre.y + 0.2 * a + Math.sin(Math.PI * b) * 0.25,
        cap.centre.z - 0.1 * a - 0.65 * b
      );
      if (b > 0) {
        const rest = cap.mesh.position.y - lowestY(cap);
        cap.mesh.position.y = lerp(cap.mesh.position.y, rest, easeIn(b));
      }
    }

    // 3. the bottom half tips over on its side so the chick can crawl out
    const tp = s.tip || 0;
    tipQ.setFromAxisAngle(tipAxis, TIP_ANGLE * tp);
    bottom.mesh.quaternion.copy(tipQ);
    bottom.mesh.position.copy(bottom.centre).sub(TIP_PIVOT).applyQuaternion(tipQ).add(TIP_PIVOT);
    if (tp > 0) bottom.mesh.position.y -= lowestY(bottom);
    bottom.mesh.updateMatrix();
    restInv.makeTranslation(-bottom.centre.x, -bottom.centre.y, -bottom.centre.z);
    rider.multiplyMatrices(bottom.mesh.matrix, restInv);

    if (s.pipHide) pipPiece.mesh.visible = false;
    const fade = s.bottomFade || 0;
    matFrag.opacity = matBottom.opacity = 1 - fade;
    for (const f of parts) f.mesh.visible = f.mesh.visible && 1 - fade > 0.01;
  }

  // moves anything sitting inside the bottom half along with it (the chick)
  const riderMatrix = () => rider;
  return { pivot, group, update, bottom, cap, parts, candle, riderMatrix };
}
