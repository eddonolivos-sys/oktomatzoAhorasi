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
}

export interface OrbitInput {
  insideInfluence: boolean;
  enterPressed: boolean;
  /** Flanco de subida del empuje (una pulsación NUEVA), no la tecla mantenida:
   * acercarse manteniendo W no debe romper la órbita; solo una pulsación deliberada expulsa. */
  thrustPressed: boolean;
  dt: number;
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
 * - `free`: entra en órbita al cruzar la esfera de influencia.
 * - `orbiting`: E entra (acción `enter`); una PULSACIÓN de empuje expulsa (acción `eject`
 *   → `ejecting`); salir de la influencia vuelve a `free`. Acercarse con el empuje mantenido
 *   no expulsa (es flanco, no nivel); mirar con el ratón no cambia nada.
 * - `ejecting`: descuenta el cooldown (sin recaptura) hasta volver a `free`.
 * El empuje y el `enter` simultáneos: gana `enter` (no expulsa).
 */
export function stepOrbit(prev: OrbitState, input: OrbitInput, cooldownDuration: number): OrbitResult {
  const { insideInfluence, enterPressed, thrustPressed, dt } = input;

  if (prev.phase === 'ejecting') {
    const cooldown = prev.cooldown - dt;
    if (cooldown > 0) return { state: { phase: 'ejecting', cooldown }, action: 'none' };
    return { state: { phase: 'free', cooldown: 0 }, action: 'none' };
  }

  if (prev.phase === 'orbiting') {
    if (enterPressed) return { state: prev, action: 'enter' };
    if (thrustPressed) return { state: { phase: 'ejecting', cooldown: cooldownDuration }, action: 'eject' };
    if (!insideInfluence) return { state: { phase: 'free', cooldown: 0 }, action: 'none' };
    return { state: prev, action: 'none' };
  }

  // free
  if (insideInfluence) return { state: { phase: 'orbiting', cooldown: 0 }, action: 'none' };
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
