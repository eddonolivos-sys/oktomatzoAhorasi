/**
 * Lógica pura del espacio (sin Three.js, testeable con Vitest):
 * cálculo de sector, math de chunks y layout de constelaciones.
 */

/** Sector de navegación a partir de una posición de mundo. */
export function sectorOf(x: number, z: number, size = 50): { sx: number; sz: number } {
  return { sx: Math.floor(x / size), sz: Math.floor(z / size) };
}

// ── Math de chunks (streaming del campo estelar) ──

/** Índice de celda en un eje. */
export function chunkCoord(v: number, size: number): number {
  return Math.floor(v / size);
}

/** Clave estable de una celda. */
export function chunkKey(cx: number, cy: number, cz: number): string {
  return `${cx}_${cy}_${cz}`;
}

/** Hash determinista y positivo de una celda (semilla del contenido). */
export function hashChunk(cx: number, cy: number, cz: number): number {
  let h = (cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791);
  h = h >>> 0;
  return h || 1;
}

/** PRNG determinista (Park-Miller) en [0, 1). */
export function seededRng(seed: number): () => number {
  let s = Math.floor(seed) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Claves de las celdas dentro del radio r (en celdas) alrededor de (cx,cy,cz). */
export function neededChunkKeys(cx: number, cy: number, cz: number, r: number): string[] {
  const keys: string[] = [];
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++)
      for (let dz = -r; dz <= r; dz++) keys.push(chunkKey(cx + dx, cy + dy, cz + dz));
  return keys;
}

// ── Layout de constelaciones (derivado del app-registry) ──

const CATEGORY_COLORS: Record<string, number> = {
  Analítica: 0xd4a84b,
  Herramientas: 0xc84b31,
  Juegos: 0xd43a1a,
  Sistema: 0x6b8a3a,
  Pruebas: 0x5a4a3a,
};

const FALLBACK_COLORS = [0xe6a817, 0xff6b35, 0x8b7a5a, 0xb86a3a] as const;

/** Color cálido por categoría; determinista para categorías nuevas. */
export function colorForCategory(category: string | undefined): number {
  if (category && CATEGORY_COLORS[category] !== undefined) return CATEGORY_COLORS[category]!;
  let h = 0;
  for (const ch of category ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[h % 4]!;
}

/**
 * Posición de la constelación N: dispersa en 3D hacia -Z (frente al spawn) y
 * progresivamente más lejana, para una galaxia amplia que se recorre volando.
 * Distribución por ángulo áureo para que no se alineen.
 */
export function constellationPosition(index: number): { x: number; y: number; z: number } {
  const golden = 2.399963267; // ángulo áureo (rad)
  const a = index * golden;
  const dist = 8000 + index * 7000;
  return {
    x: Math.cos(a) * dist * 0.6,
    y: Math.sin(a * 0.7) * dist * 0.2,
    z: -2500 - dist,
  };
}
