/**
 * Escala compensada por distancia (mejora 2 — "planetas siempre visibles"):
 * evita que un marcador (sprite de iniciales) subtienda menos de una fracción
 * mínima de pantalla al alejarse, aunque la niebla/el far plane sigan
 * ocultando la esfera del planeta. Pura, sin Three.js.
 */
export function markerScaleForDistance(
  baseScale: number,
  distance: number,
  fovRadians: number,
  minScreenFraction: number,
): number {
  // Alto visible del plano de cámara a `distance` (aprox. del frustum):
  // 2 * distance * tan(fov/2). Un THREE.Sprite escala 1:1 su geometría base
  // 1x1, así que `scale` en mundo ES la fracción de pantalla que ocupa
  // multiplicada por `visibleHeight`. Despejamos el mínimo que garantiza
  // `minScreenFraction` y nunca bajamos de `baseScale` (no encoge de cerca).
  const visibleHeight = 2 * Math.max(0, distance) * Math.tan(fovRadians / 2);
  const minScale = visibleHeight * minScreenFraction;
  return Math.max(baseScale, minScale);
}
