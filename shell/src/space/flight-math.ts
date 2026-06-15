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

/**
 * Factor de frenado de aproximación a un planeta.
 * 1 en (o más allá de) el borde de influenceRadius → minFactor en el núcleo (distancia 0).
 * Interpolación lineal en la fracción de profundidad dentro de la esfera.
 * Continua en el borde y acotada por minFactor.
 */
export function approachBrakeFactor(distance: number, influenceRadius: number, minFactor: number): number {
  if (influenceRadius <= 0) return 1;
  if (distance >= influenceRadius) return 1;
  const depth = Math.max(0, Math.min(1, distance / influenceRadius)); // 0 en núcleo, 1 en borde
  return minFactor + (1 - minFactor) * depth;
}
