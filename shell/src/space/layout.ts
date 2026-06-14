/**
 * Lógica pura del espacio (sin Three.js, testeable con Vitest):
 * cálculo de sector, math de chunks y layout de constelaciones.
 */

/** Sector de navegación a partir de una posición de mundo. */
export function sectorOf(x: number, z: number, size = 50): { sx: number; sz: number } {
  return { sx: Math.floor(x / size), sz: Math.floor(z / size) };
}
