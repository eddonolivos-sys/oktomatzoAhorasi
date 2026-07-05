import { sub, normalize, type V3 } from './vec3-math';

/**
 * Posición de la parrilla de salida (Hito 6): un punto junto a `waypoints[0]`,
 * desplazado `slotIndex * spacing` a lo largo de la perpendicular (plano XZ) a
 * la dirección de viaje inicial `waypoints[0]->waypoints[1]`. `slotIndex`
 * puede ser negativo para repartir naves a ambos lados de la línea de salida.
 * Con menos de 2 waypoints no hay dirección de viaje que perpendicularizar:
 * devuelve `waypoints[0]` (o el origen si la lista está vacía) sin desplazar.
 */
export function startingSlotPosition(waypoints: V3[], slotIndex: number, spacing: number): V3 {
  const start = waypoints[0];
  if (!start) return { x: 0, y: 0, z: 0 };
  const next = waypoints[1];
  if (!next) return { ...start };

  const dir = sub(next, start);
  // Perpendicular en el plano XZ (rotación de 90° alrededor de Y); altura fija
  // porque la parrilla es plana (no desplaza en Y).
  const flatDir = normalize({ x: dir.x, y: 0, z: dir.z });
  const perp = { x: -flatDir.z, y: 0, z: flatDir.x };

  return {
    x: start.x + perp.x * slotIndex * spacing,
    y: start.y,
    z: start.z + perp.z * slotIndex * spacing,
  };
}
