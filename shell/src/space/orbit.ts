/**
 * Lógica pura de la interacción orbital (Hito 1 S5+S6): máquina de estados
 * libre/órbita/expulsión y el impulso de expulsión. Sin Three.js.
 *
 * S5: se elimina la expulsión automática por empuje mantenido (el jugador
 * podía quedar atrapado o ser expulsado sin querer). Ahora solo dos acciones
 * explícitas en órbita: `enter` (E / botón "Entrar") y `exit` (S / botón
 * "Salir"). Se elimina `captureGrace`/`grace`: ya no hace falta ignorar el
 * empuje al capturar, porque el empuje no expulsa nunca.
 *
 * S6 (arregla Bug B — no se podía entrar a otro planeta tras volver de un
 * proyecto): `freeAfterExit` produce un `'free'` con cooldown; la fase
 * `'free'` de `stepOrbit` respeta ese cooldown y NO recaptura mientras dure,
 * aunque la nave siga dentro de la esfera de influencia del mismo planeta.
 */

export type OrbitPhase = 'free' | 'orbiting' | 'ejecting';

export interface OrbitState {
  phase: OrbitPhase;
  /** Segundos restantes de bloqueo de recaptura (en 'ejecting' tras salir, o
   * en 'free' tras volver de un proyecto — ver `freeAfterExit`, S6). */
  cooldown: number;
}

export interface OrbitInput {
  insideInfluence: boolean;
  /** Tecla/botón "Entrar" (E / HUD). */
  enterPressed: boolean;
  /** Tecla/botón "Salir de la órbita" (S5: tecla S / botón "Salir" del HUD). */
  exitPressed: boolean;
  dt: number;
}

export interface OrbitParams {
  /** Tiempo sin recaptura tras expulsar o volver de un proyecto (S6). */
  cooldownDuration: number;
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
 * - `free`: si `cooldown>0` lo descuenta y NO recaptura aunque esté dentro de
 *   la influencia (S6). Con cooldown agotado, entra en órbita al cruzar la esfera.
 * - `orbiting`: `enterPressed` entra (acción `enter`, gana si además hay
 *   `exitPressed`); `exitPressed` sale (acción `eject` → `ejecting`); salir de
 *   la influencia por alejamiento vuelve a `free`. El empuje NUNCA expulsa (S5).
 * - `ejecting`: descuenta el cooldown hasta volver a `free`.
 */
export function stepOrbit(prev: OrbitState, input: OrbitInput, params: OrbitParams): OrbitResult {
  const { insideInfluence, enterPressed, exitPressed, dt } = input;

  if (prev.phase === 'ejecting') {
    const cooldown = prev.cooldown - dt;
    if (cooldown > 0) return { state: { phase: 'ejecting', cooldown }, action: 'none' };
    return { state: { phase: 'free', cooldown: 0 }, action: 'none' };
  }

  if (prev.phase === 'orbiting') {
    if (enterPressed) return { state: prev, action: 'enter' };
    if (exitPressed) {
      return { state: { phase: 'ejecting', cooldown: params.cooldownDuration }, action: 'eject' };
    }
    if (!insideInfluence) return { state: { phase: 'free', cooldown: 0 }, action: 'none' };
    return { state: prev, action: 'none' };
  }

  // free
  if (prev.cooldown > 0) {
    const cooldown = Math.max(0, prev.cooldown - dt);
    // Si el cooldown se agota EN ESTE MISMO frame y ya está dentro de
    // influencia, recaptura de inmediato (sin esperar un frame extra).
    if (cooldown <= 0 && insideInfluence) {
      return { state: { phase: 'orbiting', cooldown: 0 }, action: 'none' };
    }
    return { state: { phase: 'free', cooldown }, action: 'none' };
  }
  if (insideInfluence) {
    return { state: { phase: 'orbiting', cooldown: 0 }, action: 'none' };
  }
  return { state: prev, action: 'none' };
}

/** Estado tras salir de un proyecto o al reanudar (S6, arregla Bug B): vuelo
 * libre con cooldown anti-recaptura del mismo planeta. */
export function freeAfterExit(params: OrbitParams): OrbitState {
  return { phase: 'free', cooldown: params.cooldownDuration };
}

/** Velocidad de expulsión: dirección radial centro→nave, normalizada y escalada por `strength`. */
export function ejectVelocity(center: V3, ship: V3, strength: number): V3 {
  const dx = ship.x - center.x;
  const dy = ship.y - center.y;
  const dz = ship.z - center.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return { x: 0, y: strength, z: 0 };
  const k = strength / len;
  return { x: dx * k, y: dy * k, z: dz * k };
}
