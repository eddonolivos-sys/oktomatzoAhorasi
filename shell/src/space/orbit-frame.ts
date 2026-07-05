/**
 * Base ortonormal del plano orbital (S3 — arregla Bug D): el plano se deriva
 * del eje planeta→sol, NO de la velocidad de llegada de la nave, así que es
 * determinista y compone al sol en el encuadre (S4). Sin Three.js.
 */
import { type V3, sub, cross, dot, length, normalize } from './vec3-math';

export type { V3 };

export interface OrbitBasis {
  /** Radial inicial (ángulo 0 de la órbita), dentro del plano. */
  U: V3;
  /** Tangencial (sentido de avance), perpendicular a U y N. */
  V: V3;
  /** Normal del plano orbital. */
  N: V3;
}

const WORLD_UP: V3 = { x: 0, y: 1, z: 0 };
const WORLD_FORWARD: V3 = { x: 0, y: 0, z: -1 };
const EPSILON = 1e-6;

/**
 * Normal del plano orbital a partir de la dirección planeta→sol: perpendicular
 * a `sunDir` (así `sunDir` queda DENTRO del plano). La reutiliza
 * `orbit-camera.ts` para orientar el "up" de la cámara con el mismo plano.
 */
export function orbitPlaneNormal(sunDir: V3): V3 {
  let n = normalize(cross(sunDir, WORLD_UP));
  if (length(n) < EPSILON) {
    n = normalize(cross(sunDir, WORLD_FORWARD));
  }
  return n;
}

/**
 * Base {U,V,N} determinista y orientada al sol (misma entrada → mismo plano;
 * no depende de la velocidad de llegada, que era la causa del Bug D).
 */
export function buildOrbitBasis(args: { center: V3; ship: V3; sun: V3 }): OrbitBasis {
  const sunDir = normalize(sub(args.sun, args.center));
  const n = orbitPlaneNormal(sunDir);

  const radial = sub(args.ship, args.center);
  const radialAlongN = dot(radial, n);
  const radialOnPlane = sub(radial, {
    x: n.x * radialAlongN,
    y: n.y * radialAlongN,
    z: n.z * radialAlongN,
  });
  let u = normalize(radialOnPlane);
  if (length(u) < EPSILON) {
    u = normalize(cross(n, sunDir));
  }

  const v = cross(n, u);
  return { U: u, V: v, N: n };
}
