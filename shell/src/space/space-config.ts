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

/** Control de vuelo / mirada del jugador (mejora #1). */
export const CONTROL_CONFIG = {
  sensitivity: 0.0022, // [PERSONALIZABLE #5] rad de yaw/pitch por px de movimiento del ratón
  maxLookRate: 30, // [PERSONALIZABLE #5] velocidad angular máx. de mirada (rad/s); recorta solo picos bruscos
};

/**
 * Escala global del sistema solar (mejora #2). Un único factor del que DERIVAN
 * órbitas, radar, niebla, luz del sol, spawn y la ubicación del cinturón.
 * Cambiar este número reescala el mundo de forma coherente.
 */
const SOLAR_SCALE = 5;

/** Sistema solar y cuerpos (mejora #2 escala + mejora #4 planetas). */
export const SOLAR_CONFIG = {
  scale: SOLAR_SCALE, // [UNIFORME] factor de escala (×5 sobre la base compacta 1200–6000)

  // Planetas (#4: +20% visual; NO se escala ×scale → de ahí la vastedad)
  planetMin: 120 * 1.2, // [UNIFORME] 144
  planetMax: 260 * 1.2, // [UNIFORME] 312
  influenceFactor: 4, // [UNIFORME] gatillo de aproximación; PROVISIONAL — #3 redefine la captura

  // Sol (crece con el sistema)
  sunRadius: 340 * SOLAR_SCALE, // [UNIFORME] 1700
  sunLightDistance: 7500 * SOLAR_SCALE, // [UNIFORME] 37500
  sunLightIntensity: 3.6, // [UNIFORME]
  sunLightDecay: 1.5, // [UNIFORME]

  // Radar (el sistema entero cabe en el disco)
  radarRange: 6000 * SOLAR_SCALE, // [UNIFORME] 30000
  radarAltScale: 0.012 / SOLAR_SCALE, // [UNIFORME] 0.0024 (Y orbital ×5 → poste recalibrado)

  // Niebla / spawn (el sistema siempre nítido)
  fogNear: 55000, // [UNIFORME]
  fogFar: 110000, // [UNIFORME] = camera.far
  spawn: { x: 0, y: 120 * SOLAR_SCALE, z: 2600 * SOLAR_SCALE }, // [UNIFORME] (0, 600, 13000)

  // Cinturón RAMATZO (periferia, opción A: banner lejano −Z)
  ramatzoCenter: { x: 0, y: 3000, z: -45000 }, // [UNIFORME]
  ramatzoInnerRadius: 3400 * SOLAR_SCALE, // [UNIFORME] 17000
  ramatzoOuterRadius: 4400 * SOLAR_SCALE, // [UNIFORME] 22000
};

/** Cámara de persecución (mejora #4: más cercana). */
export const CAMERA_CONFIG = {
  chaseOffset: { x: 0, y: 7, z: 24 }, // [PERSONALIZABLE #5] offset detrás/arriba de la nave (antes 0,9,34)
};

/** Interacción orbital al aproximarse a un planeta (mejora #3). */
export const ORBIT_CONFIG = {
  angularSpeed: 0.5, // [PERSONALIZABLE #5] rad/s de la órbita del satélite (~12.6 s por vuelta)
  ejectStrength: 900, // [UNIFORME] velocidad del impulso radial de expulsión (u/s); afinable
  ejectCooldownSeconds: 1.0, // [UNIFORME] tiempo sin recaptura tras expulsar
  captureGraceSeconds: 0.5, // [UNIFORME] gracia tras capturar: ignora el empuje un instante (no auto-expulsa al llegar con W); pasada la gracia, mantener empuje expulsa (no quedarse atrapado)
};
