import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createStudioEnvironment, FilmShader } from './studio.js';

import { clamp, lerp, range, sr, kf, kfv, bump, easeOut, easeIn, easeInOut, rng } from './util.js';
import { createEgg } from './egg.js';
import { createEmbryo } from './embryo.js';
import { createChick, createPose } from './chick.js';
import { createIncubator } from './incubator.js';
import { createLine, LINE_Z } from './line.js';
import { unlockAudio, chirp, crackSound, setSound, soundOn, setAmbient, startMusic, stopMusic } from './sound.js';
import { SITE } from './config.js';

// canvas textures (brand plate, truck, screen) need the brand fonts to be ready
const fontT0 = performance.now();
await Promise.race([document.fonts.load('800 92px Unbounded'), document.fonts.load('700 34px Manrope'), new Promise((r) => setTimeout(r, 1200))]).catch(() => {});
window.__fontWait = Math.round(performance.now() - fontT0);

/* ------------------------------------------------------------------ */
/* Timeline (in "vh" units of scroll)                                  */
/* ------------------------------------------------------------------ */
const T = {
  intro: 0, metrics: 120, dip: 300, inc: 300, hatch: 750, flash: 950, alive: 1000, line: 1250, end: 1800,
};
const TOTAL = T.end;
const CHAPTERS = [
  { at: 0, name: 'Чудо' },
  { at: 120, name: 'Климат' },
  { at: 300, name: 'Развитие' },
  { at: 750, name: 'Рождение' },
  { at: 1000, name: 'Знакомство' },
  { at: 1250, name: 'Новый дом' },
  { at: 1800, name: 'О нас' },
];

const $ = (s) => document.querySelector(s);
const say = (s, v) => (window.I18N ? window.I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
const LOCALE = window.I18N?.locale || 'ru-RU';
const LANG = window.I18N?.lang || 'ru';
const $$ = (s) => [...document.querySelectorAll(s)];

/* contacts from js/config.js */
for (const el of $$('[data-site]')) {
  const k = el.dataset.site;
  if (k === 'phone') { el.textContent = SITE.phone; el.href = `tel:${SITE.phoneLink}`; }
  else if (k === 'email') { el.textContent = SITE.email; el.href = `mailto:${SITE.email}`; }
  else if (k === 'telegram') el.href = `https://t.me/${SITE.telegram}`;
  else if (k === 'whatsapp') el.href = `https://wa.me/${SITE.whatsapp}`;
  else if (SITE[k]) el.textContent = say(SITE[k]); // address, hours: a string or { ru, uz, en }
}
// analytics only when a counter is set in the config
function goal(name) {
  try { window.ym?.(Number(SITE.metrika), 'reachGoal', name); } catch { /* analytics is optional */ }
}
if (SITE.metrika) {
  window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
  window.ym.l = Date.now();
  const sc = document.createElement('script');
  sc.async = true;
  sc.src = 'https://mc.yandex.ru/metrika/tag.js';
  document.head.appendChild(sc);
  window.ym(Number(SITE.metrika), 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true });
}
const isTouch = matchMedia('(pointer: coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ */
/* Renderer / scene                                                    */
/* ------------------------------------------------------------------ */
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
// reading shader error logs costs ~40 ms per program on Intel graphics; only in ?debug
renderer.debug.checkShaderErrors = new URLSearchParams(location.search).has('debug');

/* ------------------------------------------------------------------ */
/* Quality tiers: weaker phones get a lighter version of the same story */
/* ------------------------------------------------------------------ */
const QUALITY = {
  high: { dpr: isTouch ? 1.3 : 1.75, samples: isTouch ? 2 : 4, bloom: true, shadows: true, shadowSize: 2048, fur: 1, dust: true, grain: true },
  mid: { dpr: isTouch ? 1.15 : 1.3, samples: isTouch ? 2 : 4, bloom: true, shadows: true, shadowSize: 1024, fur: 0.67, dust: true, grain: true },
  low: { dpr: 1, samples: 2, bloom: false, shadows: false, shadowSize: 512, fur: 0.42, dust: false, grain: false },
};
const TIERS = ['high', 'mid', 'low'];
function detectTier() {
  const forced = new URLSearchParams(location.search).get('q');
  if (QUALITY[forced]) return forced;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4; // not reported by every browser
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch {
    /* unknown GPU */
  }
  const weakGpu = /Mali-(4|T[6-8])|Mali-G(31|51|52|57|68)|Adreno \(TM\) ([2-5]\d\d|6[0-1]\d)|PowerVR|SGX|Intel\(R\) HD Graphics( [2-5]\d\d)?$|SwiftShader|llvmpipe/i.test(gpu);
  // laptop/desktop integrated graphics: UHD/HD hold ~60 fps only on 'low' at 1080p, Iris Xe / Radeon iGPUs on 'mid'
  const basicIgpu = /Intel\(R\) (UHD|HD) Graphics|Intel\(R\) Graphics|Intel HD|Intel UHD/i.test(gpu);
  const goodIgpu = /Iris|Intel\(R\) Arc\(TM\) Graphics|Radeon\(TM\) Graphics|Radeon Vega|Radeon\(TM\) (R\d|Vega)|AMD Radeon Graphics/i.test(gpu);
  if (weakGpu || basicIgpu || mem <= 2 || cores <= 2) return 'low';
  if (goodIgpu) return 'mid';
  if (isTouch && cores >= 8 && (navigator.deviceMemory || 0) >= 6) return 'high'; // flagship phones
  if (isTouch || mem <= 4 || cores <= 4) return 'mid';
  return 'high';
}
let tier = detectTier();
const QFORCED = !!QUALITY[new URLSearchParams(location.search).get("q")]; // ?q= pins the tier (no auto-downgrade)
let Q = QUALITY[tier];
window.__quality = tier;
let DPR = Math.min(window.devicePixelRatio || 1, Q.dpr);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const bg = new THREE.Color('#0a0a0c');
scene.background = bg;
scene.fog = new THREE.Fog(bg.clone(), 60, 220);

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 400);
camera.position.set(0, 1, 9);

const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnv = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
const studioEnv = createStudioEnvironment(renderer);
scene.environment = studioEnv;

const rt = new THREE.WebGLRenderTarget(innerWidth * DPR, innerHeight * DPR, { type: THREE.HalfFloatType, samples: Q.samples });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(DPR);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.25, 0.6, 0.97);
composer.addPass(bloom);
bloom.enabled = Q.bloom;
composer.addPass(new OutputPass());
const film = new ShaderPass(FilmShader);
composer.addPass(film);

/* lights */
const hemi = new THREE.HemisphereLight('#ffffff', '#2a2018', 0.3);
const key = new THREE.DirectionalLight('#fff3e2', 2.4);
const KEY_WARM_A = new THREE.Color('#fff3e2'), KEY_WARM_B = new THREE.Color('#ffd7a0');
key.castShadow = Q.shadows;
key.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
const rim = new THREE.DirectionalLight('#a9cfff', 2.2);
rim.position.set(-5, 4, -6);
const flashLight = new THREE.PointLight('#fff1c4', 0, 14, 1.2);
function raysTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.translate(256, 256);
  const r = rng(77);
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2, w = 0.012 + r() * 0.05, len = 140 + r() * 116;
    const g = x.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    g.addColorStop(0, `rgba(255,236,190,${0.25 + r() * 0.35})`);
    g.addColorStop(1, 'rgba(255,200,120,0)');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(0, 0);
    x.arc(0, 0, len, a - w, a + w);
    x.closePath();
    x.fill();
  }
  const core = x.createRadialGradient(0, 0, 0, 0, 0, 120);
  core.addColorStop(0, 'rgba(255,246,220,0.9)');
  core.addColorStop(0.4, 'rgba(255,214,150,0.35)');
  core.addColorStop(1, 'rgba(255,200,120,0)');
  x.fillStyle = core;
  x.fillRect(-256, -256, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
flashLight.position.set(0, 1.6, 1.2);
scene.add(hemi, key, key.target, rim);

/* soft glow behind subjects */
function radialTexture(stops) {
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
}
const glowMat = new THREE.SpriteMaterial({
  map: radialTexture([[0, 'rgba(255,205,140,0.38)'], [0.45, 'rgba(255,160,80,0.09)'], [1, 'rgba(0,0,0,0)']]),
  blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
});
const glow = new THREE.Sprite(glowMat);
glow.scale.set(11, 11, 1);
glow.position.set(0, 1.1, -3.5);
scene.add(glow);
const raysMat = new THREE.SpriteMaterial({ map: raysTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false });
const rays = new THREE.Sprite(raysMat);
rays.position.set(0, 1.5, 0.15);
scene.add(rays);
let hatchGlow = 0;

/* intro studio: backdrop sweep, glossy floor, contact shadow, floating dust */
const studio = new THREE.Group();
scene.add(studio);
const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 34),
  new THREE.MeshBasicMaterial({
    map: radialTexture([[0, '#24252a'], [0.35, '#141518'], [1, '#060607']]),
    fog: false, depthWrite: false,
  })
);
backdrop.position.set(0, 3, -14);
studio.add(backdrop);
const studioFloor = new THREE.Mesh(
  new THREE.CircleGeometry(14, 64),
  new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(70,66,60,0.55)'], [0.3, 'rgba(40,40,44,0.35)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true, depthWrite: false,
  })
);
studioFloor.rotation.x = -Math.PI / 2;
studioFloor.position.y = -0.9;
studio.add(studioFloor);
const contactMat = new THREE.MeshBasicMaterial({
  map: radialTexture([[0, 'rgba(0,0,0,0.75)'], [0.5, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]),
  transparent: true, depthWrite: false,
});
const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), contactMat);
contact.rotation.x = -Math.PI / 2;
contact.position.y = -0.89;
studio.add(contact);

const dustN = 420;
const dustPos = new Float32Array(dustN * 3);
const dustSeed = [];
{
  const r = rng(33);
  for (let i = 0; i < dustN; i++) dustSeed.push([(r() - 0.5) * 9, r() * 5 - 0.8, (r() - 0.5) * 7 - 1, r() * 10, 0.03 + r() * 0.08]);
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dustMat = new THREE.PointsMaterial({
  size: 0.022, color: '#ffe9cc', transparent: true, opacity: 0.5, depthWrite: false,
  blending: THREE.AdditiveBlending, map: radialTexture([[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]),
});
const dust = new THREE.Points(dustGeo, dustMat);
scene.add(dust);
function updateDust(time) {
  for (let i = 0; i < dustN; i++) {
    const [x, y, z, ph, sp] = dustSeed[i];
    dustPos[i * 3] = x + Math.sin(time * 0.13 + ph) * 0.35;
    dustPos[i * 3 + 1] = -0.8 + ((y + 0.8 + time * sp) % 5);
    dustPos[i * 3 + 2] = z + Math.cos(time * 0.11 + ph * 1.3) * 0.35;
  }
  dustGeo.attributes.position.needsUpdate = true;
}

/* ------------------------------------------------------------------ */
/* Objects                                                             */
/* ------------------------------------------------------------------ */
const hero = createChick({ seed: 2, layers: Math.max(6, Math.round(18 * Q.fur)) });
scene.add(hero.root);

const egg = createEgg();
scene.add(egg.pivot, egg.candle);
const embryo = createEmbryo(hero);
egg.group.add(embryo.group);


const incubator = createIncubator();
scene.add(incubator.group, incubator.lightGroup);

// chicks on the line are small on screen: a few down layers are enough (each layer is a draw call per body part)
const line = createLine({ chickLayers: Math.max(3, Math.round(5 * Q.fur)) });
scene.add(line.group);

// floor for the "meeting" scene
const discMat = new THREE.MeshStandardMaterial({
  color: '#3a2a1b', roughness: 0.92, transparent: true,
  alphaMap: radialTexture([[0, '#fff'], [0.55, '#fff'], [1, '#000']]),
});
const disc = new THREE.Mesh(new THREE.CircleGeometry(7, 64), discMat);
disc.rotation.x = -Math.PI / 2;
disc.receiveShadow = true;
scene.add(disc);

// a big golden egg of light behind the chick in its shell — the warm "sunrise" of the meeting scene
const haloMat = (() => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 320;
  const x = c.getContext('2d');
  x.translate(128, 172);
  x.scale(1, 1.22);
  const g = x.createRadialGradient(0, 8, 0, 0, 0, 126);
  g.addColorStop(0, 'rgba(255,232,150,1)');
  g.addColorStop(0.5, 'rgba(255,204,92,0.75)');
  g.addColorStop(0.78, 'rgba(255,178,60,0.28)');
  g.addColorStop(1, 'rgba(255,160,40,0)');
  x.fillStyle = g;
  x.beginPath();
  // egg outline: narrower at the top
  x.moveTo(0, -128);
  x.bezierCurveTo(78, -128, 118, -30, 118, 30);
  x.bezierCurveTo(118, 92, 66, 126, 0, 126);
  x.bezierCurveTo(-66, 126, -118, 92, -118, 30);
  x.bezierCurveTo(-118, -30, -78, -128, 0, -128);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: t, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false });
})();
const halo = new THREE.Sprite(haloMat);
halo.scale.set(3.5, 4.4, 1);
halo.position.set(0, 1.5, -1.9);
scene.add(halo);

// straw on the floor around the shell
const straw = (() => {
  const n = 900;
  const geo = new THREE.CylinderGeometry(0.007, 0.007, 1, 4);
  geo.rotateZ(Math.PI / 2); // lying along x
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, transparent: true, opacity: 0 });
  const m = new THREE.InstancedMesh(geo, mat, n);
  const r = rng(31);
  const o = new THREE.Object3D();
  const cols = ['#d6a955', '#b98a3e', '#e8c579', '#a77a35', '#c79a4c'].map((c) => new THREE.Color(c));
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = 0.55 + Math.pow(r(), 0.7) * 2.9;
    o.position.set(Math.cos(a) * d, 0.012 + r() * 0.03, Math.sin(a) * d * 0.8 + 0.2);
    o.rotation.set(0, r() * Math.PI, (r() - 0.5) * 0.12);
    o.scale.set(0.12 + r() * 0.3, 1, 1);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    m.setColorAt(i, cols[Math.floor(r() * cols.length)]);
  }
  m.receiveShadow = true;
  return m;
})();
scene.add(straw);

// climate FX around the egg
const fx = new THREE.Group();
scene.add(fx);
const ringMats = [];
[['#ff9a3c', 1.45, 0.25], ['#5cc8ff', 1.7, -0.35], ['#d6f6ff', 1.95, 0.1]].forEach(([col, r, tilt], i) => {
  const m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 8, 200), m);
  ring.rotation.x = Math.PI / 2 + tilt;
  ring.position.y = 1;
  ring.userData.spin = 0.2 + i * 0.12;
  fx.add(ring);
  ringMats.push(m);
});
const dropsN = 220;
const dropsPos = new Float32Array(dropsN * 3);
const dropsSeed = [];
const rr = rng(9);
for (let i = 0; i < dropsN; i++) {
  const a = rr() * Math.PI * 2, rad = 1.1 + rr() * 1.4;
  dropsSeed.push([a, rad, rr() * 3, 0.15 + rr() * 0.35]);
}
const dropsGeo = new THREE.BufferGeometry();
dropsGeo.setAttribute('position', new THREE.BufferAttribute(dropsPos, 3));
const dropsMat = new THREE.PointsMaterial({
  size: 0.045, color: '#9fdcff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  map: radialTexture([[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]),
});
fx.add(new THREE.Points(dropsGeo, dropsMat));
const airMats = [];
for (let k = 0; k < 4; k++) {
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2.6;
    const rad = 1.25 + Math.sin(i * 0.12 + k) * 0.12 + k * 0.08;
    pts.push(new THREE.Vector3(Math.cos(a) * rad, 0.1 + (i / 120) * 1.9, Math.sin(a) * rad));
  }
  const m = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m);
  l.rotation.y = k * 1.6;
  l.userData.spin = 0.6 + k * 0.15;
  fx.add(l);
  airMats.push(m);
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */
const pointer = { nx: 0, ny: 0, x: 0, y: 0, last: -100, has: false };
const clock = new THREE.Clock();
let now = 0;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let extraHop = -10;
let bubbleUntil = 0;

addEventListener('pointermove', (e) => {
  pointer.nx = (e.clientX / innerWidth) * 2 - 1;
  pointer.ny = -((e.clientY / innerHeight) * 2 - 1);
  pointer.last = now;
  pointer.has = true;
}, { passive: true });

function heroHit(clientX, clientY) {
  if (!hero.root.visible) return false;
  ndc.set((clientX / innerWidth) * 2 - 1, -((clientY / innerHeight) * 2 - 1));
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(hero.meshes, false).length > 0;
}

addEventListener('pointerdown', (e) => {
  touched = true;
  unlockAudio();
  pointer.nx = (e.clientX / innerWidth) * 2 - 1;
  pointer.ny = -((e.clientY / innerHeight) * 2 - 1);
  pointer.last = now;
  pointer.has = true;
  if (e.target.closest('a,button,input,select,textarea,label,dialog')) return;
  const inMeet = tCur > T.alive - 60 && tCur < T.line + 40;
  if (inMeet && (heroHit(e.clientX, e.clientY) || isTouch)) {
    extraHop = now;
    sayPeep();
  }
}, { passive: true });
addEventListener('keydown', unlockAudio);

canvas.addEventListener('pointermove', (e) => {
  canvas.style.cursor = heroHit(e.clientX, e.clientY) ? 'pointer' : '';
});

let touched = false;
function buzz(ms) {
  if (touched && isTouch && navigator.vibrate) navigator.vibrate(ms);
}
function sayPeep() {
  buzz(18);
  chirp();
  bubbleUntil = now + 1.1;
}

const soundBtn = $('#soundBtn');
function syncSoundBtn() {
  soundBtn.classList.toggle('off', !soundOn());
  soundBtn.setAttribute('aria-pressed', String(soundOn()));
  soundBtn.querySelector('.label').textContent = soundOn() ? say('Звук') : say('Без звука');
}
soundBtn.addEventListener('click', () => {
  unlockAudio();
  setSound(!soundOn());
  syncSoundBtn();
  try { localStorage.setItem('inkubio-mute', soundOn() ? '0' : '1'); } catch { /* storage off */ }
  if (soundOn()) chirp(0.08);
});
// sound is on by default (a visitor who muted it once stays muted); browsers only let it play after
// the first click, tap or key, so the button pulses gently until then
try { if (localStorage.getItem('inkubio-mute') === '1') setSound(false); } catch { /* storage off */ }
syncSoundBtn();
if (soundOn()) {
  soundBtn.classList.add('waiting');
  const firstTouch = () => {
    soundBtn.classList.remove('waiting');
    removeEventListener('pointerdown', firstTouch, true);
    removeEventListener('keydown', firstTouch, true);
  };
  addEventListener('pointerdown', firstTouch, true);
  addEventListener('keydown', firstTouch, true);
}

/* ------------------------------------------------------------------ */
/* Scroll                                                              */
/* ------------------------------------------------------------------ */
const track = $('#track');
track.style.height = `${TOTAL + 100}vh`;
let vh = Math.max(1, innerHeight / 100);
let tCur = 0;
const scrollT = () => window.scrollY / vh;

// rail
const rail = $('#rail');
CHAPTERS.forEach((c, i) => {
  const b = document.createElement('button');
  b.className = 'rail-dot';
  b.type = 'button';
  b.innerHTML = `<span>${say(c.name)}</span>`;
  b.setAttribute('aria-label', say(c.name));
  b.addEventListener('click', () => {
    const at = i === CHAPTERS.length - 1 ? TOTAL + 100 : c.at + (i === 0 ? 0 : 30);
    window.scrollTo({ top: at * vh, behavior: 'smooth' });
  });
  rail.appendChild(b);
});
const railDots = $$('.rail-dot');
const railFill = $('#railFill');

/* text overlays with data-show="a,b,c,d" (fade in a→b, out c→d) */
// headlines reveal word by word
$$('.stage .display, .stage .h2').forEach((h) => {
  const text = h.textContent.trim();
  h.setAttribute('aria-label', text);
  const escH = (x) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  h.innerHTML = text.split(/ +/).map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${escH(w)}</span></span>`).join(' ');
});
const bigwords = $$('.bigword').map((el) => ({ el, r: el.dataset.slide.split(',').map(Number), w: 0 }));
const measureWords = () => bigwords.forEach((b) => (b.w = b.el.scrollWidth));
addEventListener('resize', measureWords);
document.fonts?.ready?.then(measureWords);
measureWords();
const shows = $$('[data-show]').map((el) => ({ el, k: el.dataset.show.split(',').map(Number), on: false }));

/* ------------------------------------------------------------------ */
/* HUD elements                                                        */
/* ------------------------------------------------------------------ */
const hud = {
  cards: $$('.metric').map((el) => ({ el, anchor: new THREE.Vector3(...el.dataset.anchor.split(',').map(Number)), tip: new THREE.Vector3(...el.dataset.tip.split(',').map(Number)) })),
  lines: $('#hudLines'),
  temp: $('#tempVal'),
  hum: $('#humVal'),
  humBar: $('#humBar'),
  turn: $('#turnVal'),
  turnIcon: $('#turnIcon'),
  day: $('#dayNum'),
  dayStage: $('#dayStage'),
  dayDesc: $('#dayDesc'),
  dayBar: $('#dayBar'),
  dayMarks: $$('.day-marks span'),
  bubble: $('#bubble'),
  gate: $('#gateLabel'),
  gateId: $('#gateId'),
  gateW: $('#gateW'),
  scanCount: $('#scanCount'),
  packCount: $('#packCount'),
  lineSteps: $$('.line-steps li'),
  dip: $('#dip'),
  flash: $('#flash'),
  hint: $('#hint'),
};
hud.hint.textContent = isTouch ? say('Коснитесь цыплёнка') : say('Наведите курсор — цыплёнок посмотрит на вас');
const STAGES = [
  [1, 'Формирование эмбриона', 'На поверхности желтка появляется зародыш. Уже на 2-й день начинает биться сердце.'],
  [4, 'Развитие кровеносной системы', 'От зародыша по желтку и оболочке расходятся сосуды — они приносят ему питание и кислород.'],
  [10, 'Формирование клюва и лапок', 'Зародыш становится похож на птенца: появляются клюв, лапки и первый пух.'],
  [15, 'Рост будущего цыплёнка', 'Цыплёнок занимает почти всё яйцо, а остаток желтка уходит к нему в животик.'],
];
const gateWeights = Array.from({ length: 8 }, (_, i) => (39 + rng(i + 50)() * 5).toFixed(1).replace('.', ','));

const v3 = new THREE.Vector3();
function toScreen(v, out = {}) {
  v3.copy(v).project(camera);
  out.x = (v3.x * 0.5 + 0.5) * innerWidth;
  out.y = (-v3.y * 0.5 + 0.5) * innerHeight;
  out.behind = v3.z > 1;
  return out;
}

/* ------------------------------------------------------------------ */
/* Chick behaviour (scene 5)                                           */
/* ------------------------------------------------------------------ */
const ROUTINE = 16;
function routine(t, p) {
  t = ((t % ROUTINE) + ROUTINE) % ROUTINE;
  p.blink = Math.max(bump(t, 0.35, 0.12), bump(t, 0.75, 0.12), bump(t, 3.95, 0.12), bump(t, 9.3, 0.12), bump(t, 13.0, 0.12), bump(t, 15.2, 0.12));
  p.headYaw = kf(t, [[0, 0], [1.1, 0], [1.5, -0.75], [2.3, -0.75], [2.8, 0.75], [3.5, 0.75], [3.9, 0], [16, 0]]);
  p.headRoll = kf(t, [[3.9, 0], [4.1, 0.22], [4.4, 0]]);
  p.headPitch = kf(t, [[0, 0], [3.9, 0], [4.1, -0.12], [4.4, 0]]);
  p.hop = 0; p.squash = 0; p.lean = 0;
  if (t > 4.6 && t < 6.4) {
    const f = ((t - 4.6) / 0.6) % 1;
    p.hop = Math.sin(Math.PI * clamp((f - 0.15) / 0.7)) * 0.4;
    p.squash = f < 0.15 ? Math.sin((f / 0.15) * Math.PI) * 0.6 : f > 0.85 ? Math.sin(((f - 0.85) / 0.15) * Math.PI) * 0.5 : -0.12;
  }
  if (t > 6.7 && t < 8.5) {
    const f = ((t - 6.7) / 0.6) % 1;
    const k = Math.pow(Math.sin(Math.PI * f), 2);
    p.lean = k * 0.55;
    p.headPitch += k * 0.55;
  }
  p.wing = kf(t, [[8.7, 0], [9.0, 1], [10.0, 1], [10.3, 0]]);
  p.flap = kf(t, [[8.9, 0], [9.05, 1], [9.85, 1], [10.0, 0]]);
  const Z = [[10.5, 0], [11.9, 0.95], [12.6, 0.95], [14.0, 0]];
  p.z = kf(t, Z);
  p.walk = clamp(Math.abs(kf(t + 0.05, Z) - kf(t - 0.05, Z)) * 14);
  // walk towards the viewer, turn round, walk back, turn to face the viewer again
  p.bodyYaw = kf(t, [[11.9, 0], [12.5, Math.PI], [14.0, Math.PI], [14.4, Math.PI * 2]]);
  p.beak = Math.max(bump(t, 14.6, 0.07), bump(t, 14.78, 0.07));
  return t;
}
const rPose = Object.assign(createPose(), { z: 0, bodyYaw: 0 });
const aboutEl = $('#about');
const headerEl = $('.top');
const msgrEl = $('#msgr');
const counterEl = $('#counter');
let lastChapter = -1;
let routineStart = 0;
let lastRoutineT = 0;
let wasInMeet = false;

const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.4);
const hitP = new THREE.Vector3();
const headW = new THREE.Vector3();
function lookAtPointer(p, influence) {
  if (influence <= 0.001) return;
  ndc.set(pointer.x, pointer.y);
  raycaster.setFromCamera(ndc, camera);
  if (!raycaster.ray.intersectPlane(plane, hitP)) return;
  hero.headPivot.getWorldPosition(headW);
  const dx = hitP.x - headW.x, dy = hitP.y - headW.y - 0.25, dz = hitP.z - headW.z;
  let yaw = Math.atan2(dx, dz) - hero.root.rotation.y;
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  const pitch = -Math.atan2(dy, Math.hypot(dx, dz));
  p.headYaw = lerp(p.headYaw, clamp(yaw, -1.0, 1.0), influence);
  p.headPitch = lerp(p.headPitch, clamp(pitch, -0.6, 0.5), influence);
  p.headRoll = lerp(p.headRoll, -clamp(yaw, -1, 1) * 0.12, influence);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const cA = new THREE.Color(), cB = new THREE.Color();
function colorAt(t, keys, out) {
  if (t <= keys[0][0]) return out.set(keys[0][1]);
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      cA.set(keys[i - 1][1]);
      cB.set(keys[i][1]);
      return out.copy(cA).lerp(cB, (t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
    }
  }
  return out.set(keys[keys.length - 1][1]);
}
const OPEN_A = 935, OPEN_B = 985;
// after hatching the chick stands up in the bottom half of its shell (it stays upright), the rim at its belly
const BASE = new THREE.Vector3(0, 0.72, 0);
const MEET_SCALE = 1.2; // a little bigger than at hatching, so it rises well above the rim
// then it jumps out of the shell and lands on the straw in front of it
const LAND = new THREE.Vector3(1.9, 0, 0.7);
const FLOOR_SCALE = 1.05;
const JUMP_A = 1040, JUMP_B = 1064; // scroll range of the jump (inside the meeting chapter)
let landedPeep = false;
const riderPos = new THREE.Vector3();
const riderQ = new THREE.Quaternion();
const riderS = new THREE.Vector3();
const riderM = new THREE.Matrix4(); // hatching: incubator leaves, warm room arrives
const BG = [[0, '#0a0a0c'], [300, '#0a0a0c'], [340, '#070708'], [OPEN_A, '#070708'], [OPEN_B, '#1a120b'], [1250, '#1a120b'], [1340, '#aab3bb'], [1800, '#aab3bb']];
const cam = new THREE.Vector3();
const tgt = new THREE.Vector3();
const tmpA = [];
let lastCrackStep = 0;
let lastPaths = '';
let heroLookEmbryo = false;

/* ------------------------------------------------------------------ */
/* Frame update                                                        */
/* ------------------------------------------------------------------ */
function update(t, time, dt) {
  const aspect = innerWidth / innerHeight;
  const far = aspect < 0.75 ? 1.7 : aspect < 1.1 ? 1.3 : 1;
  // the chick stands in the middle of the scene: on wide screens the camera moves left so it sits right of the text
  const camX = aspect < 0.75 ? 0 : aspect < 1.1 ? -0.7 : -1.5;
  // phones: the text sits at the top, so aim higher and the chick lands lower in the frame
  const meetY = aspect < 0.75 ? 1.55 : 1.3;
  const meetK = aspect < 0.75 ? 1 : 1.45; // wider screens: step back so the chick in its shell fits under the header
  // after the jump: the chick on the straw and the empty shell together
  const PAIR_DX = 1.0, pairY = aspect < 0.75 ? 1.15 : 1.0, pairK = aspect < 0.75 ? 1.4 : 1.05;
  pointer.x += (pointer.nx - pointer.x) * (1 - Math.exp(-dt * 6));
  pointer.y += (pointer.ny - pointer.y) * (1 - Math.exp(-dt * 6));

  const sinceLoad = readyAt === null ? 0 : time - readyAt;
  const intro = reduceMotion ? 1 : easeOut(clamp(sinceLoad / 3.2));

  // --- visibility per chapter
  const inEggIntro = t < T.inc;
  // incubator assembles around the egg, and comes apart after the hatching
  const hatchH = range(t, T.hatch, T.alive);
  const build = t < T.inc ? 0 : t < T.hatch ? range(range(t, T.inc, T.hatch), 0.01, 0.2) : t < T.alive ? 1 - range(hatchH, 0.74, 0.93) : 0;
  const warmIn = sr(t, OPEN_A, OPEN_B); // warm "meeting" room fades in as the incubator leaves
  incubator.group.visible = build > 0.001;
  // quiet background sound: the incubator hums while we are inside it, the hall rumbles on the line
  setAmbient(build * (1 - sr(t, T.inc + 260, T.inc + 330) * 0.4), sr(t, T.line, T.line + 60) * (1 - sr(t, TOTAL - 30, TOTAL + 80)));
  egg.pivot.visible = t < T.line + 60;
  disc.visible = t >= OPEN_A && t < T.line + 60;
  discMat.opacity = warmIn * (1 - sr(t, T.line, T.line + 45));
  straw.visible = disc.visible;
  straw.material.opacity = discMat.opacity;
  halo.visible = t > OPEN_A && t < T.line + 50;
  haloMat.opacity = 0.62 * warmIn * (1 - sr(t, T.line, T.line + 40));
  line.group.visible = t >= T.line;
  fx.visible = t > T.metrics - 10 && t < T.inc;
  hero.root.visible = t >= T.hatch && t < TOTAL + 100;
  glow.visible = t > OPEN_A && t < T.line + 80;
  glowMat.opacity = 0.7 * warmIn;
  studio.visible = t < T.inc + 100;
  studioFloor.material.opacity = 1 - sr(t, T.inc, T.inc + 40);
  dust.visible = Q.dust && (t < T.inc + 80 || (t > OPEN_A && t < T.line + 40));
  if (dust.visible) updateDust(time);
  dustMat.opacity = (t < T.inc + 80 ? 0.55 * intro * (1 - sr(t, T.inc, T.inc + 80)) : 0.35 * warmIn) * (1 - sr(t, T.line, T.line + 40));
  scene.environment = t > T.line + 30 ? roomEnv : studioEnv;
  film.uniforms.time.value = time;
  film.uniforms.vignette.value = kf(t, [[0, 0.6], [1250, 0.6], [1330, 0.42], [TOTAL, 0.42]]);
  film.uniforms.grain.value = Q.grain ? kf(t, [[0, 0.04], [1250, 0.04], [1330, 0.035]]) : 0;

  // --- background / fog / lights
  colorAt(t, BG, bg);
  scene.fog.color.copy(bg);
  // inside the hangar a light haze softens the racks at the back, so the line and the titles stay readable
  scene.fog.near = kf(t, [[T.line, 60], [T.line + 80, 14]]);
  scene.fog.far = kf(t, [[T.line, 220], [T.line + 80, 74]]);
  hemi.intensity = kf(t, [[0, 0.22], [300, 0.22], [360, 0.3], [440, 0.12], [OPEN_A, 0.12], [OPEN_B, 0.45], [1250, 0.45], [1330, 0.3]]);
  key.intensity = kf(t, [[0, 2.1 * intro], [300, 2.1], [360, 1.3], [440, 0.45], [OPEN_A, 0.45], [OPEN_B, 2.4], [1250, 2.4], [1330, 3.1]]);
  // in the hall the main light is warm daylight from the gate and the windows
  key.color.lerpColors(KEY_WARM_A, KEY_WARM_B, sr(t, T.line, T.line + 80));
  rim.intensity = kf(t, [[0, 1.8 * intro], [300, 1.8], [380, 0.4], [OPEN_A, 0.4], [OPEN_B, 1.8], [1250, 1.8], [1330, 1.15]]); // cool skylight from behind
  let bloomS = kf(t, [[0, 0.22], [300, 0.22], [380, 0.3], [OPEN_A, 0.3], [OPEN_B, 0.4], [1250, 0.4], [1330, 0.17]]);
  renderer.toneMappingExposure = kf(t, [[0, 0.95], [300, 0.95], [380, 1.0], [1250, 1.0], [1330, 0.86]]);

  // overlays
  for (const s of shows) {
    const [a, b, c, d] = s.k;
    const o = range(t, a, b) * (1 - range(t, c, d));
    s.el.style.opacity = o.toFixed(3);
    s.el.style.visibility = o > 0.002 ? 'visible' : 'hidden';
    s.el.style.setProperty('--rise', `${(1 - range(t, a, b)) * 28 - range(t, c, d) * 18}px`);
    const on = s.on ? o > 0.02 : o > 0.3;
    const canReveal = readyAt !== null && now - readyAt > 0.5; // let the loader fade first
    if (on !== s.on && (canReveal || !on)) s.el.classList.toggle('in', (s.on = on));
  }
  const aboutTop = aboutEl.getBoundingClientRect().top;
  for (const b of bigwords) {
    const p = range(t, b.r[0], b.r[1]);
    b.el.style.setProperty('--slide', `${lerp(innerWidth * 0.18, innerWidth * 0.82 - b.w, p).toFixed(1)}px`);
  }
  document.body.classList.toggle('light', t > T.line + 50 && aboutTop > 64);
  headerEl.classList.toggle('solid', aboutTop <= 64);
  msgrEl.classList.toggle('show', t > 310 && aboutTop > innerHeight * 0.6); // after the climate scene, whose title sits at the bottom

  // --- egg base state
  const eggState = { mode: 'opaque', crack: 0, peck: 0, burst: 0, push: 0, opacity: 1, glow: 0, bottomFade: 0 };
  egg.pivot.position.set(0, 1, 0);
  egg.pivot.rotation.set(0, 0, 0);
  egg.pivot.scale.setScalar(1);
  embryo.group.visible = false;
  let embryoDrivesHero = false;

  const heroP = hero.pose;
  Object.assign(heroP, createPose());
  hero.root.position.set(0, 0, 0);
  hero.root.rotation.set(0, 0, 0);
  hero.root.scale.setScalar(1);
  let lookInfluence = 0;
  let flash = 0;

  if (inEggIntro) {
    /* 1–2. Egg appears, rotates, climate indicators */
    const m = sr(t, 130, 185);
    const spin = time * 0.42 + t * 0.012;
    egg.pivot.rotation.x = Math.PI;
    egg.pivot.rotation.y = spin;
    egg.pivot.rotation.z = Math.sin(time * 0.7) * 0.55 * m; // automatic turning
    egg.pivot.position.y = 1 + Math.sin(time * 1.1) * 0.05;
    egg.pivot.scale.setScalar(lerp(0.86, 1, intro));
    const lift = egg.pivot.position.y - 1;
    contact.scale.setScalar((1 - lift * 1.6) * lerp(0.86, 1, intro));
    contactMat.opacity = (0.85 - lift * 2.5) * intro;

    const z = lerp(10, 5.8, intro) - sr(t, 0, 110) * 0.3 + m * 2.0;
    cam.set(Math.sin(time * 0.17) * 0.2, 1.05 + m * 0.15, z * far);
    tgt.set(0, lerp(0.55, 1, m), 0);

    // FX
    const fxo = sr(t, 125, 175) * (1 - sr(t, 270, 300));
    ringMats.forEach((mm, i) => (mm.opacity = fxo * (0.55 - i * 0.1)));
    airMats.forEach((mm) => (mm.opacity = fxo * 0.22));
    dropsMat.opacity = fxo * 0.9;
    fx.children.forEach((c) => c.userData.spin && (c.rotation.z = c.type === 'Mesh' ? time * c.userData.spin : c.rotation.z));
    fx.children.forEach((c) => c.type === 'Line' && (c.rotation.y = time * c.userData.spin));
    for (let i = 0; i < dropsN; i++) {
      const [a, rad, off, sp] = dropsSeed[i];
      const y = ((time * sp + off) % 3) - 0.3;
      dropsPos[i * 3] = Math.cos(a + time * 0.1) * rad;
      dropsPos[i * 3 + 1] = y;
      dropsPos[i * 3 + 2] = Math.sin(a + time * 0.1) * rad;
    }
    dropsGeo.attributes.position.needsUpdate = true;

    // HUD numbers
    const temp = lerp(24, 37.5, sr(t, 140, 205)) + (t > 205 ? Math.sin(time * 2) * 0.04 : 0);
    hud.temp.textContent = temp.toFixed(1).replace('.', ',');
    const hum = 55 + 5 * (0.5 + 0.5 * Math.sin(time * 0.6));
    hud.hum.textContent = Math.round(lerp(30, hum, sr(t, 150, 215)));
    hud.humBar.style.transform = `scaleX(${lerp(0.3, hum / 100, sr(t, 150, 215))})`;
    const tilt = (egg.pivot.rotation.z * 180) / Math.PI;
    hud.turn.textContent = `${tilt >= 0 ? '+' : '−'}${Math.abs(Math.round(tilt))}°`;
    hud.turnIcon.style.transform = `rotate(${-tilt}deg)`;
  } else if (t < T.hatch) {
    /* 3. The egg settles into its tray, the incubator builds around it,
          camera pulls out, then flies back in through the window */
    const c = range(t, T.inc, T.hatch);
    const side = innerWidth > 760 ? 1 : 0;
    const R = Math.min(3.7 * far, 4.2);
    const startZ = 7.5 * far; // where the climate scene leaves the camera
    const farZ = 54 * Math.max(1, far * 0.68); // far enough to see the whole 2-metre cabinet
    const farY = side ? 2.6 : 7.4; // on phones the title sits on top, so the cabinet goes lower in the frame
    const settle = sr(c, 0, 0.12);
    contactMat.opacity = 0.85 * (1 - sr(c, 0, 0.06));
    egg.pivot.rotation.x = Math.PI * (1 - sr(c, 0.02, 0.16)); // turns blunt end up as it is set into the tray
    egg.pivot.rotation.y = c < 0.13 ? time * 0.42 + t * 0.012 : 0; // snaps while tiny on screen
    egg.pivot.rotation.z = Math.sin(time * 0.7) * 0.55 * (1 - settle);
    egg.pivot.position.y = 1 + Math.sin(time * 1.1) * 0.05 * (1 - settle);
    if (c < 0.24) {
      const e = easeInOut(range(c, 0, 0.2));
      cam.set(lerp(Math.sin(time * 0.17) * 0.2, -7 * side, e), lerp(1.2, farY + 1, e), lerp(startZ, farZ, e));
      tgt.set(-7 * side * e, lerp(1, farY, e), -e);
    } else if (c < 0.4) {
      const e = easeInOut(range(c, 0.24, 0.4));
      cam.set(lerp(-7 * side, 0, e), lerp(farY + 1, 1.15, e), lerp(farZ, R, e));
      tgt.set(lerp(-7 * side, 0, e), lerp(farY, 1, e), lerp(-1, 0, e));
    } else {
      const a = kf(c, [[0.4, 0], [0.6, -0.45], [0.82, 0.4], [1, 0]]);
      cam.set(Math.sin(a) * R, 1.15, Math.cos(a) * R);
      tgt.set(0, 1, 0);
    }
    const tr = sr(c, 0.38, 0.47);
    const day = kf(c, [[0.45, 1], [0.6, 7], [0.76, 14], [0.92, 18]]);
    if (tr > 0.001) {
      eggState.mode = 'candle';
      eggState.opacity = lerp(1, 0.32, tr);
      eggState.glow = tr;
      embryo.group.visible = true;
      hero.root.visible = embryo.setDay(day, time, heroP);
      embryoDrivesHero = true;
    }
    incubator.update(time, { day: tr > 0 ? day : 1, dim: tr, build, glass: clamp((cam.z - 7) / 9) });

    // day HUD
    const dd = Math.max(1, Math.round(day));
    hud.day.textContent = dd;
    const st = [...STAGES].reverse().find((s) => dd >= s[0]);
    if (hud.dayStage.textContent !== say(st[1])) {
      hud.dayStage.textContent = say(st[1]);
      hud.dayDesc.textContent = say(st[2]);
    }
    hud.dayBar.style.transform = `scaleX(${day / 21})`;
    hud.dayMarks.forEach((m) => m.classList.toggle('on', dd >= Number(m.dataset.d)));
  } else if (t < T.alive) {
    /* 4. Hatching, the way it really happens:
          pip (a small hole) → rest → zipping round the blunt end → cap pushed off →
          head out → the bottom half tips over → the wet chick crawls out, rests,
          stands up on wobbly legs, shakes itself and starts to dry */
    const h = hatchH;
    const back = range(h, 0, 0.06);
    incubator.update(time, { day: 21, dim: 1 - back, build, glass: 0 });
    if (h < 0.06) {
      eggState.mode = 'candle';
      eggState.opacity = lerp(0.32, 1, back);
      eggState.glow = 1 - back;
      if (h < 0.035) {
        embryo.group.visible = true;
        embryo.setDay(18, time, heroP);
        embryoDrivesHero = true;
      }
    } else if (h < 0.56) eggState.mode = 'opaque';
    else eggState.mode = 'broken';
    eggState.crack = kf(h, [[0.08, 0], [0.2, 0.2], [0.32, 0.2], [0.55, 1]]);
    eggState.peck = range(h, 0.19, 0.3);
    eggState.cap = range(h, 0.56, 0.68);
    eggState.tip = 0; // the bottom half stays upright: the chick gets up inside it
    eggState.pipHide = h > 0.74;

    const step = Math.floor(eggState.crack * 14 + eggState.peck * 2 + eggState.cap * 2 + eggState.tip * 2);
    if (step > lastCrackStep) { crackSound(0.05); buzz(8); }
    lastCrackStep = step;

    // rocking: small pecks while zipping, strong pushes before the egg tips over
    const pecking = sr(h, 0.1, 0.14) * (1 - sr(h, 0.55, 0.58));
    const pushing = bump(h, 0.7, 0.04);
    const pattern = Math.pow(Math.max(0, Math.sin(time * 2.6)), 3);
    const wob = (pecking * (0.25 + pattern) * 0.035 + pushing * 0.09) * Math.sin(time * 23);
    egg.pivot.rotation.z = wob;
    egg.pivot.rotation.x = wob * 0.4;

    // the chick
    const wet = 1;
    const inside = new THREE.Vector3(0, 0.38, 0);
    const poke = sr(h, 0.16, 0.2) * (1 - sr(h, 0.3, 0.34)) + sr(h, 0.36, 0.4) * (1 - sr(h, 0.52, 0.56)) * 0.6;
    const rise = sr(h, 0.58, 0.68);   // head comes up through the opening
    const crawl = sr(h, 0.8, 0.88);   // slides out of the tipped shell
    const getUp = sr(h, 0.87, 0.93);  // stands up
    inside.set(0, lerp(0.38 + poke * 0.17, 0.42, rise), poke * 0.25);
    let scale = lerp(0.62, 0.7, rise);
    // ride along with the tipping shell
    egg.update(eggState);
  egg.candle.intensity = Math.max(egg.candle.intensity, hatchGlow * 4.5);
  rays.visible = t > T.hatch && t < T.alive && raysMat.opacity > 0.01;
  hatchGlow = 0;
  if (!rays.visible) raysMat.opacity = 0;
    riderPos.copy(inside).applyMatrix4(egg.riderMatrix());
    riderM.copy(egg.riderMatrix()).decompose(riderS, riderQ, riderS);
    hero.root.position.lerpVectors(riderPos, BASE, sr(h, 0.8, 0.93));
    hero.root.quaternion.copy(riderQ).slerp(new THREE.Quaternion(), getUp);
    hero.root.rotation.y += lerp(0, -0.45, crawl);
    scale = lerp(scale, 0.84, getUp);
    hero.root.scale.setScalar(scale);
    hero.root.position.y += Math.sin(Math.PI * crawl) * 0.06;

    heroP.tuck = lerp(lerp(1, 0.45, poke), 0, rise);
    heroP.lean = -0.35 * heroP.tuck + crawl * (1 - getUp) * 0.5;
    heroP.headPitch = poke * (-0.3 + Math.sin(time * 12) * 0.18) - rise * (1 - crawl) * 0.25;
    heroP.headYaw = rise * (1 - crawl) * Math.sin(time * 1.3) * 0.4;
    heroP.beak = poke * (0.5 + 0.5 * Math.sin(time * 12)) + bump(h, 0.66, 0.02);
    heroP.blink = lerp(0.7, 0.35, rise) + bump(h, 0.95, 0.015) * 0.6;
    heroP.walk = crawl * (1 - getUp) * 0.3; // treads in place, finding its feet
    heroP.sit = (1 - getUp) * rise * 0.5;
    heroP.wing = bump(h, 0.84, 0.03) * 0.6 + bump(h, 0.975, 0.02) * 0.5;
    heroP.flap = bump(h, 0.84, 0.03);
    heroP.shake = bump(h, 0.965, 0.02); // shakes the wet down
    heroP.squash = bump(h, 0.9, 0.025) * 0.35; // wobbly first stand
    hero.setLook({ wet });
    heroLookEmbryo = true; // restore the dry look later

    // camera: close on the egg, then follows the chick out
    const follow = sr(h, 0.74, 0.95);
    kfv(h, [[0, [0, 1.15, 3.7]], [0.2, [0, 1.2, 3.8]], [0.55, [0, 1.25, 4.0]], [0.7, [0, 1.4, 4.15]], [0.92, [0, meetY + 0.45, 5.4 * meetK]]], tmpA);
    const insideCab = 1 - range(1 - build, 0.2, 0.45);
    cam.set(tmpA[0] + follow * camX, tmpA[1], lerp(tmpA[2] * far, Math.min(tmpA[2] * far, 4.25), insideCab));
    kfv(h, [[0, [0, 1, 0]], [0.55, [0, 1.15, 0]], [0.7, [0, 1.15, 0]], [0.92, [0, meetY, 0]]], tmpA);
    tgt.set(tmpA[0] + follow * camX, tmpA[1], tmpA[2] + follow * 0.15);
    const shake = (pecking * pattern + pushing) * 0.008;
    cam.x += Math.sin(time * 31) * shake;
    cam.y += Math.cos(time * 27) * shake;

    flash = bump(h, 0.66, 0.05) * 0.3;
    // warm light leaks through the pip and the zip crack, then bursts out when the cap lifts
    const leak = sr(h, 0.2, 0.3) * 0.25 + sr(h, 0.35, 0.55) * 0.55;
    const burst = bump(h, 0.63, 0.07);
    hatchGlow = (leak * (1 - sr(h, 0.7, 0.8)) + burst * 0.9) * (0.85 + 0.15 * Math.sin(time * 9));
    raysMat.opacity = Math.min(1, leak * 0.3 * (1 - sr(h, 0.62, 0.7)) + burst * 0.55);
    rays.scale.setScalar(2 + burst * 1.4);
    raysMat.rotation = time * 0.12;
  } else {
    /* 5–6. Chick lives → processing line */
    eggState.mode = 'broken';
    eggState.crack = 1;
    eggState.peck = 1;
    eggState.cap = 1;
    eggState.tip = 0;
    eggState.pipHide = true;
    eggState.bottomFade = sr(t, T.line + 8, T.line + 24); // the shell melts away as the line arrives
    // the down dries and fluffs up in the first moments
    const dry = sr(t, T.alive - 10, T.alive + 36); // dry and fluffy before it jumps
    const growUp = sr(t, T.alive - 10, T.alive + 35);

    if (t < T.line) {
      const inMeet = true;
      if (!wasInMeet) routineStart = time;
      wasInMeet = inMeet;
      const w5 = 1 - sr(t, T.line - 25, T.line);
      const rt = routine(time - routineStart, rPose);
      if (rt < lastRoutineT - 1) { /* loop */ }
      if (lastRoutineT < 14.55 && rt >= 14.55) sayPeep();
      lastRoutineT = rt;
      // jump out of the shell: crouch → take-off → flight with flapping wings → landing squash
      const J = range(t, JUMP_A, JUMP_B);
      const fly = range(J, 0.22, 0.8);
      const out = easeInOut(fly);
      const wake = sr(t, JUMP_B, JUMP_B + 30); // its little routine starts on the straw
      for (const k of Object.keys(createPose())) heroP[k] = (rPose[k] || 0) * w5 * wake;
      heroP.shake = bump(t, T.alive + 22, 10);
      heroP.squash += bump(J, 0.12, 0.1) * 0.55 + bump(J, 0.86, 0.08) * 0.5;
      heroP.sit += bump(J, 0.12, 0.1) * 0.35;
      heroP.wing = Math.max(heroP.wing, Math.sin(Math.PI * fly));
      heroP.flap = Math.max(heroP.flap, Math.sin(Math.PI * fly));
      heroP.lean += Math.sin(Math.PI * fly) * 0.25;
      heroP.headPitch -= Math.sin(Math.PI * fly) * 0.2;
      if (J < 0.98) heroP.walk = 0; // no walking while still in the shell or in the air
      hero.root.position.set(
        lerp(BASE.x, LAND.x, out),
        lerp(BASE.y, LAND.y, out) + Math.sin(Math.PI * fly) * 1.15,
        lerp(BASE.z, LAND.z, out) + rPose.z * w5 * wake
      );
      hero.root.rotation.y = lerp(-0.45, (rPose.bodyYaw % (Math.PI * 2)) * w5, wake) - Math.sin(Math.PI * fly) * 0.3;
      hero.root.scale.setScalar(lerp(lerp(0.84, MEET_SCALE, growUp), FLOOR_SCALE, out));
      if (J > 0.86 && !landedPeep) { landedPeep = true; sayPeep(); buzz(12); }
      if (J < 0.5) landedPeep = false;
      hero.setLook({ wet: 1 - dry });
      heroLookEmbryo = true;
      lookInfluence = (now - pointer.last < 2.5 && pointer.has ? 1 : 0) * w5 * wake;
      // camera: from the chick in its shell to both of them — the chick on the straw and the empty shell
      const pair = sr(J, 0.15, 0.9);
      const cx = camX + pair * PAIR_DX;
      const cy = lerp(meetY, pairY, pair);
      cam.set(cx, cy + 0.45, 5.4 * meetK * far * (1 + pair * (pairK - 1)));
      tgt.set(cx, cy, 0.15);
    } else {
      wasInMeet = false;
      lastRoutineT = 0;
      const q = range(t, T.line, T.end);
      const qs = line.Q_START;
      // hero hops onto the belt, then the line moves it
      line.group.position.y = -7 * (1 - easeOut(range(q, 0.015, 0.07)));
      const st = line.update(q, time, dt, hero);
      if (q < qs) {
        const f = easeInOut(range(q, 0.062, qs - 0.004));
        // from its spot on the straw it hops onto the belt
        hero.root.position.set(lerp(LAND.x, 0, f), Math.sin(Math.PI * f) * 0.85, lerp(LAND.z, LINE_Z, f));
        hero.root.scale.setScalar(lerp(FLOOR_SCALE, 1, f));
        heroP.wing = Math.sin(Math.PI * f) * 0.9;
        heroP.flap = Math.sin(Math.PI * f);
        heroP.squash = bump(f, 0.02, 0.05) * 0.5 + bump(f, 0.98, 0.05) * 0.4;
      }
      hero.root.rotation.y = lerp(sr(q, 0.055, qs) * (Math.PI / 2), 0.25, heroP.sit);
      heroP.headYaw = -Math.PI / 2 * 0.6 * (1 - heroP.sit) + Math.sin(time * 0.8) * 0.2;
      heroP.blink = bump(time % 3.3, 0.2, 0.12);

      // camera follows the action
      const tx = kf(q, [[0, camX + PAIR_DX], [0.1, 1.6], [0.3, 5], [0.48, 8.6], [0.66, 10.5], [0.8, 17], [0.88, 22], [1, 33]]);
      tgt.set(tx, kf(q, [[0, pairY], [0.12, 0.1], [0.5, -0.3], [1, 0]]), kf(q, [[0, 0.15], [0.12, LINE_Z]]));
      kfv(q, [[0, [0, 0.45, 5.4 * meetK * pairK]], [0.12, [3.5, 5.2, 14.5]], [0.5, [3, 4.6, 14.5]], [0.72, [2, 4.6, 17]], [0.88, [0, 5, 20]], [1, [-3, 5.2, 22]]], tmpA);
      cam.set(tgt.x + tmpA[0] * far, tgt.y + tmpA[1], tgt.z + tmpA[2] * far);

      // HUD
      hud.scanCount.textContent = st.scanned;
      hud.packCount.textContent = st.packed;
      const step = q < 0.1 ? 0 : q < 0.3 ? 1 : q < 0.72 ? 2 : 3;
      hud.lineSteps.forEach((li, i) => li.classList.toggle('on', i === step));
      if (st.gateActive >= 0 && q < 0.9) {
        const s = toScreen(line.gateAnchor);
        hud.gate.style.opacity = 1;
        const gx = clamp(s.x, 110, innerWidth - 110);
        const gy = Math.max(s.y, innerWidth < 760 ? 345 : 150);
        hud.gate.style.transform = `translate(${gx}px, ${gy}px) translate(-50%, -100%)`;
        hud.gateId.textContent = `№ ${String(st.gateActive + 1).padStart(3, '0')}`;
        hud.gateW.textContent = say('{w} г', { w: LANG === 'en' ? gateWeights[st.gateActive].replace(',', '.') : gateWeights[st.gateActive] });
      } else hud.gate.style.opacity = 0;
    }
    if (t >= T.line) {
      /* nothing */
    } else hud.gate.style.opacity = 0;

  }
  if (t < T.line) hud.gate.style.opacity = 0;
  if (!incubator.group.visible) incubator.update(time, { on: 0, build: 0 });
  if (!embryoDrivesHero && heroLookEmbryo && (t < T.hatch || t >= T.line)) embryo.resetHero();
  heroLookEmbryo = embryoDrivesHero || (t >= T.hatch && t < T.line);

  egg.update(eggState);
  egg.candle.intensity = Math.max(egg.candle.intensity, hatchGlow * 4.5);
  rays.visible = t > T.hatch && t < T.alive && raysMat.opacity > 0.01;
  hatchGlow = 0;
  if (!rays.visible) raysMat.opacity = 0;
  // hero pose
  if (hero.root.visible) {
    lookAtPointer(heroP, lookInfluence);
    if (now - extraHop < 0.5) {
      const f = (now - extraHop) / 0.5;
      heroP.hop += Math.sin(Math.PI * f) * 0.35;
      heroP.wing = Math.max(heroP.wing, Math.sin(Math.PI * f) * 0.8);
      heroP.flap = Math.max(heroP.flap, Math.sin(Math.PI * f));
    }
    if (now < bubbleUntil) heroP.beak = Math.max(heroP.beak, bump((bubbleUntil - now) % 0.2, 0.1, 0.07));
    hero.apply(heroP, time, dt);
  }

  // speech bubble
  if (now < bubbleUntil && hero.root.visible && t < T.line + 100) {
    hero.headPivot.getWorldPosition(headW);
    headW.y += 0.6 * hero.root.scale.y;
    const s = toScreen(headW);
    hud.bubble.style.opacity = 1;
    hud.bubble.style.transform = `translate(${clamp(s.x + 30, 16, innerWidth - 120)}px, ${Math.max(s.y, 120)}px) translate(0, -100%)`;
  } else hud.bubble.style.opacity = 0;

  // flash
  hud.flash.style.opacity = (flash * 0.92).toFixed(3);
  flashLight.intensity = flash * 60;
  bloom.strength = bloomS + flash * 1.6;

  // camera + parallax
  cam.x += pointer.x * 0.18;
  cam.y += pointer.y * 0.08;
  camera.position.copy(cam);
  camera.lookAt(tgt);

  // key light follows the subject
  key.position.set(tgt.x + 5, tgt.y + 9, tgt.z + 7);
  key.target.position.copy(tgt);
  const sh = t > T.line + 30 ? 16 : 5;
  const sc = key.shadow.camera;
  if (sc.right !== sh) {
    sc.left = -sh; sc.right = sh; sc.top = sh; sc.bottom = -sh;
    sc.far = 60;
    sc.updateProjectionMatrix();
  }

  // climate cards
  const cardsOn = t > T.metrics && t < T.dip;
  // portrait phones stack the cards in a grid; phones held sideways place them around the egg like desktop
  const compact = innerWidth < 760 && innerWidth / innerHeight < 1.3;
  let paths = '';
  if (cardsOn) {
    for (const c of hud.cards) {
      const o = Number(c.el.style.opacity || 0);
      if (o < 0.01) continue;
      if (!compact) {
        const a = toScreen(c.anchor);
        const tip = toScreen(c.tip);
        const r = c.el.getBoundingClientRect();
        const left = c.anchor.x < 0;
        const x = clamp(left ? a.x - r.width : a.x, 12, innerWidth - r.width - 12);
        const y = clamp(a.y - r.height / 2, 80, innerHeight - r.height - 20);
        // on big monitors the cards are CSS-zoomed: their own left/top get multiplied by that zoom
        const z = c.zoom ?? (c.zoom = parseFloat(getComputedStyle(c.el).zoom) || 1);
        c.el.style.left = `${x / z}px`;
        c.el.style.top = `${y / z}px`;
        const sx = left ? x + r.width : x;
        const sy = y + r.height / 2;
        paths += `<path d="M${sx},${sy} L${(sx + tip.x) / 2},${sy} L${tip.x},${tip.y}" style="opacity:${o}"/><circle cx="${tip.x}" cy="${tip.y}" r="3.5" style="opacity:${o}"/>`;
      } else {
        c.el.style.left = '';
        c.el.style.top = '';
      }
    }
  }
  if (paths !== lastPaths) hud.lines.innerHTML = lastPaths = paths;

  // rail
  rail.classList.toggle('gone', t > TOTAL + 40);
  railFill.style.transform = `scaleY(${clamp(t / (TOTAL + 100))})`;
  let active = 0;
  CHAPTERS.forEach((c, i) => (t >= c.at - 5 ? (active = i) : 0));
  railDots.forEach((d, i) => d.classList.toggle('active', i === active));
  if (active !== lastChapter) {
    lastChapter = active;
    counterEl.querySelector('b').textContent = String(active + 1).padStart(2, '0');
    counterEl.querySelector('em').textContent = say(CHAPTERS[active].name);
  }
  counterEl.classList.toggle('gone', t > TOTAL + 40);
}

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */
function resize() {
  vh = Math.max(1, innerHeight / 100);
  for (const c of hud.cards || []) c.zoom = undefined; // the big-monitor zoom depends on the window size
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth / innerHeight < 0.8 ? 42 : 35;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

tCur = scrollT();
// debug: ?t=<vh> jumps straight to a moment of the story
const qT = Number(new URLSearchParams(location.search).get('t'));
if (qT > 0) {
  history.scrollRestoration = 'manual';
  window.scrollTo(0, qT * vh);
  tCur = qT;
}
let first = true;
let readyAt = null;

/* intro: the egg hatches while the scene gets ready; the visitor then steps in (with or without sound) */
const introPct = $('#introPct');
const introBar = $('#introBar');
const introStart = performance.now();
let introShown = 0;
let sceneIsLoaded = false;
requestAnimationFrame(function introProgress() {
  if (document.body.classList.contains('ready')) return;
  // real readiness drives the last part; time keeps the first part moving
  // time keeps the bar moving, the shaders that are really ready fill the rest
  const warmed = warmAllDone ? 1 : (warmTotal - warmStates.length - (warming ? 1 : 0)) / warmTotal;
  const target = gateOpen ? 100 : Math.min(97, Math.min(1, (performance.now() - introStart) / 2600) * 35 + (viewReady ? 5 : 0) + Math.max(0, warmed) * 57);
  introShown += (target - introShown) * 0.12;
  if (target === 100 && introShown > 99.4) introShown = 100;
  introPct.textContent = `${Math.round(introShown)}%`;
  introBar.style.transform = `scaleX(${introShown / 100})`;
  // the shell cracks along with the real loading
  const cls = document.body.classList;
  if (introShown >= 28 && !cls.contains('ic1')) { cls.add('ic1'); crackSound(0.05); }
  if (introShown >= 62 && !cls.contains('ic2')) { cls.add('ic2'); crackSound(0.06); }
  const phrase = INTRO_PHRASES.findLast(([p]) => introShown >= p)[1];
  if (phrase !== introPhrase) setIntroText(phrase);
  requestAnimationFrame(introProgress);
});
const INTRO_PHRASES = [[0, 'Согреваем инкубатор'], [28, 'Переворачиваем яйца'], [62, 'Цыплёнок стучится'], [100, 'Привет!']];
let introPhrase = INTRO_PHRASES[0][1];
const introText = $('#introText');
function setIntroText(p) {
  introPhrase = p;
  introText.classList.add('swap');
  setTimeout(() => { introText.textContent = say(p); introText.classList.remove('swap'); }, 220);
}
const params = new URLSearchParams(location.search);
// skip the gate on reloads in the same visit, for links into the middle of the story, and in automated checks
const autoEnter = !params.has('gate') && (sessionStorage.getItem('inkubio-in') === '1' || params.has('t') || params.has('promo') || navigator.webdriver);
let gateOpen = false;
function sceneLoaded() {
  sceneIsLoaded = true;
  // never keep a visitor at the door forever: a very slow GPU gets in after 25 s anyway
  setTimeout(() => { warmAllDone = true; openGate(); }, 25000);
  openGate();
}
function openGate() {
  if (gateOpen || !sceneIsLoaded || !warmAllDone) return;
  gateOpen = true;
  if (autoEnter) return enter(true);
  // no buttons: the egg hatches as soon as everything is ready, then the camera flies in by itself
  const wait = Math.max(0, 1800 - (performance.now() - introStart)); // let the cracks play out first
  setTimeout(() => {
    document.body.classList.add('ic1', 'ic2', 'hatched');
    crackSound(0.08);
    setTimeout(() => chirp(0.07), 950);
    setTimeout(() => enter(false), reduceMotion ? 300 : 1900);
  }, wait);
}
function enter(instant = false) {
  if (document.body.classList.contains('entering')) return;
  try { sessionStorage.setItem('inkubio-in', '1'); } catch { /* private mode */ }
  // the light opens from the middle of the egg body
  const r = $('.intro-egg')?.getBoundingClientRect();
  if (r && r.width) {
    for (const el of [$('#loader'), $('#iris')]) {
      el.style.setProperty('--cx', `${(r.left + r.width / 2).toFixed(0)}px`);
      el.style.setProperty('--cy', `${(r.top + r.height * 0.62).toFixed(0)}px`);
    }
  }
  document.body.classList.add('loaded', 'entering');
  readyAt = now;
  setTimeout(() => document.body.classList.add('ready'), instant || reduceMotion ? 0 : 1500);
}
/*
 Shaders are compiled in the background (KHR_parallel_shader_compile), one story
 moment at a time, so nothing freezes. The loader only waits for the moment the
 visitor is actually looking at; the rest is prepared while they watch.
*/
const warmStates = [0, 200, 340, 560, 650, 720, 820, 900, 960, 1120, 1280, 1500, 1700];
let warming = false;
let viewReady = false;
// compile for the same target the composer renders into (linear, no tone mapping),
// otherwise the GPU would build different shader variants than the ones actually used
function compileFor(fn) {
  renderer.setRenderTarget(composer.renderTarget1);
  const r = fn();
  renderer.setRenderTarget(null);
  return r;
}
const warmLog = (window.__warm = []);
function warmUpdate(t) {
  const saved = [lastCrackStep, wasInMeet, routineStart, lastRoutineT, heroLookEmbryo];
  update(t, now, 0.016);
  [lastCrackStep, wasInMeet, routineStart, lastRoutineT, heroLookEmbryo] = saved;
}
/*
 Every other story moment is compiled before the visitor steps in. The first use of a
 shader that the driver is still building blocks the page until it is ready: on
 integrated graphics (Intel UHD) that froze scrolling for 50–200 ms again and again.
 compileAsync lets the driver build them on its own threads while the intro plays.
*/
const warmTotal = warmStates.length;
let warmAllStarted = false;
let warmAllDone = false;
async function warmAll() {
  warmAllStarted = true;
  // compile() skips the shadow-map depth shaders: one real render into a tiny target builds them too
  const warmRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  while (warmStates.length) {
    const t = warmStates.shift();
    await new Promise((res) => warmStep(t, res));
    try {
      warmUpdate(t);
      renderer.setRenderTarget(warmRT);
      renderer.render(scene, camera);
    } catch (err) {
      console.warn(err);
    }
    renderer.setRenderTarget(null);
  }
  warmRT.dispose();
  // the first use of a program reads its uniforms (a blocking GPU round trip): do it now, behind the intro
  for (const p of renderer.info.programs) {
    try { p.getUniforms(); p.getAttributes(); } catch { /* a program that failed shows its error on first use */ }
  }
  // upload every texture now too, not on the first frame that shows it
  scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) for (const v of Object.values(m)) if (v && v.isTexture) renderer.initTexture(v);
  });
  warmAllDone = true;
  openGate();
}
function warmStep(t, done) {
  warming = true;
  const t0 = performance.now();
  try {
    warmUpdate(t); // pose the scene for that moment (the real frame below overrides it)
    const p = compileFor(() => renderer.compileAsync(scene, camera));
    warmLog.push([Math.round(t), 'queued', Math.round(performance.now() - t0)]);
    p.catch(() => {}).then(() => {
      warmLog.push([Math.round(t), 'done', Math.round(performance.now() - t0)]);
      warming = false;
      if (done) done();
    });
  } catch (err) {
    console.warn(err);
    warming = false;
    if (done) done();
  }
}
const perf = { frames: 0, time: 0, since: 0 };
// ?prof: per-frame timings [t, update ms, render ms incl. GPU, draw calls, triangles] in window.__prof
const PROF = new URLSearchParams(location.search).has('prof') ? (window.__prof = []) : null;
if (PROF) window.__dbg = { THREE, renderer, composer, bloom, film, scene, camera, key, perf };
function lowerQuality() {
  const next = TIERS[TIERS.indexOf(tier) + 1];
  if (!next) return;
  tier = next;
  Q = QUALITY[tier];
  window.__quality = tier;
  DPR = Math.min(window.devicePixelRatio || 1, Q.dpr);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  resize();
  bloom.enabled = Q.bloom;
  for (const rtx of [composer.renderTarget1, composer.renderTarget2]) { rtx.samples = Q.samples; rtx.dispose(); }
  if (!Q.shadows) {
    // switching shadows off would rebuild every shader; refresh them rarely instead
    renderer.shadowMap.autoUpdate = false;
    key.shadow.map?.dispose();
    key.shadow.map = null;
    key.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
  }
  hero.setFurDensity(Q.fur);
  line.setFurDensity(Q.fur);
  console.info(`[inkubio] quality → ${tier}`);
}
function watchFrameRate(rawDt) {
  if (QFORCED || readyAt === null || !warmAllDone || document.hidden || now - readyAt < 1.5) return;
  perf.frames++;
  perf.time += rawDt;
  if (perf.time < 1.6) return;
  const fps = perf.frames / perf.time;
  perf.frames = 0;
  perf.time = 0;
  if (fps < 42 && now - perf.since > 2) { // step down early: a smooth scroll matters more than detail
    perf.since = now;
    lowerQuality();
  }
}
function frame() {
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  watchFrameRate(rawDt);
  if (!renderer.shadowMap.autoUpdate && Math.round(now * 60) % 4 === 0) renderer.shadowMap.needsUpdate = true;
  now += dt;
  if (!viewReady) {
    if (!warming) {
      // the browser may restore the scroll position a moment after load: prepare the moment that is really on screen
      const t0 = scrollT();
      warmStep(t0, () => (viewReady = Math.abs(scrollT() - t0) < 40));
    }
    requestAnimationFrame(frame);
    return;
  }
  if (!warmAllStarted) warmAll();
  if (filmOn) playFilm(dt);
  const target = scrollT();
  if (!Number.isFinite(tCur)) tCur = target;
  tCur = reduceMotion ? target : tCur + (target - tCur) * (1 - Math.exp(-dt * 7));
  if (Math.abs(target - tCur) < 0.01) tCur = target;
  window.__t = tCur;
  const hidden = tCur > TOTAL + 100.5;
  if (!hidden || first) {
    try {
      const p0 = performance.now();
      if (PROF) { renderer.info.autoReset = false; renderer.info.reset(); }
      update(tCur, now, dt);
      const p1 = performance.now();
      composer.render();
      if (PROF) {
        renderer.getContext().finish();
        const p2 = performance.now();
        PROF.push([Math.round(tCur), +(p1 - p0).toFixed(1), +(p2 - p1).toFixed(1), renderer.info.render.calls, renderer.info.render.triangles, renderer.info.programs.length]);
        if (PROF.length > 600) PROF.shift();
      }
    } catch (err) {
      if (!frame.warned) console.error(err);
      frame.warned = true;
    }
  }
  if (first) {
    first = false;
    sceneLoaded();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ------------------------------------------------------------------ */
/* Final section: counters + order dialog                              */
/* ------------------------------------------------------------------ */
if (!isTouch && !reduceMotion) {
  // magnetic call-to-action
  for (const m of $$('.magnetic')) {
    m.addEventListener('pointermove', (e) => {
      const r = m.getBoundingClientRect();
      m.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
    });
    m.addEventListener('pointerleave', () => (m.style.transform = ''));
  }
}
for (const h of $$('[data-letters]')) {
  h.setAttribute('aria-label', h.textContent);
  h.innerHTML = [...h.textContent].map((c, i) => `<span class="l" aria-hidden="true" style="--i:${i}">${c}</span>`).join('');
  new IntersectionObserver((en, o) => {
    if (en[0].isIntersecting) { h.classList.add('in'); o.disconnect(); }
  }, { threshold: 0.5 }).observe(h);
}

// live chick on the final screen: loaded only when the visitor gets close, on screens wide enough
const finaleEl = $('#finale');
if (finaleEl && tier !== 'low') {
  // prepared in idle time once the story's own shaders are ready, so it never stalls the scroll
  let finaleStarted = false;
  const startFinale = async () => {
    if (finaleStarted || innerWidth < 900) return;
    finaleStarted = true;
    const { createFinale } = await import('./finale.js');
    createFinale(finaleEl, { layers: Math.max(5, Math.round(12 * Q.fur)) });
  };
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  const waitWarm = () => (!warmAllDone || readyAt === null ? setTimeout(waitWarm, 500) : idle(startFinale, { timeout: 4000 }));
  setTimeout(waitWarm, 2500);
  new IntersectionObserver((en) => en[0].isIntersecting && startFinale(), { rootMargin: '900px 0px' }).observe(finaleEl);
}

/* estimate in the order form + hatch calendar, both driven by js/config.js */
const fmtNum = new Intl.NumberFormat(LOCALE);
const estimateEl = $('#estimate');
function updateEstimate() {
  const f = $('#orderForm');
  const price = SITE.prices?.[f.breed.value];
  const qty = Number(f.qty.value);
  if (price == null || !qty) { estimateEl.hidden = true; return; }
  const sum = price * qty + (SITE.delivery || 0);
  const cur = SITE.currency ? ` ${SITE.currency}` : '';
  estimateEl.hidden = false;
  estimateEl.innerHTML = say('Примерно: {sum}', { sum: `<b>${fmtNum.format(sum)}${cur}</b>` }) + `<br>${fmtNum.format(qty)} × ${fmtNum.format(price)}${cur}` +
    (SITE.delivery ? say(' + доставка {sum}', { sum: fmtNum.format(SITE.delivery) + cur }) : say(' · доставка рассчитывается отдельно'));
}
$('#orderForm').addEventListener('input', updateEstimate);
const hatches = (SITE.hatches || []).filter((h) => new Date(h.date) >= new Date(new Date().toDateString()));
if (hatches.length) {
  const max = Math.max(...hatches.map((h) => h.left || 0), 1);
  $('#hatchList').innerHTML = hatches.map((h, i) => {
    const d = new Date(h.date);
    return `<article class="hatch"><time datetime="${h.date}">${d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' })}</time>
      <span>${say(h.breed)}</span>${h.left != null ? `<span class="left">${say('осталось {n} голов', { n: fmtNum.format(h.left) })}</span><div class="bar"><i style="width:${(h.left / max) * 100}%"></i></div>` : ''}
      <button class="pill ghost" type="button" data-book="${i}">${say('Забронировать')}</button></article>`;
  }).join('');
  $('#hatches').hidden = false;
  $$('[data-book]').forEach((b) => b.addEventListener('click', () => {
    const h = hatches[Number(b.dataset.book)];
    const f = $('#orderForm');
    f.breed.value = h.breed;
    f.date.value = h.date;
    dialog.showModal();
    document.documentElement.classList.add('locked');
    updateEstimate();
  }));
}

/* ---------- new blocks: reveal, 21 days, care guide, checklist, facts, stats ---------- */
const revealIO = new IntersectionObserver((en) => en.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
}), { threshold: 0.15 });
$$('.reveal').forEach((el) => revealIO.observe(el));

const DAYS = {
  1: ['Начало пути', 'Яйцо попадает в инкубатор. В тепле начинается деление клеток зародышевого диска.'],
  2: ['Первое сердцебиение', 'Закладывается сердце, и уже к концу второго дня оно начинает биться. Появляются первые сосуды.'],
  4: ['Глаза и зачатки крыльев', 'Становятся заметны тёмные глаза, появляются зачатки крыльев и лапок.'],
  7: ['Сеть сосудов', 'Сосуды оплетают желток и подают зародышу питание. Он заметно растёт и двигается.'],
  10: ['Клюв и коготки', 'Формируются клюв и коготки, на коже появляются зачатки будущего пуха.'],
  14: ['Пух и поворот', 'Тело покрывается пухом. Цыплёнок разворачивается головой к тупому концу яйца.'],
  18: ['Перевод на вывод', 'Яйца перестают поворачивать и переносят в выводной шкаф, где выше влажность.'],
  19: ['Желток — в брюшко', 'Остаток желтка втягивается внутрь. Это запас еды на первые сутки жизни.'],
  20: ['Первый вдох', 'Цыплёнок прокалывает воздушную камеру и начинает дышать лёгкими. Появляется наклёв.'],
  21: ['Вывод', 'Цыплёнок разбивает скорлупу и выбирается наружу. Через несколько часов он уже обсох и пушист.'],
};
const t21cells = $$('.t21-cell');
function showDay(d, focus = false) {
  const key = Math.max(...Object.keys(DAYS).map(Number).filter((k) => k <= d));
  $('#t21Day').textContent = d === key ? say('День {d}', { d }) : say('День {d} · как и в день {k}', { d, k: key });
  $('#t21Head').textContent = say(DAYS[key][0]);
  $('#t21Text').textContent = say(DAYS[key][1]);
  t21cells.forEach((c) => {
    const on = Number(c.dataset.day) === d;
    c.setAttribute('aria-selected', String(on));
    c.tabIndex = on ? 0 : -1;
    if (on && focus) { c.focus(); c.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }
  });
}
t21cells.forEach((c) => {
  if (DAYS[c.dataset.day]) c.classList.add('m');
  c.addEventListener('click', () => showDay(Number(c.dataset.day)));
  c.addEventListener('mouseenter', () => !isTouch && showDay(Number(c.dataset.day)));
  c.addEventListener('keydown', (e) => {
    const d = Number(c.dataset.day);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); showDay(Math.min(21, d + 1), true); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); showDay(Math.max(1, d - 1), true); }
  });
});
if (t21cells.length) showDay(1);

const CARE = [...$$('.care-tab')].map((b) => b.dataset.care);
const CARE_DATA = [
  ['32–34 °C', 0.95, 'Встреча цыплят', 'Прогрейте помещение заранее: на уровне цыплят около 32–34 °C. Сухая чистая подстилка, свежая вода комнатной температуры и стартовый корм — сразу.'],
  ['≈ 32 °C', 0.86, 'Вода и корм рядом', 'Держите поилки и кормушки в шаговой доступности. Подсыпайте корм часто, понемногу. Проверяйте, что цыплята пьют и зобики наполняются.'],
  ['≈ 31 °C', 0.76, 'Плавно снижаем тепло', 'Начинайте понемногу снижать температуру, без резких скачков. Следите, чтобы подстилка оставалась сухой, а у поилок не было луж.'],
  ['≈ 29–30 °C', 0.62, 'Больше простора', 'Расширяйте площадь и добавляйте кормушки по мере роста. К концу недели температура обычно на несколько градусов ниже стартовой. Проветривайте без сквозняков.'],
  ['по поведению', 0.5, 'Смотрите на поведение', 'Цыплятам комфортно, если они равномерно распределены и активны. Сбились в кучу — холодно. Жмутся к краям и дышат открытым клювом — жарко.'],
];
function showCare(i) {
  const [temp, fill, head, text] = CARE_DATA[i];
  $$('.care-tab').forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-selected', String(k === i)); });
  $('#thermoFill').style.height = `${fill * 100}%`;
  const body = $('.care-body');
  body.classList.remove('swap');
  void body.offsetWidth;
  body.classList.add('swap');
  $('#careTemp').textContent = say(temp);
  $('#careHead').textContent = say(head);
  $('#careText').textContent = say(text);
}
$$('.care-tab').forEach((b, i) => b.addEventListener('click', () => showCare(i)));
if (CARE.length) showCare(0);

// arrival checklist, remembered in this browser
const checks = $$('[data-check]');
const CHECK_KEY = 'inkubio-checklist';
try { const saved = JSON.parse(localStorage.getItem(CHECK_KEY) || '[]'); checks.forEach((c, i) => (c.checked = !!saved[i])); } catch { /* storage is optional */ }
function updateChecklist() {
  const done = checks.filter((c) => c.checked).length;
  $('#ringProg').style.strokeDashoffset = String(119.4 * (1 - done / checks.length));
  $('#ringText').textContent = `${done}/${checks.length}`;
  $('.ready-cta').hidden = done < checks.length;
  try { localStorage.setItem(CHECK_KEY, JSON.stringify(checks.map((c) => c.checked))); } catch { /* storage is optional */ }
}
checks.forEach((c) => c.addEventListener('change', updateChecklist));
if (checks.length) updateChecklist();

// flip cards
$$('.fact').forEach((f) => f.addEventListener('click', () => f.setAttribute('aria-pressed', String(f.getAttribute('aria-pressed') !== 'true'))));

// company figures only when the owner fills them in js/config.js
const statsEl = $('#stats');
if (Array.isArray(SITE.stats) && SITE.stats.length) {
  statsEl.innerHTML = SITE.stats.map((s) => `<div class="stat"><b data-count="${Number(s.value) || 0}">0</b><span></span></div>`).join('');
  [...statsEl.querySelectorAll('.stat span')].forEach((el, i) => (el.textContent = SITE.stats[i].label));
  statsEl.hidden = false;
} else statsEl.remove();

// no past dates in the order form
{
  const d = new Date();
  $('#orderForm').date.min = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const counters = $$('[data-count]');
const io = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    const el = en.target;
    io.unobserve(el);
    const end = Number(el.dataset.count);
    const t0 = performance.now();
    const fmt = new Intl.NumberFormat(LOCALE);
    const tick = (n) => {
      const k = easeOut(clamp((n - t0) / 1600));
      el.textContent = fmt.format(Math.round(end * k));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}, { threshold: 0.4 });
counters.forEach((c) => io.observe(c));

const dialog = $('#orderDialog');
$$('[data-order]').forEach((b) => b.addEventListener('click', (e) => {
  e.preventDefault();
  const of = $('#orderForm');
  if (b.dataset.breed) of.breed.value = b.dataset.breed;
  if (b.dataset.qty) of.qty.value = b.dataset.qty; // from the payback calculator
  of.segment.value = b.dataset.segment || of.segment.value || '';
  of.classList.remove('sent');
  dialog.showModal();
  document.documentElement.classList.add('locked');
  updateEstimate();
}));
$('#orderClose').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => document.documentElement.classList.remove('locked'));
let downOnBackdrop = false;
dialog.addEventListener('pointerdown', (e) => (downOnBackdrop = e.target === dialog));
dialog.addEventListener('click', (e) => { if (e.target === dialog && downOnBackdrop) dialog.close(); });
const orderForm = $('#orderForm');
let sentTimer = 0;
const orderError = $('#orderError');
const ORDER_ERRORS = {
  invalid: 'Проверьте имя и телефон — похоже, в них ошибка.',
  rate: 'Слишком много заявок подряд. Попробуйте через несколько минут.',
  default: 'Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам.',
};
orderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  orderError.classList.remove('on');
  if (!f.reportValidity()) return;
  const btn = f.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(f));
  data.qty = Number(data.qty);
  btn.disabled = true;
  btn.textContent = say('Отправляем…');
  try {
    const res = await fetch(f.action, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) throw new Error(out.error || 'default');
    f.classList.add('sent');
    goal('order');
    clearTimeout(sentTimer);
    sentTimer = setTimeout(() => { dialog.close(); f.classList.remove('sent'); f.reset(); }, 3200);
  } catch (err) {
    orderError.textContent = say(ORDER_ERRORS[err.message] || ORDER_ERRORS.default);
    orderError.classList.add('on');
  } finally {
    btn.disabled = false;
    btn.textContent = say('Отправить заявку');
  }
});
$('#toTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
// "straight to the order": jump without flying through every scene
/* film mode: the story plays itself, slower at the key moments */
let filmOn = false;
const filmBar = $('#filmBar');
const filmProgress = $('#filmProgress');
const filmSpeed = (t) => kf(t, [[0, 26], [120, 26], [140, 34], [290, 34], [310, 34], [450, 38], [480, 28], [740, 28], [760, 16], [990, 16], [1010, 14], [1240, 14], [1260, 32], [1800, 32], [1820, 50]]); // vh per second
function playFilm(dt) {
  const t = scrollT();
  if (t >= TOTAL + 99) return stopFilm();
  window.scrollBy(0, filmSpeed(t) * vh * dt);
  filmProgress.style.transform = `scaleX(${clamp(t / (TOTAL + 100))})`;
}
function startFilm() {
  const audio = unlockAudio();
  if (scrollT() > TOTAL + 50) window.scrollTo({ top: 0, behavior: 'instant' });
  filmOn = true;
  document.body.classList.add('filming');
  filmBar.classList.add('show');
  (audio || Promise.resolve()).then(() => filmOn && startMusic());
  goal('film');
}
function stopFilm() {
  if (!filmOn) return;
  filmOn = false;
  document.body.classList.remove('filming');
  filmBar.classList.remove('show');
  stopMusic();
}
$$('[data-film]').forEach((b) => b.addEventListener('click', startFilm));
// ?promo=1: clean frame for recording a vertical video — no controls, the film is started from outside
if (new URLSearchParams(location.search).has('promo')) {
  document.body.classList.add('promo');
  window.__startFilm = startFilm;
  window.__filming = () => filmOn;
}
filmBar.addEventListener('click', stopFilm);
// any manual scrolling takes control back
for (const ev of ['wheel', 'touchstart']) addEventListener(ev, () => stopFilm(), { passive: true });
// any click (a chapter dot, the logo, a button) also hands control back — except on the film controls themselves
addEventListener('pointerdown', (e) => { if (!e.target.closest('[data-film], #filmBar')) stopFilm(); }, true);
addEventListener('keydown', (e) => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Space', 'Home', 'End', 'Escape'].includes(e.code)) stopFilm(); });

$$('[data-jump]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  window.scrollTo({ top: aboutEl.offsetTop, behavior: 'instant' });
  tCur = scrollT();
  goal('skip_story');
  setTimeout(() => { $('#orderForm').classList.remove('sent'); dialog.showModal(); document.documentElement.classList.add('locked'); updateEstimate(); }, 450);
}));
$$('[data-site=telegram], [data-site=whatsapp]').forEach((a) => a.addEventListener('click', () => goal('messenger')));

// everything above is wired up: the plain-mode safety net in index.html can stand down
window.__appOk = true;
