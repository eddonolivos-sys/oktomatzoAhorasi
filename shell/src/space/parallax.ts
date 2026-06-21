/** Punto en espacio 3D como objeto plano (sin Three.js) para test en node. */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Desplazamiento que debe aplicar una capa de fondo para producir parallax.
 *
 * @param playerPos posicion del jugador (de `ShipState.position`).
 * @param factor    fraccion de seguimiento en [0,1] (se clampa):
 *                  0 = capa totalmente fija en el origen del mundo;
 *                  1 = capa pegada al jugador (sin parallax aparente).
 * @returns offset {x,y,z} = playerPos * factor por eje.
 */
export function parallaxOffset(playerPos: Vec3Like, factor: number): Vec3Like {
  const f = Math.max(0, Math.min(1, factor));
  // `+ 0` normaliza el `-0` que produce `n * 0` cuando n es negativo, para que
  // el origen sea siempre `+0` (igualdad estricta limpia en consumidores/tests).
  return {
    x: playerPos.x * f + 0,
    y: playerPos.y * f + 0,
    z: playerPos.z * f + 0,
  };
}
