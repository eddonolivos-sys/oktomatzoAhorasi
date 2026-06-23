/**
 * Configuración centralizada del espacio 3D — "variables generales" afinables,
 * estructuradas por subsistema. Fuente única de verdad; cada mejora del bloque
 * añade aquí su propia sección.
 *
 * Convención de marcado por parámetro (en comentario):
 *  - [UNIFORME]          igual para todos los clientes; se cambia SOLO aquí.
 *  - [PERSONALIZABLE #5] candidato a exponerse en el menú de configuración (mejora #5).
 *                        Por ahora es constante; #5 decidirá su ajuste en vivo y persistencia.
 */

/** Campo estelar de fondo / haces de luz (mejora #7). */
export const STAR_FIELD_CONFIG = {
  // ── Densidad / streaming ──
  starsPerChunk: 12, // [PERSONALIZABLE #5] estrellas por celda (antes 16)
  sizeBounds: [0.5, 1.6] as [number, number], // [UNIFORME] rango de tamaño del sprite

  // ── Paleta cálida (coherente con el sol Ramatzo) ──
  palette: [0xffe4c4, 0xff8c42, 0xd43a1a], // [UNIFORME] crema / ámbar / rojo
  paletteThresholds: [0.6, 0.8], // [UNIFORME] crema < 0.6, ámbar < 0.8, resto rojo

  // ── Forma de la cruz (fragment shader) ──
  coreFalloff: 16.0, // [UNIFORME] nitidez del núcleo (mayor = núcleo más pequeño)
  spikeAlong: 3.0, // [UNIFORME] caída a lo largo de la espiga (menor = espiga más larga)
  spikeAcross: 30.0, // [UNIFORME] caída transversal de la espiga (mayor = espiga más fina)
  spikeIntensity: 0.6, // [UNIFORME] brillo de las espigas relativo al núcleo
  baseAlpha: 0.9, // [UNIFORME] alfa base del sprite

  // ── Parpadeo (independiente por estrella) ──
  flickerAmplitude: 0.15, // [PERSONALIZABLE #5] amplitud (0 = sin parpadeo)
  flickerBase: 0.85, // [UNIFORME] brillo base (base + amplitud ≈ 1.0)
  flickerSpeedMin: 0.3, // [UNIFORME] velocidad mínima de parpadeo (rad/s)
  flickerSpeedMax: 0.8, // [UNIFORME] velocidad máxima de parpadeo (rad/s)
};
