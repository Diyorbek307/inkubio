export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const range = (x, a, b) => clamp((x - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
export const sr = (x, a, b) => smooth(range(x, a, b));
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t) => t * t * t;

// Keyframes [[x, value], ...] with smoothstep between neighbours.
export function kf(x, keys) {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (x <= keys[i][0]) {
      const [x0, v0] = keys[i - 1];
      const [x1, v1] = keys[i];
      return lerp(v0, v1, smooth((x - x0) / (x1 - x0 || 1)));
    }
  }
  return keys[keys.length - 1][1];
}

// Same, for array values (vectors).
export function kfv(x, keys, out = []) {
  const n = keys[0][1].length;
  for (let c = 0; c < n; c++) out[c] = kf(x, keys.map((k) => [k[0], k[1][c]]));
  return out;
}

// Smooth bump centred at c with half-width w.
export const bump = (x, c, w) => {
  const d = Math.abs(x - c) / w;
  return d >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * d);
};

export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
