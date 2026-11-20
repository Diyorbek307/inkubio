import * as THREE from 'three';

// Dark photo studio with softboxes, baked into an environment map.
// Gives the egg soft gradient highlights instead of a flat bright glow.
export function createStudioEnvironment(renderer) {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.SphereGeometry(30, 32, 16),
    new THREE.MeshBasicMaterial({ color: '#0a0a0c', side: THREE.BackSide })
  );
  scene.add(room);

  const panel = (w, h, color, power, pos, look = [0, 1, 0]) => {
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    m.color.multiplyScalar(power);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.set(...pos);
    p.lookAt(...look);
    scene.add(p);
  };
  panel(7, 3.5, '#fff3e4', 3.2, [0, 8, 2.5]); // overhead softbox
  panel(1.6, 7, '#ffe9d2', 2.4, [-7, 2.5, 4]); // key strip, front-left
  panel(1.2, 8, '#cfe0ff', 3.0, [7, 2.5, -5]); // cool rim, back-right
  panel(1.0, 6, '#cfe0ff', 1.4, [-6, 2, -6]); // second rim
  panel(3, 2, '#ffffff', 0.5, [4, 0.8, 7]); // gentle front fill
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: '#141416' }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3;
  scene.add(floor);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.03).texture;
  pmrem.dispose();
  return tex;
}

// Vignette, film grain and a touch of lens fringing, applied after tone mapping.
export const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: 0.035 },
    vignette: { value: 0.5 },
    aberration: { value: 0.0015 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, grain, vignette, aberration;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * aberration * r2 * 4.0;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - off).b;
      c *= mix(1.0, smoothstep(0.95, 0.12, r2 * 1.7), vignette);
      c += (rand(vUv * vec2(1213.1, 917.7) + fract(time * 7.13)) - 0.5) * grain;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};
