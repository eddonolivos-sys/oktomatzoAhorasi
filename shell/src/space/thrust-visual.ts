/**
 * Lógica PURA (sin Three.js) de la animación de empuje de la nave.
 * Convierte la velocidad real (unidades/seg) en factores normalizados que el
 * modelo 3D aplica a la longitud/brillo de las toberas y a la opacidad de la
 * estela. Testeable en el entorno node de Vitest (patrón de layout.ts).
 */

/** Velocidad (u/s) a la que el empuje normal está prácticamente saturado. */
const SPEED_REF = 600;
/** Brillo/longitud mínimos en ralentí (la nave nunca está "apagada"). */
const IDLE_LENGTH = 0.18;
const IDLE_GLOW = 0.22;
/** Empujón adicional del nitro (sumado antes del clamp). */
const NITRO_BOOST = 0.3;

export interface ThrustFactors {
  /** 0..1 — longitud relativa de la llama/tobera. */
  length: number;
  /** 0..1 — intensidad emisiva relativa del núcleo. */
  glow: number;
  /** 0..1 — opacidad de la estela aditiva. */
  trailOpacity: number;
}

/**
 * Curva suave (saturante) de la velocidad a factores de empuje.
 * @param speed  velocidad real en unidades/seg (se acota a >= 0).
 * @param isNitro si el nitro está activo, añade un empujón acotado.
 */
export function thrustGlow(speed: number, isNitro: boolean): ThrustFactors {
  const v = Math.max(0, speed);
  // Saturación suave: 0 -> 0, infinito -> 1.
  const norm = v / (v + SPEED_REF);
  const boost = isNitro ? NITRO_BOOST : 0;

  const length = clamp01(IDLE_LENGTH + norm * (1 - IDLE_LENGTH) + boost);
  const glow = clamp01(IDLE_GLOW + norm * (1 - IDLE_GLOW) + boost);
  // La estela arranca en 0 (en reposo no hay estela visible) y crece con la velocidad.
  const trailOpacity = clamp01(norm + boost);

  return { length, glow, trailOpacity };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
