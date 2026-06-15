/**
 * Lógica pura de vuelo (sin Three.js, testeable con Vitest en entorno node),
 * siguiendo el patrón de layout.ts. Estas funciones se consumen desde
 * ship-controller.ts y solar-system.ts.
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
