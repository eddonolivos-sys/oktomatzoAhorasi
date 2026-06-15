/**
 * Máquina de estados de permanencia (dwell), lógica pura sin Three.js.
 * Acumula tiempo mientras la nave está dentro de la esfera de influencia de un
 * planeta; al cruzar `threshold` emite `entered` una sola vez (latch) y, al
 * salir, reinicia el contador para poder volver a entrar.
 *
 * `state` es inmutable de entrada: cada paso devuelve un nuevo `state`.
 */
export interface DwellState {
  inside: boolean;
  elapsed: number;
}

/** Marca interna: ya se emitió `entered` en este periodo dentro de la esfera. */
interface InternalDwellState extends DwellState {
  fired?: boolean;
}

export function dwellStep(
  state: DwellState,
  inside: boolean,
  dt: number,
  threshold: number,
): { state: DwellState; progress: number; entered: boolean } {
  const prev = state as InternalDwellState;

  if (!inside) {
    // Fuera de la esfera: reinicia el periodo.
    return { state: { inside: false, elapsed: 0 }, progress: 0, entered: false };
  }

  const elapsed = prev.elapsed + Math.max(0, dt);
  const reached = elapsed >= threshold;
  const entered = reached && !prev.fired;
  const next: InternalDwellState = { inside: true, elapsed, fired: prev.fired || reached };
  const progress = threshold > 0 ? Math.min(1, elapsed / threshold) : 1;
  return { state: next, progress, entered };
}
