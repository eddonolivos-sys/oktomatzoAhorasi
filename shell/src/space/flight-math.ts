/**
 * Lógica pura de vuelo (sin Three.js, testeable con Vitest en entorno node),
 * siguiendo el patrón de layout.ts.
 */

/**
 * Alabeo (roll) objetivo a partir de la tasa de giro de yaw.
 * targetRoll = clamp(-yawRate * kRoll, ±maxRoll).
 * yawRate en rad/s; kRoll factor de inclinación; maxRoll límite en rad.
 */
export function bankFromYawRate(yawRate: number, kRoll: number, maxRoll: number): number {
  const target = -yawRate * kRoll;
  // `+ 0` normaliza el caso yawRate=0 (que produce -0) a +0.
  return Math.max(-maxRoll, Math.min(maxRoll, target)) + 0;
}

/**
 * Factor de frenado de aproximación a un planeta.
 * 1 en (o más allá de) el borde de influenceRadius → minFactor en el núcleo (distancia 0).
 * Interpolación lineal en la fracción de profundidad dentro de la esfera.
 * Continua en el borde y acotada por minFactor.
 *
 * RESERVADA para el plan del sistema solar (plan 02): aún no la consume ningún
 * llamador. `ShipController.setApproachBrake` se conectará en ese plan; hasta
 * entonces esta función y su setter quedan deliberadamente por delante de su consumidor.
 */
export function approachBrakeFactor(distance: number, influenceRadius: number, minFactor: number): number {
  if (influenceRadius <= 0) return 1;
  if (distance >= influenceRadius) return 1;
  const depth = Math.max(0, Math.min(1, distance / influenceRadius)); // 0 en núcleo, 1 en borde
  return minFactor + (1 - minFactor) * depth;
}

/**
 * Desliza `current` hacia `target` limitando el paso de este frame a `maxRate·delta`.
 * Si el salto cabe dentro del límite devuelve `target` EXACTO (mirada 1:1, sin lag);
 * si lo supera, recorta solo el exceso (amortigua el pico brusco). `maxRate` en rad/s.
 */
export function limitAngularStep(current: number, target: number, maxRate: number, delta: number): number {
  const maxStep = maxRate * delta;
  const d = target - current;
  if (d > maxStep) return current + maxStep;
  if (d < -maxStep) return current - maxStep;
  return target;
}

/**
 * Paso bajo exponencial (S7 — arregla la brusquedad de la mirada): desliza
 * `current` hacia `target` con constante `damp` (mayor = converge más rápido).
 * Estable con `delta` variable; nunca sobrepasa `target`.
 */
export function dampedFollow(current: number, target: number, damp: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-damp * delta));
}
