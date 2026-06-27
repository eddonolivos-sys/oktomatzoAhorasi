/**
 * Lógica pura de la interacción orbital (#3): máquina de estados
 * libre/órbita/expulsión y el impulso de expulsión. Sin Three.js (testeable con
 * Vitest en node), siguiendo el patrón de flight-math.ts / dwell.ts.
 */

export type OrbitPhase = 'free' | 'orbiting' | 'ejecting';

export interface OrbitState {
  phase: OrbitPhase;
  /** Segundos restantes de bloqueo de recaptura tras expulsar (solo en 'ejecting'). */
  cooldown: number;
  /** Segundos de gracia tras capturar durante los que el empuje NO expulsa (solo 'orbiting'). */
  grace: number;
}

export interface OrbitInput {
  insideInfluence: boolean;
  enterPressed: boolean;
  /** Empuje activo (W/A/S/D/Shift/Space mantenido). */
  thrustActive: boolean;
  dt: number;
}

export interface OrbitParams {
  /** Tiempo sin recaptura tras expulsar. */
  cooldownDuration: number;
  /** Gracia tras capturar: ignora el empuje un instante para no auto-expulsar al
   * acercarse con W. Pasada la gracia, el empuje (aunque sea mantenido) expulsa
   * → nunca te quedas atrapado en la órbita. */
  captureGrace: number;
}

export interface OrbitResult {
  state: OrbitState;
  action: 'none' | 'enter' | 'eject';
}

interface V3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Avanza un frame la máquina de estados de la órbita:
 * - `free`: entra en órbita al cruzar la esfera de influencia (con una gracia inicial).
 * - `orbiting`: E entra (acción `enter`); pasada la gracia, el empuje expulsa (acción
 *   `eject` → `ejecting`); salir de la influencia vuelve a `free`. Mirar con el ratón no
 *   cambia nada. La gracia evita la auto-expulsión al llegar con W; tras ella, mantener
 *   el empuje también expulsa (no hay forma de quedarse atrapado).
 * - `ejecting`: descuenta el cooldown (sin recaptura) hasta volver a `free`.
 * El empuje y el `enter` simultáneos: gana `enter`.
 */
export function stepOrbit(prev: OrbitState, input: OrbitInput, params: OrbitParams): OrbitResult {
  const { insideInfluence, enterPressed, thrustActive, dt } = input;

  if (prev.phase === 'ejecting') {
    const cooldown = prev.cooldown - dt;
    if (cooldown > 0) return { state: { phase: 'ejecting', cooldown, grace: 0 }, action: 'none' };
    return { state: { phase: 'free', cooldown: 0, grace: 0 }, action: 'none' };
  }

  if (prev.phase === 'orbiting') {
    if (enterPressed) return { state: prev, action: 'enter' };
    const grace = Math.max(0, prev.grace - dt);
    if (thrustActive && grace <= 0) {
      return { state: { phase: 'ejecting', cooldown: params.cooldownDuration, grace: 0 }, action: 'eject' };
    }
    if (!insideInfluence) return { state: { phase: 'free', cooldown: 0, grace: 0 }, action: 'none' };
    return { state: { phase: 'orbiting', cooldown: 0, grace }, action: 'none' };
  }

  // free
  if (insideInfluence) {
    return { state: { phase: 'orbiting', cooldown: 0, grace: params.captureGrace }, action: 'none' };
  }
  return { state: prev, action: 'none' };
}

/** Velocidad de expulsión: dirección radial centro→nave, normalizada y escalada por `strength`. */
export function ejectVelocity(center: V3, ship: V3, strength: number): V3 {
  const dx = ship.x - center.x;
  const dy = ship.y - center.y;
  const dz = ship.z - center.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return { x: 0, y: strength, z: 0 }; // degenerado (nave≈centro): empuja "arriba"
  const k = strength / len;
  return { x: dx * k, y: dy * k, z: dz * k };
}
