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
