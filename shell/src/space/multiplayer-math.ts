/**
 * Lógica pura del multijugador (sin Three.js, testeable con Vitest en node),
 * siguiendo el patrón de flight-math.ts / hud-format.ts. El cliente WebSocket,
 * la escena y el DOM viven en otros módulos; aquí solo van números puros.
 */

/**
 * Throttle de envío de estado: devuelve true si `now` está al menos `intervalMs`
 * después de `last` (último envío). Con intervalMs=50 → ~20 Hz.
 * now/last en milisegundos (p. ej. performance.now()).
 */
export function shouldSendState(now: number, last: number, intervalMs: number): boolean {
  return now - last >= intervalMs;
}

/** Estado interpolable de una nave (coordenadas absolutas de mundo + rumbo). */
export interface PlayerState {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Diferencia angular envuelta a (−π, π] (arco más corto entre dos ángulos). */
function shortestAngleDiff(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Interpola linealmente posición y yaw de `from` a `to` con factor `t∈[0,1]`
 * (clamp). El yaw usa el arco más corto (envoltura por ±π) para no "dar la vuelta".
 */
export function lerpState(from: PlayerState, to: PlayerState, t: number): PlayerState {
  const k = Math.max(0, Math.min(1, t));
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
    z: from.z + (to.z - from.z) * k,
    yaw: from.yaw + shortestAngleDiff(from.yaw, to.yaw) * k,
  };
}
