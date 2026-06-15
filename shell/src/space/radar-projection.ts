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

/**
 * Poste de altitud del radar: traduce la diferencia de altura relativa
 * `relY = blip.y - ship.y` a la longitud del stem vertical (∝ |relY| * scale,
 * acotada a maxLen) y al signo del chevron:
 *   +1 ▲ (encima), -1 ▼ (debajo), 0 (mismo nivel, sin poste).
 * Banda muerta de 1 unidad de altura para evitar parpadeo del chevron.
 */
export function elevationStalk(
  relY: number,
  scale: number,
  maxLen: number,
): { len: number; sign: -1 | 0 | 1 } {
  const DEAD_ZONE = 1;
  if (Math.abs(relY) <= DEAD_ZONE) return { len: 0, sign: 0 };
  const sign: -1 | 1 = relY > 0 ? 1 : -1;
  const len = Math.min(Math.abs(relY) * scale, maxLen);
  return { len, sign };
}
