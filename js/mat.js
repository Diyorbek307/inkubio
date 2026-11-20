import * as THREE from 'three';

// A standard material that quietly ignores physical-only options.
// Fewer distinct shader programs means a much faster first load.
export function std(params = {}) {
  const { clearcoat, clearcoatRoughness, sheen, sheenColor, sheenRoughness, transmission, ...rest } = params;
  return new THREE.MeshStandardMaterial(rest);
}
