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
 * Tasa de giro (yaw/pitch, rad/s) para mirar SIN pointer lock, a partir del
 * desplazamiento del cursor respecto al centro de la pantalla, normalizado a
 * [-1,1] por eje. Zona muerta central (estable al centrar) y respuesta cuadrática
 * hacia los bordes; se satura en `maxRate`. Convención: cursor a la derecha/abajo
 * → la vista gira a la derecha/abajo (yawRate/pitchRate negativos), coherente con
 * el modo bloqueado (donde movementX/Y positivos restan a yaw/pitch).
 */
export function lookRateFromCursor(
  dxNorm: number,
  dyNorm: number,
  deadZone: number,
  maxRate: number,
): { yawRate: number; pitchRate: number } {
  const dz = Math.max(0, Math.min(0.99, deadZone));
  const axis = (v: number): number => {
    const m = Math.abs(v);
    if (m <= dz) return 0;
    const t = Math.min(1, (m - dz) / (1 - dz)); // 0..1 fuera de la zona muerta
    return Math.sign(v) * t * t * maxRate;
  };
  // `+ 0` normaliza el caso 0 (que produce -0 al negar) a +0.
  return { yawRate: -axis(dxNorm) + 0, pitchRate: -axis(dyNorm) + 0 };
}
