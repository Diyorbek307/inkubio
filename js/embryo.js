import * as THREE from 'three';
import { std } from './mat.js';
import { eggProfile } from './egg.js';
import { kf, range, sr, lerp, rng } from './util.js';

/*
 Development inside the egg, driven by incubation day (1..18):
  1–4   small embryo lies on top of the yolk, vessels spread over the yolk from it
  4–9   C-shaped embryo with a big eye and limb buds; vessels reach the shell membrane
  9–12  the embryo turns into the chick (cross-dissolve into the real chick model)
  12–18 the chick grows, gets its down, the yolk shrinks and moves to its belly
 The chick at day 18 is exactly the chick that hatches in the next scene.
*/

/* ---------------- vascular trees painted on canvas ---------------- */
// Grow a branching tree in (theta, phi) space on a sphere-like surface.
function growTree(seed, origin, { trunks = 9, step = 0.022, maxLen = 2.6, branchP = 0.09, width = 3.2 }) {
  const r = rng(seed);
  const segs = [];
  function walk(th, ph, dir, w, dist, depth, life) {
    for (let s = 0; s < life; s++) {
      const th1 = Math.min(Math.PI - 0.05, Math.max(0.05, th + Math.sin(dir) * step));
      const ph1 = ph + (Math.cos(dir) * step) / Math.max(0.15, Math.sin(th));
      segs.push([th, ph, th1, ph1, w, dist]);
      th = th1; ph = ph1; dist += step;
      dir += (r() - 0.5) * 0.35;
      w *= 0.993;
      if (dist > maxLen) return;
      if (depth < 4 && r() < branchP) walk(th, ph, dir + (r() > 0.5 ? 1 : -1) * (0.5 + r() * 0.5), w * 0.62, dist, depth + 1, Math.floor((30 + r() * 60) / (depth + 1)));
    }
  }
  for (let k = 0; k < trunks; k++) {
    walk(origin[0], origin[1], (k / trunks) * Math.PI * 2 + r() * 0.3, width, 0, 0, 140);
  }
  return segs;
}

function treeCanvas(W, H, segs, toXY, styles) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.lineCap = 'round';
  paintTree(ctx, W, H, segs, Infinity, toXY, styles);
  return c;
}
// reveal a pre-painted tree inside an ellipse around its origin (with wrap-around in x)
function reveal(ctx, W, img, ox, oy, rx, ry) {
  ctx.save();
  ctx.beginPath();
  for (const off of [-W, 0, W]) {
    ctx.moveTo(ox + off + rx, oy);
    ctx.ellipse(ox + off, oy, rx, ry, 0, 0, Math.PI * 2);
  }
  ctx.clip();
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function paintTree(ctx, W, H, segs, grow, toXY, styles) {
  for (const [col, wMul, alpha] of styles) {
    ctx.strokeStyle = col;
    ctx.globalAlpha = alpha;
    for (const [th0, ph0, th1, ph1, w, dist] of segs) {
      if (dist > grow) continue;
      const [x0, y0] = toXY(th0, ph0);
      const [x1, y1] = toXY(th1, ph1);
      if (Math.abs(x1 - x0) > W / 2) continue;
      const fade = grow === Infinity ? 1 : Math.min(1, (grow - dist) * 6);
      ctx.lineWidth = Math.max(0.6, w * wMul * fade);
      for (const off of [-W, 0, W]) {
        ctx.beginPath();
        ctx.moveTo(x0 + off, y0);
        ctx.lineTo(x1 + off, y1);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}

/* ---------------- early embryo: curled C-shape ---------------- */
function buildEarlyEmbryo(mat, eyeMat, heartMat) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    const a = Math.PI * 0.62 - u * Math.PI * 1.55;
    const rad = lerp(0.36, 0.17, u);
    pts.push(new THREE.Vector3(Math.cos(a) * rad, Math.sin(a) * rad, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const TS = 60, RS = 16;
  const geo = new THREE.TubeGeometry(curve, TS, 1, RS, false);
  const p = geo.attributes.position;
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= TS; i++) {
    const u = i / TS;
    curve.getPointAt(u, c);
    const thick = u < 0.12 ? lerp(0.1, 0.13, u / 0.12) : lerp(0.15, 0.025, Math.pow((u - 0.12) / 0.88, 0.9));
    for (let j = 0; j <= RS; j++) {
      const k = i * (RS + 1) + j;
      v.fromBufferAttribute(p, k).sub(c).multiplyScalar(thick);
      p.setXYZ(k, c.x + v.x, c.y + v.y, c.z + v.z * 0.85);
    }
  }
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, mat));

  // head (large, typical of early embryos)
  const headPos = curve.getPointAt(0).clone().add(new THREE.Vector3(-0.08, 0.1, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 24), mat);
  head.position.copy(headPos);
  g.add(head);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 16), eyeMat);
  eye.position.copy(headPos).add(new THREE.Vector3(0.03, -0.01, 0.16));
  g.add(eye);
  // limb buds
  const buds = [];
  for (const [u, sx, sy] of [[0.3, 0.07, 0.11], [0.58, 0.06, 0.1]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat);
    const at = curve.getPointAt(u);
    const out = at.clone().setZ(0).normalize();
    b.position.copy(at).addScaledVector(out, 0.12).add(new THREE.Vector3(0, 0, 0.06));
    b.scale.set(sx, sy, 0.05);
    b.rotation.z = Math.atan2(out.y, out.x);
    g.add(b);
    buds.push(b);
  }
  // heart
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), heartMat);
  heart.position.copy(curve.getPointAt(0.16)).add(new THREE.Vector3(-0.14, -0.02, 0.08));
  g.add(heart);
  return { group: g, eye, buds, heart };
}

/* ------------------------------------------------------------------ */
export function createEmbryo(hero) {
  const group = new THREE.Group();

  /* yolk with its vascular area.
     The vessels are painted once; their growth is a GPU mask (uGrow), so scrolling never repaints a texture. */
  const YW = 512, YH = 256;
  const yolkBase = document.createElement('canvas');
  yolkBase.width = YW; yolkBase.height = YH;
  {
    const b = yolkBase.getContext('2d');
    const gr = b.createLinearGradient(0, 0, 0, YH);
    gr.addColorStop(0, '#ffc23a');
    gr.addColorStop(1, '#f29a12');
    b.fillStyle = gr;
    b.fillRect(0, 0, YW, YH);
    const r = rng(5);
    for (let i = 0; i < 160; i++) {
      const x = r() * YW, y = r() * YH, rad = 10 + r() * 50;
      const m = b.createRadialGradient(x, y, 0, x, y, rad);
      m.addColorStop(0, r() > 0.5 ? 'rgba(255,220,120,0.18)' : 'rgba(220,120,10,0.15)');
      m.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = m;
      b.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  const yolkTex = new THREE.CanvasTexture(yolkBase);
  yolkTex.colorSpace = THREE.SRGBColorSpace;
  yolkTex.anisotropy = 4;
  const yolkMat = std({
    map: yolkTex, roughness: 0.28,
    emissive: '#8a3a00', emissiveIntensity: 0.3, emissiveMap: yolkTex, envMapIntensity: 0.6,
  });
  const yolk = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), yolkMat);
  group.add(yolk);
  // the embryo sits on the upper front of the yolk
  const EMB_DIR = new THREE.Vector3(0, 0.7, 0.71).normalize();
  // SphereGeometry: x = -cos(phi) sin(theta), y = cos(theta), z = sin(phi) sin(theta)
  const yolkOrigin = [Math.acos(EMB_DIR.y), Math.PI / 2];
  const yolkTree = growTree(11, yolkOrigin, { trunks: 10, step: 0.02, maxLen: 1.9, branchP: 0.1, width: 1.9 });
  const yolkXY = (th, ph) => [(ph / (Math.PI * 2)) * YW, (th / Math.PI) * YH];
  const yolkTreeTex = new THREE.CanvasTexture(treeCanvas(YW * 2, YH * 2, yolkTree, (th, ph) => yolkXY(th, ph).map((v) => v * 2), [['#e0473c', 2.4, 0.35], ['#9c0f1e', 1.1, 0.95]]));
  yolkTreeTex.colorSpace = THREE.SRGBColorSpace;
  yolkTreeTex.anisotropy = 4;

  // grows a texture outwards from an origin on the surface; with an optional halo and boundary vein
  function growMask(mat, origin, sinT, { halo = false } = {}) {
    const u = { uGrow: { value: 0 } };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uGrow = u.uGrow;
      sh.fragmentShader = 'uniform float uGrow;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        float du = abs(vMapUv.x - ${origin[0].toFixed(4)});
        du = min(du, 1.0 - du) * 6.2832 * ${sinT.toFixed(4)};
        float dv = ((1.0 - vMapUv.y) - ${origin[1].toFixed(4)}) * 3.1416;
        float d = length(vec2(du, dv));
        float inside = 1.0 - smoothstep(uGrow - 0.04, uGrow, d);
        diffuseColor.a *= inside;
        ${halo ? `
        float area = (1.0 - smoothstep(uGrow * 0.85, uGrow, d)) * step(0.001, uGrow);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.38, 0.24), area * 0.35 * (1.0 - diffuseColor.a));
        float vein = (1.0 - smoothstep(0.0, 0.018, abs(d - uGrow * 0.97))) * step(0.02, uGrow);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.05, 0.08), vein * 0.9);
        diffuseColor.a = max(diffuseColor.a, max(area * 0.35, vein * 0.9));` : ''}
      }`);
    };
    mat.customProgramCacheKey = () => `grow-${origin.join(',')}-${halo}`;
    return u;
  }
  const yolkVessels = new THREE.Mesh(
    yolk.geometry,
    std({ map: yolkTreeTex, transparent: true, depthWrite: false, roughness: 0.35, envMapIntensity: 0.5 })
  );
  yolkVessels.scale.setScalar(1.004);
  yolk.add(yolkVessels);
  const yolkGrow = growMask(yolkVessels.material, [0.25, yolkOrigin[0] / Math.PI], Math.sin(yolkOrigin[0]), { halo: true });
  function paintYolk(grow) {
    yolkGrow.uGrow.value = grow;
    yolkVessels.visible = grow > 0.001;
  }

  /* shell membrane (chorioallantois) with fine vessels, seen when candling */
  const MW = 1024, MH = 512;
  const memTree = growTree(23, [Math.PI * 0.36, 0], { trunks: 5, step: 0.018, maxLen: 2.5, branchP: 0.07, width: 2.4 });
  const memXY = (th, ph) => [((((ph % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * MW, (th / Math.PI) * MH];
  const memTex = new THREE.CanvasTexture(treeCanvas(MW, MH, memTree, memXY, [['#c8323a', 1.2, 0.14], ['#8e0d1a', 0.55, 0.7]]));
  memTex.colorSpace = THREE.SRGBColorSpace;
  memTex.anisotropy = 4;
  const memMat = new THREE.MeshBasicMaterial({ map: memTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.6 });
  const membrane = new THREE.Mesh(
    new THREE.LatheGeometry(eggProfile(80).map((v) => new THREE.Vector2(v.x * 0.965, 1 + (v.y - 1) * 0.965)), 128),
    memMat
  );
  membrane.renderOrder = 1;
  group.add(membrane);
  // lathe: u = phi / 2PI (phi = 0 faces the viewer), v = t / PI from the bottom
  const memGrow = growMask(memMat, [0, 0.36], Math.sin(Math.PI * 0.36));
  function paintMembrane(grow) {
    memGrow.uGrow.value = grow;
    membrane.visible = grow > 0.001;
  }

  /* early embryo */
  const embMat = std({
    color: '#ec9d8f', roughness: 0.35, sheen: 0.6, sheenColor: new THREE.Color('#ffd4cc'),
    emissive: '#6a1a14', emissiveIntensity: 0.35, clearcoat: 0.4, alphaHash: true,
  });
  const embEye = std({ color: '#1a0d0c', roughness: 0.15, clearcoat: 1, alphaHash: true });
  const heartMat = new THREE.MeshStandardMaterial({ color: '#c3102a', emissive: '#ff2040', emissiveIntensity: 0.8, alphaHash: true });
  const early = buildEarlyEmbryo(embMat, embEye, heartMat);
  group.add(early.group);

  const pink = new THREE.Color('#eea08f');
  const yellow = hero.baseColor.clone();
  const tmpC = new THREE.Color();
  const yc = new THREE.Vector3();

  /**
   * Updates the inside of the egg for a given day.
   * Also places the hero chick (from day 9.5) and fills its pose `p`.
   * Returns true when the hero chick should be visible.
   */
  function setDay(day, time, p) {
    // yolk: big and central at first, then shrinks and slides to the chick's belly
    const yr = kf(day, [[1, 0.52], [8, 0.5], [13, 0.37], [18, 0.2]]);
    yc.set(0, kf(day, [[1, 0.92], [9, 0.86], [14, 0.62], [18, 0.5]]), kf(day, [[1, 0], [10, 0.04], [18, 0.22]]));
    yolk.scale.setScalar(yr);
    yolk.position.copy(yc);
    paintYolk(kf(day, [[1.5, 0], [3, 0.35], [6, 1.15], [9, 1.9]]));
    paintMembrane(kf(day, [[5, 0], [8, 0.9], [12, 2.2], [15, 3.0]]));

    // early embryo on the yolk surface
    const s = kf(day, [[1, 0.06], [3, 0.13], [5, 0.22], [7, 0.3], [9.5, 0.38], [11.5, 0.42]]);
    const fadeOut = 1 - sr(day, 9.5, 11.5);
    early.group.visible = fadeOut > 0.01;
    early.group.scale.setScalar(s);
    early.group.position.copy(yc).addScaledVector(EMB_DIR, yr + 0.06 * s + 0.01);
    early.group.rotation.set(-0.35, 0, 0);
    embMat.opacity = embEye.opacity = heartMat.opacity = fadeOut;
    early.eye.scale.set(1, 1, 0.6).multiplyScalar(Math.max(0.01, range(day, 2.5, 5)));
    for (const b of early.buds) b.visible = day > 4.5;
    const beat = Math.pow(Math.max(0, Math.sin(time * 9)), 6);
    early.heart.scale.setScalar(lerp(0.8, 1.35, beat));

    // the chick itself
    const fadeIn = sr(day, 9.5, 11.5);
    const visible = fadeIn > 0.01;
    if (visible) {
      hero.root.scale.setScalar(kf(day, [[9.5, 0.24], [12, 0.34], [15, 0.5], [18, 0.62]]));
      hero.root.position.set(0, kf(day, [[9.5, 1.12], [12, 1.0], [15, 0.78], [18, 0.38]]), kf(day, [[9.5, 0.3], [14, 0.12], [18, 0]]));
      hero.root.rotation.set(0, 0, 0);
      tmpC.copy(pink).lerp(yellow, sr(day, 11, 16));
      hero.setLook({ color: tmpC, fur: sr(day, 12, 17), opacity: fadeIn });
      p.tuck = 1;
      p.lean = -0.35;
      p.bigHead = kf(day, [[9.5, 0.7], [14, 0.2], [17, 0]]);
      p.blink = 0.6;
      p.headYaw = Math.sin(time * 0.5) * 0.04;
      for (const t of hero.parts.tufts) t.visible = day > 14;
      const beakS = range(day, 9.5, 12);
      hero.parts.beakUpper.visible = hero.parts.beakLower.visible = beakS > 0.02;
    }
    return visible;
  }

  // restore the chick after the egg scenes
  function resetHero() {
    hero.setLook({ color: hero.baseColor, fur: 1, opacity: 1 });
    for (const t of hero.parts.tufts) t.visible = true;
    hero.parts.beakUpper.visible = hero.parts.beakLower.visible = true;
  }

  return { group, setDay, resetHero, membrane };
}
