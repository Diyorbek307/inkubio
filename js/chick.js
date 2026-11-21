import * as THREE from 'three';
import { std } from './mat.js';

/*
 A day-old chick with realistic proportions:
 egg-shaped body held fairly horizontal, smaller head set forward, eyes on the
 sides of the head, short pale beak with an egg tooth, long pinkish legs,
 stubby wings and dense down made of layered "fur shells".
 It can be wet (just hatched: matted, darker, glossy) or dry (fluffy).
*/

let furImage = null;
function furTexture(rx, ry) {
  if (!furImage) {
    // Down strands: thousands of soft round dots. A dot's value says how long that strand is;
    // its brightness falls off from the centre, so higher shells cut it thinner — strands taper to a tip.
    const N = 512;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d');
    const img = x.createImageData(N, N);
    const a = new Float32Array(N * N);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 21000; k++) {
      const cx = rnd() * N, cy = rnd() * N;
      const r = 1.4 + rnd() * 1.9;
      const v = 0.35 + 0.65 * Math.pow(rnd(), 0.55);
      const R = Math.ceil(r);
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.hypot(dx + (cx % 1) - 0.5, dy + (cy % 1) - 0.5) / r;
          if (d >= 1) continue;
          const px = (Math.floor(cx) + dx + N) % N, py = (Math.floor(cy) + dy + N) % N;
          const val = v * (1 - d * d);
          if (val > a[py * N + px]) a[py * N + px] = val;
        }
      }
    }
    for (let i = 0; i < N * N; i++) {
      const v = Math.round(a[i] * 255);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    furImage = c;
  }
  const t = new THREE.CanvasTexture(furImage);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  // smooth filtering keeps each strand round (no square pixels); no mip-maps, which would blur strands into a solid surface
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

// Down shading: deeper layers sit in the shadow of the ones above; at the silhouette light passes through
// the fluffy edge and it glows softly — the look that makes down read as down and not as a toy.
function furShader(m, f, rimColor) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.furF = { value: f };
    sh.uniforms.rimColor = { value: rimColor };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float furF;\nuniform vec3 rimColor;')
      .replace('#include <opaque_fragment>', `
        float ndv = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
        float rim = pow(1.0 - ndv, 2.2);
        float lit = dot(outgoingLight, vec3(0.333));
        outgoingLight *= mix(0.74, 1.05, furF);
        outgoingLight += rimColor * rim * furF * (0.18 + 1.1 * lit);
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'chick-down';
}

// egg-shaped body, fuller at the chest and belly
function bodyGeometry(r) {
  const g = new THREE.SphereGeometry(r, 72, 54);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.08 * (z / r); // slightly fuller in front
    const sag = y < 0 ? 1 + 0.06 * (-y / r) : 1;
    p.setXYZ(i, x * k * sag, y, z);
  }
  g.computeVertexNormals();
  return g;
}

export function createPose() {
  return {
    headYaw: 0, headPitch: 0, headRoll: 0, blink: 0, wing: 0, flap: 0, hop: 0, lean: 0,
    beak: 0, walk: 0, squash: 0, tuck: 0, sit: 0, bigHead: 0, lie: 0, shake: 0,
  };
}

// horny scales across the shank, as a bump map
let scaleImage = null;
function scaleTexture() {
  if (!scaleImage) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#808080';
    x.fillRect(0, 0, 64, 256);
    for (let y = 0; y < 256; y += 16) {
      const g = x.createLinearGradient(0, y, 0, y + 16);
      g.addColorStop(0, '#5a5a5a');
      g.addColorStop(0.25, '#b0b0b0');
      g.addColorStop(1, '#6a6a6a');
      x.fillStyle = g;
      x.fillRect(0, y, 64, 15);
    }
    scaleImage = c;
  }
  const t = new THREE.CanvasTexture(scaleImage);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function createChick({ color = '#f6cd4f', seed = 1, layers = 16 } = {}) {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  // a day-old broiler chick is pale lemon-yellow: deeper and warmer at the roots, almost cream at the tips
  const baseColor = new THREE.Color(color);
  const rootColor = new THREE.Color(color).multiplyScalar(0.86);
  const tipColor = new THREE.Color(color).lerp(new THREE.Color('#fff3c4'), 0.45);
  const rimColor = new THREE.Color('#fff1c2');
  const wetColor = new THREE.Color('#b99044');
  const fluff = std({ color: rootColor, roughness: 0.95, envMapIntensity: 0.35, alphaHash: true });
  const beakMat = std({ color: '#ecc995', roughness: 0.35, envMapIntensity: 0.8, alphaHash: true });
  const toothMat = new THREE.MeshStandardMaterial({ color: '#f8f4ea', roughness: 0.45, alphaHash: true });
  const shankBump = scaleTexture();
  shankBump.repeat.set(1, 2.5);
  const legMat = new THREE.MeshStandardMaterial({ color: '#efb253', roughness: 0.55, bumpMap: shankBump, bumpScale: 1.2, envMapIntensity: 0.6, alphaHash: true });
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#0b0705', roughness: 0.03, metalness: 0.1, envMapIntensity: 2.4, alphaHash: true });
  const lidMat = new THREE.MeshStandardMaterial({ color: '#6b5530', roughness: 0.85, alphaHash: true });

  const meshes = [];
  const furLayers = [];
  const furShells = [];
  const add = (parent, geo, mat, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    parent.add(m);
    meshes.push(m);
    return m;
  };
  // colour of one down layer: roots → body colour → pale tips
  function shellColor(f, out, base = baseColor) {
    out.copy(rootColor).lerp(base, Math.min(1, f * 2));
    if (f > 0.5) out.lerp(tipColor, (f - 0.5) * 2 * 0.85);
    return out;
  }
  function fur(mesh, radius, length, rx, ry, n = layers, droop = 0.35, comb = 0.4) {
    const tex = furTexture(rx, ry);
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      // down is matte: a cheap Lambert material is enough and keeps the many layers fast
      const m = new THREE.MeshLambertMaterial({
        color: shellColor(f, new THREE.Color()),
        alphaMap: tex, alphaTest: 0.1 + Math.pow(f, 1.3) * 0.74,
      });
      furShader(m, f, rimColor);
      m.userData = { base: m.alphaTest, f };
      const shell = new THREE.Mesh(mesh.geometry, m);
      shell.userData = { f, len: length, radius, droop, comb, i, n };
      shell.raycast = () => {};
      mesh.add(shell);
      furLayers.push(m);
      furShells.push(shell);
    }
  }
  // fewer visible down layers for weaker devices (silhouette stays, the down gets sparser)
  function setFurDensity(d) {
    for (const s of furShells) {
      const { i, n } = s.userData;
      const every = Math.max(1, Math.round(1 / Math.max(0.05, d)));
      s.visible = i === n || i % every === 0;
    }
  }
  function setFurLength(k) {
    for (const s of furShells) {
      const { f, len, radius, droop, comb } = s.userData;
      s.scale.setScalar(1 + (f * len * k) / radius);
      // the outer down bends: it settles downwards and lies back towards the tail
      s.position.y = -droop * f * f * len * k;
      s.position.z = -comb * f * f * len * k;
    }
  }

  /* body */
  const bodyScaler = new THREE.Group();
  bodyPivot.add(bodyScaler);
  const bodyTilt = new THREE.Group();
  bodyTilt.position.y = 0.7;
  bodyTilt.rotation.x = 0.18; // chicks hold the body forward-tilted
  bodyScaler.add(bodyTilt);
  const body = add(bodyTilt, bodyGeometry(0.5), fluff);
  body.scale.set(0.86, 0.88, 1.1);
  fur(body, 0.5, 0.085, 4, 2, layers, 0.35, 0.55);

  // rump and tail down
  const rump = add(bodyTilt, new THREE.SphereGeometry(0.2, 32, 20), fluff);
  rump.position.set(0, 0.08, -0.5);
  rump.scale.set(1, 0.85, 0.9);
  fur(rump, 0.2, 0.07, 1.5, 1, Math.ceil(layers * 0.6), 0.3, 0.6);

  // neck and chest blend
  const neck = add(bodyScaler, new THREE.SphereGeometry(0.27, 40, 28), fluff);
  neck.position.set(0, 1.02, 0.28);
  neck.scale.set(0.95, 1, 1);
  fur(neck, 0.27, 0.07, 2, 1, Math.ceil(layers * 0.8), 0.3, 0.3);

  /* head */
  const headPivot = new THREE.Group();
  headPivot.rotation.order = 'YXZ';
  bodyPivot.add(headPivot);
  const head = add(headPivot, new THREE.SphereGeometry(0.3, 56, 40), fluff);
  head.position.set(0, 0.17, 0.05);
  head.scale.set(0.95, 0.97, 1.05);
  fur(head, 0.3, 0.036, 3, 1.5, Math.ceil(layers * 0.8), 0.15, 0.45);

  // beak: short, pointed, pale, with the egg tooth on the tip
  const beakGeo = new THREE.ConeGeometry(0.06, 0.15, 24);
  beakGeo.rotateX(Math.PI / 2);
  beakGeo.translate(0, 0, 0.075);
  const beakUpper = add(headPivot, beakGeo, beakMat);
  beakUpper.scale.set(1, 0.55, 1);
  beakUpper.position.set(0, 0.15, 0.335);
  beakUpper.rotation.x = 0.12;
  const tooth = add(beakUpper, new THREE.SphereGeometry(0.012, 10, 8), toothMat, false);
  tooth.position.set(0, 0.022, 0.135);
  const lowerPivot = new THREE.Group();
  lowerPivot.position.set(0, 0.125, 0.325);
  headPivot.add(lowerPivot);
  const beakLower = add(lowerPivot, beakGeo, beakMat);
  beakLower.scale.set(0.8, 0.35, 0.78);
  beakLower.rotation.x = 0.1;

  // eyes on the sides of the head
  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.255, 0.23, 0.235);
    eye.rotation.y = s * 0.75;
    headPivot.add(eye);
    const ring = add(eye, new THREE.TorusGeometry(0.064, 0.008, 10, 28), lidMat, false);
    ring.position.z = 0.012;
    const ball = add(eye, new THREE.SphereGeometry(0.063, 32, 20), eyeMat, false);
    ball.scale.set(1, 1.05, 0.7);
    // a tiny catch-light; the rest of the shine comes from real reflections of the room
    const glint = add(eye, new THREE.SphereGeometry(0.0075, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff8ee', alphaHash: true }), false);
    glint.position.set(0.016, 0.02, 0.043);
    eyes.push(eye);
  }
  const tufts = [];

  /* wings: small and stubby */
  const wings = [];
  const wingGeo = new THREE.SphereGeometry(1, 36, 24);
  for (const s of [-1, 1]) {
    // a day-old chick's wing is a small fluffy stub pressed to the body
    const wp = new THREE.Group();
    wp.position.set(s * 0.375, 0.86, 0.1);
    bodyPivot.add(wp);
    const w = add(wp, wingGeo, fluff);
    w.scale.set(0.06, 0.13, 0.21);
    w.position.set(s * 0.005, -0.1, -0.12);
    w.rotation.set(0.5, s * 0.12, s * -0.1);
    fur(w, 1, 0.42, 1, 0.5, Math.ceil(layers * 0.5), 0.3, 0.6);
    wings.push({ pivot: wp, side: s });
  }

  /* legs: long, thin, four toes */
  const legs = [];
  const thighGeo = new THREE.CapsuleGeometry(0.075, 0.07, 4, 14);
  const shankGeo = new THREE.CapsuleGeometry(0.037, 0.21, 4, 14);
  const toeGeo = new THREE.CapsuleGeometry(0.022, 0.15, 4, 8);
  toeGeo.rotateX(Math.PI / 2);
  toeGeo.translate(0, 0, 0.085);
  const nailGeo = new THREE.ConeGeometry(0.014, 0.035, 8);
  nailGeo.rotateX(Math.PI / 2);
  for (const s of [-1, 1]) {
    const lp = new THREE.Group();
    lp.position.set(s * 0.15, 0.36, 0.05);
    bodyPivot.add(lp);
    const thigh = add(lp, thighGeo, fluff); // fluffy "trousers" over the top of the leg
    thigh.position.y = 0.03;
    fur(thigh, 0.075, 0.05, 1, 1, Math.ceil(layers * 0.4), 0.4, 0.4);
    const shank = add(lp, shankGeo, legMat);
    shank.position.y = -0.2;
    const foot = new THREE.Group();
    foot.position.y = -0.345;
    lp.add(foot);
    for (const a of [-0.45, 0, 0.45]) {
      const toe = add(foot, toeGeo, legMat);
      toe.rotation.y = a + s * 0.06;
      const nail = add(toe, nailGeo, beakMat, false);
      nail.position.z = 0.185;
    }
    const back = add(foot, toeGeo, legMat);
    back.rotation.y = Math.PI;
    back.scale.set(1, 1, 0.45);
    legs.push({ pivot: lp, side: s });
  }

  let walkPhase = 0;
  const pose = createPose();

  function apply(p = pose, time = 0, dt = 0) {
    walkPhase += dt * 12 * p.walk;
    const bob = Math.abs(Math.sin(walkPhase)) * 0.04 * p.walk;
    const breathe = Math.sin(time * 3.6) * 0.01;

    bodyPivot.position.y = p.hop + bob - p.sit * 0.2 - p.lie * 0.24;
    bodyPivot.rotation.x = p.lean + p.tuck * 0.35;
    bodyPivot.rotation.z = p.lie * 1.25 + Math.sin(time * 38) * p.shake * 0.12;
    const sq = p.squash;
    bodyPivot.scale.set(1 + sq * 0.12, 1 - sq * 0.16 - p.sit * 0.12, 1 + sq * 0.12);
    bodyScaler.scale.set(1 + breathe, 1 - breathe * 0.5, 1 + breathe);

    headPivot.rotation.set(
      p.headPitch + p.tuck * 0.9 - p.lie * 0.3,
      p.headYaw + Math.sin(time * 41) * p.shake * 0.35,
      p.headRoll + Math.sin(walkPhase) * 0.05 * p.walk - p.lie * 0.6
    );
    headPivot.scale.setScalar(1 + p.bigHead * 0.5);
    headPivot.position.set(0, 1.08 - p.bigHead * 0.06 - p.tuck * 0.12, 0.31 - p.tuck * 0.1);

    const open = Math.max(0.1, 1 - p.blink);
    for (const e of eyes) e.scale.set(1 + p.bigHead * 0.4, open * (1 + p.bigHead * 0.4), 1);

    lowerPivot.rotation.x = p.beak * 0.5;

    for (const w of wings) {
      const flap = Math.sin(time * 26) * p.flap * 0.45;
      w.pivot.rotation.z = w.side * (0.04 + p.wing * 1.2 + flap + p.lie * 0.2);
      w.pivot.rotation.x = -p.wing * 0.3;
    }
    for (const l of legs) {
      const swing = Math.sin(walkPhase + (l.side > 0 ? Math.PI : 0)) * 0.5 * p.walk;
      l.pivot.rotation.x = swing - p.tuck * 1.4 - p.sit * 1.25 - p.lie * 0.9;
      l.pivot.rotation.z = l.side * p.lie * 0.4;
      l.pivot.visible = p.tuck < 0.98;
    }
  }
  apply();

  /** color, fur (0..1 how long the down is), opacity (dissolve), wet (0..1 just hatched) */
  const tmp = new THREE.Color();
  function setLook({ color: c = baseColor, fur: furAmount = 1, opacity = 1, wet = 0 } = {}) {
    tmp.copy(c).lerp(wetColor, wet * 0.6);
    fluff.color.copy(rootColor).lerp(wetColor, wet * 0.5);
    fluff.roughness = 0.95 - wet * 0.45; // wet down is darker and a little glossy
    for (const m of [fluff, beakMat, toothMat, legMat, eyeMat, lidMat]) m.opacity = opacity;
    // wet down sticks together in thin clumps; dry down is long and fluffy
    const amount = furAmount * opacity * (1 - wet * 0.3);
    setFurLength((0.5 + 0.5 * (1 - wet)) * Math.max(0.35, furAmount));
    for (const m of furLayers) {
      m.alphaTest = Math.min(1.01, m.userData.base + (1 - amount) * 0.75);
      shellColor(m.userData.f, m.color, tmp);
      if (wet > 0) m.color.lerp(tmp, wet * 0.65);
    }
  }
  setLook();

  return {
    root, bodyPivot, headPivot, head, body, meshes, pose, apply, setLook, setFurDensity, baseColor,
    mats: { fluff, beakMat, legMat, eyeMat },
    parts: { beakUpper, beakLower, eyes, wings, legs, tufts, tooth },
  };
}
