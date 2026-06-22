/**
 * Lógica pura (sin Three.js) del ciclo de vida y la temporización de los cometas.
 *
 * Los cometas son destellos transitorios: nacen, cruzan el campo visible y
 * mueren. Esta lógica describe dos piezas deterministas y testeables sin DOM:
 *
 *   - `lifeProgress(age, life)` → progreso 0..1 de un cometa (0 recién nacido,
 *     1 muerto). El renderer lo usa para interpolar posición y desvanecer cola.
 *   - `makeScheduler({min,max,rng})` → decide CUÁNDO spawnear, con esperas
 *     aleatorias acotadas en [min,max]. Dirigido por un `rng` inyectable para que
 *     los tests sean reproducibles (en runtime se pasa `Math.random`).
 *
 * La verificación por TDD vive en `comets-anim.test.ts` (entorno node, sin DOM).
 * El render (geometría/material/posiciones) vive en `comets.ts` y se valida vía
 * build (necesita Three.js/WebGL).
 */

/** Estado mínimo de un cometa vivo (edad acumulada y su vida total). */
export interface CometState {
  /** Segundos transcurridos desde el spawn. */
  age: number;
  /** Duración total de la vida en segundos (> 0). */
  life: number;
}

/**
 * Progreso de vida normalizado de un cometa.
 *
 * @param age  segundos desde el spawn (se clampa a ≥ 0).
 * @param life duración total en segundos (> 0; si no, devuelve 1 = muerto).
 * @returns    0 recién nacido … 1 muerto. Monótono y acotado en [0,1].
 */
export function lifeProgress(age: number, life: number): number {
  if (!(life > 0)) return 1; // vida inválida → tratar como muerto (no renderiza)
  if (!(age > 0)) return 0; // clampa edades negativas/cero al inicio
  if (age >= life) return 1; // saturado al final
  return age / life;
}

export interface SchedulerOptions {
  /** Espera mínima entre spawns (segundos). */
  min: number;
  /** Espera máxima entre spawns (segundos). */
  max: number;
  /** Fuente de aleatoriedad 0..1 (inyectable para tests; runtime: Math.random). */
  rng: () => number;
}

export interface Scheduler {
  /**
   * Avanza el reloj `delta` segundos y devuelve `true` si toca spawnear UN
   * cometa en este tick. Como mucho un disparo por llamada (sin ráfagas aunque
   * el delta sea grande): tras disparar, reprograma la siguiente espera.
   */
  tick(delta: number): boolean;
}

/** Crea un planificador de spawns con esperas aleatorias acotadas en [min,max]. */
export function makeScheduler(opts: SchedulerOptions): Scheduler {
  const min = Math.max(0, opts.min);
  const span = Math.max(0, opts.max - min);
  const rng = opts.rng;

  const nextWait = () => min + rng() * span;

  let timer = 0;
  let wait = nextWait();

  return {
    tick(delta) {
      timer += Math.max(0, delta);
      if (timer < wait) return false;
      // Dispara UN cometa. Conserva el remanente acotado a una sola espera para
      // no producir una ráfaga si el delta fue enorme (p. ej. pestaña en 2º plano).
      timer = Math.min(timer - wait, wait);
      wait = nextWait();
      return true;
    },
  };
}
