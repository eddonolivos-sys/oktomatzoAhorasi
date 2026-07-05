/**
 * Vectores 3D puros (sin Three.js), compartidos por los módulos de geometría
 * orbital (orbit-frame.ts, orbit-camera.ts). Misma forma que THREE.Vector3
 * (campos x/y/z): un THREE.Vector3 se puede pasar directamente como V3.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export function sub(a: V3, b: V3): V3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function add(a: V3, b: V3): V3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function scale(a: V3, k: number): V3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}

export function cross(a: V3, b: V3): V3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function dot(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function length(a: V3): number {
  return Math.sqrt(dot(a, a));
}

const EPSILON = 1e-6;

/** Vector unitario; degenerado (longitud ~0) → vector nulo (evita NaN). */
export function normalize(a: V3): V3 {
  const len = length(a);
  if (len < EPSILON) return { x: 0, y: 0, z: 0 };
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}
