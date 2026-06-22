/**
 * Selección PURA (sin Three.js) del arquetipo visual de un planeta a partir de
 * su semilla. Determinista: misma semilla → mismo arquetipo. Mantenida aparte
 * de `planet.ts` para poder testearla en entorno node con Vitest.
 *
 * Arquetipos (ver `planet.ts` para su render):
 *   0 Terrestre   — océano/tierra/hielo (estilo Tierra).
 *   1 Desértico   — ocres y marrones, dunas/cráteres sutiles.
 *   2 Helado      — blancos/azul pálido, grietas.
 *   3 Volcánico   — basalto oscuro con vetas de magma emisivas (controladas).
 *   4 Gigante gaseoso — bandas de nubes en deriva.
 *   5 Lunar/baldío — gris, cráteres, sin atmósfera.
 */
export const ARCHETYPE_COUNT = 6;

export const Archetype = {
  Terrestrial: 0,
  Desert: 1,
  Ice: 2,
  Volcanic: 3,
  GasGiant: 4,
  Barren: 5,
} as const;

/**
 * Índice de arquetipo estable en [0, ARCHETYPE_COUNT). Se mezcla la semilla con
 * un hash entero (xorshift / multiplicación) para que índices de app cercanos
 * (1,2,3…) no caigan siempre en el mismo arquetipo.
 */
export function planetArchetype(seed: number): number {
  let h = Math.abs(Math.floor(seed)) >>> 0;
  // Mezcla tipo "integer hash" (variante de Wang/xorshift) para descorrelacionar.
  h = (h ^ 61) ^ (h >>> 16);
  h = (h + (h << 3)) >>> 0;
  h = h ^ (h >>> 4);
  h = Math.imul(h, 0x27d4eb2d) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h % ARCHETYPE_COUNT;
}
