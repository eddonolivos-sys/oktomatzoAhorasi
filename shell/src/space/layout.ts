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
