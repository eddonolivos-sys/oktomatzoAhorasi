/**
 * Lógica pura (sin Three.js) del ciclo de ensamblado del cinturón "RAMATZO".
 *
 * El cinturón alterna entre estar disperso (asteroides repartidos por un gran
 * volumen) y ensamblado (asteroides convergen para formar la palabra). Esta
 * función describe ese ciclo como un único factor a(t) ∈ [0,1]:
 *
 *   0 → totalmente disperso        1 → palabra completamente formada
 *
 * El periodo se divide en cuatro fases consecutivas, en fracciones del periodo:
 *
 *   scatter   (disperso, a≈0)   ── la mayor parte del ciclo
 *   converge  (0 → 1)           ── los asteroides se juntan
 *   hold      (a≈1)             ── la palabra se mantiene legible unos segundos
 *   disperse  (1 → 0)           ── los asteroides se separan de nuevo
 *
 * Es determinista, continua y acotada en [0,1]. La verificación por TDD vive en
 * `asteroids-anim.test.ts` (entorno node, sin DOM). El muestreo de glifos por
 * canvas vive en `asteroids.ts` y se valida vía build (necesita el DOM).
 */

/** Fracciones del periodo dedicadas a cada fase. Suman 1. */
const SCATTER_FRAC = 0.45; // disperso (la mayor parte del ciclo)
const CONVERGE_FRAC = 0.18; // juntándose
const HOLD_FRAC = 0.19; // palabra formada y legible
const DISPERSE_FRAC = 0.18; // separándose

/** Suavizado smoothstep (C¹ continuo) usado en las transiciones. */
function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Factor cíclico de ensamblado a(t) ∈ [0,1].
 *
 * @param t      tiempo (segundos); cualquier valor finito, también negativo.
 * @param period duración de un ciclo completo en segundos (> 0).
 * @returns      0 disperso … 1 palabra ensamblada. Continuo y determinista.
 */
export function assemblyFactor(t: number, period: number): number {
  if (!(period > 0) || !Number.isFinite(t)) return 0;

  // Fase normalizada del ciclo en [0,1) (maneja t negativo con módulo positivo).
  const phase = ((t % period) + period) % period;
  const u = phase / period; // 0..1

  const s0 = SCATTER_FRAC;
  const s1 = s0 + CONVERGE_FRAC;
  const s2 = s1 + HOLD_FRAC;
  // s3 = s2 + DISPERSE_FRAC === 1 (por construcción).

  if (u < s0) return 0; // scatter
  if (u < s1) return smoothstep((u - s0) / CONVERGE_FRAC); // converge 0→1
  if (u < s2) return 1; // hold
  return 1 - smoothstep((u - s2) / DISPERSE_FRAC); // disperse 1→0
}

/** Exportado para tests/consumidores: fracción del ciclo en la fase "hold". */
export const HOLD_FRACTION = HOLD_FRAC;
/** Exportado para tests: instante normalizado (u∈[0,1)) en el centro del hold. */
export const HOLD_CENTER = SCATTER_FRAC + CONVERGE_FRAC + HOLD_FRAC / 2;
