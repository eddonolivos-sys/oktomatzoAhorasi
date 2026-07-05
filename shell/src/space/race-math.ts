/**
 * Distancia a segmento y colisión (Hito 5). Reutiliza vec3-math.ts (Hito 1).
 * Sin Three.js.
 */
import { type V3, sub, add, scale, dot, length } from './vec3-math';

export type { V3 };

/** Distancia del punto `p` al segmento [a,b] (proyección acotada al segmento). */
export function distanceToSegment(p: V3, a: V3, b: V3): number {
  const ab = sub(b, a);
  const abLenSq = dot(ab, ab);
  const t = abLenSq > 1e-9 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / abLenSq)) : 0;
  const closest = add(a, scale(ab, t));
  return length(sub(p, closest));
}

/**
 * Distancia de `p` al segmento MÁS CERCANO de un circuito cerrado (recorre
 * todos los pares consecutivos, incluida la vuelta de cierre waypoints[n-1]→[0]).
 */
export function nearestSegmentDistance(p: V3, waypoints: V3[]): number {
  if (waypoints.length === 0) return Infinity;
  if (waypoints.length === 1) {
    const only = waypoints[0];
    return only ? length(sub(p, only)) : Infinity;
  }
  let min = Infinity;
  for (let i = 0; i < waypoints.length; i++) {
    const a = waypoints[i];
    const b = waypoints[(i + 1) % waypoints.length];
    if (!a || !b) continue;
    const d = distanceToSegment(p, a, b);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Colisión esfera-esfera POR EL TRAMO recorrido en el frame (segStart→segEnd),
 * no por la posición puntual — evita el "tunneling" de un objeto rápido que
 * atraviesa un obstáculo pequeño entre dos frames sin que su posición final
 * quede nunca dentro del radio de colisión (la nave no tiene maxSpeed).
 */
export function sweptSphereHitsSphere(
  segStart: V3,
  segEnd: V3,
  obstacleCenter: V3,
  obstacleRadius: number,
  shipRadius: number,
): boolean {
  return distanceToSegment(obstacleCenter, segStart, segEnd) <= obstacleRadius + shipRadius;
}
