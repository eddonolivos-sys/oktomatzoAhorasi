/**
 * Lógica pura de audio (sin WebAudio), testeable con Vitest. Hito 3.
 */

/**
 * Gain del propulsor a partir de la velocidad (0 en reposo, satura en 1 a
 * `speedRef` u/s). Curva raíz cuadrada: sube rápido a baja velocidad (el
 * propulsor "se nota" enseguida) y satura suave cerca del tope.
 */
export function thrusterGain(speed: number, speedRef: number): number {
  if (speedRef <= 0) return 0;
  const norm = Math.max(0, Math.min(1, speed / speedRef));
  return Math.sqrt(norm);
}

/**
 * Ducking (atenuación) de la música global al entrar/salir de la cabina de un
 * proyecto: paso bajo exponencial (mismo patrón que `dampedFollow` de
 * flight-math.ts) hacia `duckLevel` (en cabina) o `1` (fuera). Nunca produce
 * NaN ni overshoot; estable con `delta` variable.
 */
export function duckingGain(
  current: number,
  inCockpit: boolean,
  duckLevel: number,
  damp: number,
  delta: number,
): number {
  const target = inCockpit ? duckLevel : 1;
  return current + (target - current) * (1 - Math.exp(-damp * delta));
}
