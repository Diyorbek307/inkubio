import * as THREE from 'three';
import { createChick, createPose } from './chick.js';
import { createStudioEnvironment } from './studio.js';
import { chirp } from './sound.js';
import { bump, clamp, lerp } from './util.js';

/*
 A small live chick next to the company name on the final screen.
 Its own little renderer with a transparent background, created only when the
 visitor gets close to the end of the page, and paused when it is off screen.
*/
export function createFinale(holder, { layers = 12 } = {}) {
  const canvas = document.createElement('canvas');
  holder.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.debug.checkShaderErrors = false; // slow shader-log reads on Intel graphics
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.environment = createStudioEnvironment(renderer);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0.3, 1.25, 5.2);
  const tgt = new THREE.Vector3(0, 0.78, 0);

  scene.add(new THREE.HemisphereLight('#fff6e8', '#2a1d12', 0.55));
  const key = new THREE.DirectionalLight('#fff1dc', 2.3);
  key.position.set(3, 5, 4);
  const rim = new THREE.DirectionalLight('#ffc27a', 2.2);
  rim.position.set(-4, 3, -4);
  scene.add(key, rim);

  // warm glow and a soft pedestal shadow
  const radial = (stops) => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radial([[0, 'rgba(255,190,90,0.5)'], [0.5, 'rgba(255,160,60,0.12)'], [1, 'rgba(0,0,0,0)']]),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  glow.scale.set(3.4, 3.4, 1);
  glow.position.set(0, 1, -1.5);
  scene.add(glow);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.8),
    new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(0,0,0,0.7)'], [0.55, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  scene.add(shadow);

  const chick = createChick({ seed: 7, layers });
  scene.add(chick.root);
  chick.root.rotation.y = -0.35;
  const pose = createPose();

  // pointer → where the chick looks
  const ndc = new THREE.Vector2();
  const look = { x: 0, y: 0, last: -10 };
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.6);
  const hit = new THREE.Vector3();
  const headW = new THREE.Vector3();
  let time = 0;
  let hopAt = -10;
  addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    look.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    look.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    look.last = time;
  }, { passive: true });
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.intersectObjects(chick.meshes, false).length) {
      hopAt = time;
      chirp();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    raycaster.setFromCamera(ndc, camera);
    canvas.style.cursor = raycaster.intersectObjects(chick.meshes, false).length ? 'pointer' : '';
  });

  function resize() {
    const w = holder.clientWidth, h = holder.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  let visible = false;
  new IntersectionObserver((en) => (visible = en[0].isIntersecting), { threshold: 0.05 }).observe(holder);

  const clock = new THREE.Clock();
  let compiled = false;
  renderer.compileAsync(scene, camera).catch(() => {}).then(() => (compiled = true));
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (compiled && visible && !document.hidden) {
      time += dt;
      Object.assign(pose, createPose());
      const t = time % 9;
      pose.blink = Math.max(bump(t, 1.2, 0.12), bump(t, 4.6, 0.12), bump(t, 7.4, 0.12));
      pose.headYaw = Math.sin(time * 0.6) * 0.35;
      pose.headPitch = Math.sin(time * 0.45) * 0.08;
      if (t > 5.4 && t < 6.6) {
        const k = Math.pow(Math.sin(Math.PI * ((t - 5.4) / 0.6)), 2);
        pose.lean = k * 0.5;
        pose.headPitch += k * 0.5;
      }
      pose.wing = bump(t, 8.2, 0.35) * 0.9;
      pose.flap = bump(t, 8.2, 0.3);
      // look at the cursor
      if (time - look.last < 3) {
        ndc.set(clamp(look.x, -1.5, 1.5), clamp(look.y, -1.5, 1.5));
        raycaster.setFromCamera(ndc, camera);
        if (raycaster.ray.intersectPlane(plane, hit)) {
          chick.headPivot.getWorldPosition(headW);
          const dx = hit.x - headW.x, dy = hit.y - headW.y - 0.2, dz = hit.z - headW.z;
          let yaw = Math.atan2(dx, dz) - chick.root.rotation.y;
          yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
          pose.headYaw = clamp(yaw, -1, 1);
          pose.headPitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.6, 0.5);
        }
      }
      const since = time - hopAt;
      if (since < 0.5) {
        pose.hop = Math.sin(Math.PI * (since / 0.5)) * 0.35;
        pose.wing = Math.max(pose.wing, Math.sin(Math.PI * (since / 0.5)) * 0.8);
        pose.flap = 1;
        pose.beak = bump(since, 0.15, 0.1);
      }
      chick.apply(pose, time, dt);
      shadow.scale.setScalar(lerp(1, 0.75, pose.hop / 0.35));
      camera.position.x = 0.3 + Math.sin(time * 0.2) * 0.15;
      camera.lookAt(tgt);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
