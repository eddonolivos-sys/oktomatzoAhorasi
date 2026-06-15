/**
 * Lógica PURA del radar 3D holográfico (sin Three.js, testeable con Vitest en
 * entorno node, patrón de layout.ts). Proyecta rumbo (XZ → disco rotado por yaw)
 * y elevación (poste de altitud con signo de chevron).
 */

/**
 * Proyecta un offset relativo en el plano XZ (relX, relZ) al disco 2D del radar.
 * El ángulo se rota por `yaw` para que la dirección de la nave quede "arriba".
 * Devuelve el offset en píxeles {x,y} desde el centro del disco y `onDisc`:
 * - dentro del rango → escala lineal, onDisc=true.
 * - más allá del rango → fijado al borde (radio = discRadius), onDisc=false
 *   (sirve como puntero de rumbo).
 */
export function bearingToDisc(
  relX: number,
  relZ: number,
  yaw: number,
  range: number,
  discRadius: number,
): { x: number; y: number; onDisc: boolean } {
  const dist = Math.hypot(relX, relZ);
  const angle = Math.atan2(relZ, relX) - yaw;
  const onDisc = dist <= range;
  const rPix = onDisc ? (dist / range) * discRadius : discRadius;
  return {
    x: Math.cos(angle) * rPix,
    y: Math.sin(angle) * rPix,
    onDisc,
  };
}
