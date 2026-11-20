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
    const N = 255;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d');
    const img = x.createImageData(N, N);
    // tufts of down: each 3x3 texel clump is one strand, thinner towards its tip
    for (let y = 0; y < N; y += 3) {
      for (let x0 = 0; x0 < N; x0 += 3) {
        const v = Math.pow(Math.random(), 0.7) * 255;
        for (let dy = 0; dy < 3; dy++) {
          for (let dx = 0; dx < 3; dx++) {
            if (y + dy >= N || x0 + dx >= N) continue;
            const edge = dx === 1 && dy === 1 ? 1 : 0.82;
            const i = (y + dy) * N + x0 + dx;
            img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v * edge;
            img.data[i * 4 + 3] = 255;
          }
        }
      }
    }
    x.putImageData(img, 0, 0);
    furImage = c;
  }
  const t = new THREE.CanvasTexture(furImage);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  // no mip-maps: averaging would turn the strands into a solid surface
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
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

export function createChick({ color = '#f4bb26', seed = 1, layers = 16 } = {}) {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const baseColor = new THREE.Color(color);
  const tipColor = new THREE.Color('#ffe47a');
  const wetColor = new THREE.Color('#cfa443');
  const fluff = std({
    color: baseColor, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color('#fff0b0'), sheenRoughness: 0.55,
    clearcoat: 0, clearcoatRoughness: 0.3, envMapIntensity: 0.5, alphaHash: true,
  });
  const beakMat = std({ color: '#e6c29a', roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.35, envMapIntensity: 0.7, alphaHash: true });
  const toothMat = new THREE.MeshStandardMaterial({ color: '#f6f1e6', roughness: 0.5, alphaHash: true });
  const legMat = std({ color: '#f0ab6c', roughness: 0.5, clearcoat: 0.25, envMapIntensity: 0.6, alphaHash: true });
  const eyeMat = std({ color: '#0e0907', roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8, alphaHash: true });
  const lidMat = new THREE.MeshStandardMaterial({ color: '#5a4426', roughness: 0.8, alphaHash: true });

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
  function fur(mesh, radius, length, rx, ry, n = layers, droop = 0.25) {
    const tex = furTexture(rx, ry);
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      // down is matte: a cheap Lambert material is enough and keeps the many layers fast
      const m = new THREE.MeshLambertMaterial({
        color: baseColor.clone().lerp(tipColor, 0.05 + f * 0.75),
        alphaMap: tex, alphaTest: 0.32 + f * 0.62,
      });
      m.userData = { base: m.alphaTest, f };
      const shell = new THREE.Mesh(mesh.geometry, m);
      shell.userData = { f, len: length, radius, droop, i, n };
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
      const { f, len, radius, droop } = s.userData;
      s.scale.setScalar(1 + (f * len * k) / radius);
      s.position.y = -f * len * k * droop * (0.04 / radius); // down settles slightly downwards
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
  fur(body, 0.5, 0.095, 4, 2);

  // rump and tail down
  const rump = add(bodyTilt, new THREE.SphereGeometry(0.2, 32, 20), fluff);
  rump.position.set(0, 0.08, -0.5);
  rump.scale.set(1, 0.85, 0.9);
  fur(rump, 0.2, 0.07, 1.5, 1, Math.ceil(layers * 0.6));

  // neck and chest blend
  const neck = add(bodyScaler, new THREE.SphereGeometry(0.27, 40, 28), fluff);
  neck.position.set(0, 1.02, 0.28);
  neck.scale.set(0.95, 1, 1);
  fur(neck, 0.27, 0.08, 2, 1, Math.ceil(layers * 0.8));

  /* head */
  const headPivot = new THREE.Group();
  headPivot.rotation.order = 'YXZ';
  bodyPivot.add(headPivot);
  const head = add(headPivot, new THREE.SphereGeometry(0.3, 56, 40), fluff);
  head.position.set(0, 0.17, 0.05);
  head.scale.set(0.95, 0.97, 1.05);
  fur(head, 0.3, 0.032, 3, 1.5, Math.ceil(layers * 0.8), 0.1);

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
    const glint = add(eye, new THREE.SphereGeometry(0.013, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', alphaHash: true }), false);
    glint.position.set(0.018, 0.022, 0.04);
    eyes.push(eye);
  }
  const tufts = [];

  /* wings: small and stubby */
  const wings = [];
  const wingGeo = new THREE.SphereGeometry(1, 36, 24);
  for (const s of [-1, 1]) {
    const wp = new THREE.Group();
    wp.position.set(s * 0.4, 0.88, 0.12);
    bodyPivot.add(wp);
    const w = add(wp, wingGeo, fluff);
    w.scale.set(0.075, 0.17, 0.26);
    w.position.set(s * 0.02, -0.11, -0.12);
    w.rotation.set(0.45, s * 0.1, s * -0.12);
    fur(w, 1, 0.3, 1, 0.5, Math.ceil(layers * 0.5));
    wings.push({ pivot: wp, side: s });
  }

  /* legs: long, thin, four toes */
  const legs = [];
  const thighGeo = new THREE.CapsuleGeometry(0.05, 0.06, 4, 12);
  const shankGeo = new THREE.CapsuleGeometry(0.034, 0.22, 4, 12);
  const toeGeo = new THREE.CapsuleGeometry(0.019, 0.15, 4, 8);
  toeGeo.rotateX(Math.PI / 2);
  toeGeo.translate(0, 0, 0.085);
  const nailGeo = new THREE.ConeGeometry(0.014, 0.035, 8);
  nailGeo.rotateX(Math.PI / 2);
  for (const s of [-1, 1]) {
    const lp = new THREE.Group();
    lp.position.set(s * 0.15, 0.36, 0.05);
    bodyPivot.add(lp);
    add(lp, thighGeo, fluff);
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
    fluff.color.copy(tmp);
    fluff.roughness = 0.9 - wet * 0.35;
    fluff.clearcoat = wet * 0.35;
    fluff.sheen = 1 - wet * 0.7;
    for (const m of [fluff, beakMat, toothMat, legMat, eyeMat, lidMat]) m.opacity = opacity;
    // wet down sticks together in thin clumps; dry down is long and fluffy
    const amount = furAmount * opacity * (1 - wet * 0.3);
    setFurLength((0.5 + 0.5 * (1 - wet)) * Math.max(0.35, furAmount));
    for (const m of furLayers) {
      m.alphaTest = Math.min(1.01, m.userData.base + (1 - amount) * 0.75);
      m.color.copy(tmp).lerp(tipColor, (0.05 + m.userData.f * 0.75) * (1 - wet * 0.65));
    }
  }
  setLook();

  return {
    root, bodyPivot, headPivot, head, body, meshes, pose, apply, setLook, setFurDensity, baseColor,
    mats: { fluff, beakMat, legMat, eyeMat },
    parts: { beakUpper, beakLower, eyes, wings, legs, tufts, tooth },
  };
}
