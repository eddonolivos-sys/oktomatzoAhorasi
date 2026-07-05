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
  sensitivity: 0.0022, // [PERSONALIZABLE] rad de yaw/pitch por px de movimiento del ratón
  lookDamp: 12, // [PERSONALIZABLE] suavizado de paso bajo de la mirada (S7); mayor = converge más rápido
  maxLookRate: 8, // [PERSONALIZABLE] velocidad angular máx. de mirada (rad/s); recorta solo picos bruscos (S7: antes 30, casi no actuaba)
  acceleration: 700, // [PERSONALIZABLE] empuje continuo (u/s²); subido para el sistema ×5 (antes 140)
  strafeAccel: 450, // [PERSONALIZABLE] aceleración lateral A/D (antes 90)
  nitroMultiplier: 6, // [PERSONALIZABLE] multiplicador de empuje con Shift
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
  influenceFactor: 3, // [UNIFORME] gatillo de aproximación/captura (S2: recalibrado de 8 a 3 — el rango era excesivo; compensado por el aviso de ORBIT_CONFIG.approachHintFactor)
  orbitSpeedScale: 0.3, // [UNIFORME] factor de velocidad de traslación orbital (planetas más lentos = más fáciles de alcanzar)

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

/** Cámara de persecución (mejora #4: más cercana) y de composición orbital (S4). */
export const CAMERA_CONFIG = {
  chaseOffset: { x: 0, y: 5, z: 16 }, // [PERSONALIZABLE] offset detrás/arriba de la nave (Hito 4: más cercana; antes 0,7,24; antes de eso 0,9,34)
  orbit: {
    distanceFactor: 5, // [PERSONALIZABLE] distancia cámara↔planeta, como múltiplo de planetRadius
    targetSunBias: 0.4, // [PERSONALIZABLE] desplaza el target hacia el sol (fracción de planetRadius); deja aire en el encuadre
    easeSeconds: 0.6, // [PERSONALIZABLE] constante de tiempo de la transición persecución↔órbita
  },
};

/** Interacción orbital al aproximarse a un planeta (mejora #3, revisada en Hito 1 S5). */
export const ORBIT_CONFIG = {
  angularSpeed: 0.5, // [PERSONALIZABLE] rad/s de la órbita del satélite (~12.6 s por vuelta)
  ejectStrength: 900, // [UNIFORME] velocidad del impulso radial al salir (u/s); afinable
  ejectCooldownSeconds: 1.0, // [UNIFORME] tiempo sin recaptura tras salir de la órbita o volver de un proyecto (S5/S6)
  approachHintFactor: 6, // [UNIFORME] radio de AVISO en el HUD (S2), múltiplo de planetRadius; > influenceFactor, solo aviso, no captura
};

/**
 * Instrumentación y presupuestos de rendimiento (Hito 0 — base de la puerta de
 * latencia de los Hitos 5/6). Umbrales sobre el delta CRUDO (antes del clamp
 * del loop) y sobre el RTT del WebSocket de `/space-ws`.
 */
export const PERF_CONFIG = {
  frameWindowSize: 300, // [UNIFORME] muestras en el ring buffer de frame times (~5s a 60fps)
  rttEwmaAlpha: 0.2, // [UNIFORME] suavizado exponencial del RTT ping/pong
  pingIntervalMs: 2000, // [UNIFORME] periodo de envío de {type:'ping'} para medir RTT
  p95BudgetMultiplierRace: 1.2, // [UNIFORME] Hito 5: p95 en carrera <= baseline * este factor
  p95BudgetMultiplierRooms: 1.25, // [UNIFORME] Hito 6: p95 con 4+ naves remotas <= baseline * este factor
  rttP95BudgetMs: 120, // [UNIFORME] Hito 6: RTT p95 objetivo en LAN/local
  minSustainedFps: 30, // [UNIFORME] FPS mínimos sostenidos (con degradación de pixelRatio ya registrada)
};

/** Audio global y por proyecto (Hito 3). */
export const AUDIO_CONFIG = {
  defaultMasterVolume: 0.8, // [PERSONALIZABLE] volumen inicial si no hay nada persistido
  thrusterSpeedRef: 2500, // [PERSONALIZABLE] u/s a la que el propulsor satura su gain (thrusterGain)
  duckLevel: 0.2, // [UNIFORME] a qué fracción de volumen queda la música al entrar en cabina
  duckDamp: 8, // [UNIFORME] velocidad de la transición de ducking (mayor = más rápida)
};

/** Pista de carreras espacial (Hito 5). Landmark nativo, fuera del app-registry. */
export const RACE_CONFIG = {
  enabled: true, // [UNIFORME] kill-switch: apaga la zona sin revertir código
  trackSeed: 1337, // [PERSONALIZABLE] semilla del circuito
  center: { x: 0, y: 4000, z: 70000 }, // [UNIFORME] lejos del clúster de planetas y del cinturón
  zoneRadius: 3000, // [UNIFORME] radio de detección para el prompt "Pulsa E"
  checkpointCount: 10, // [PERSONALIZABLE] nº de waypoints del circuito
  baseRadius: 2200, // [PERSONALIZABLE] radio medio del circuito
  radiusJitter: 0.4, // [PERSONALIZABLE] variación de radio por checkpoint (fracción de baseRadius)
  heightJitter: 600, // [PERSONALIZABLE] variación de altura por checkpoint (unidades)
  checkpointRadius: 220, // [UNIFORME] distancia para considerar "alcanzado" un checkpoint
  offTrackToleranceDistance: 450, // [PERSONALIZABLE] distancia al segmento más cercano antes de "fuera de pista"
  offTrackRespawnSeconds: 4, // [PERSONALIZABLE] segundos fuera de pista antes de respawnear
  totalLaps: 2, // [PERSONALIZABLE] vueltas para terminar la carrera
  asteroidCount: 14, // [PERSONALIZABLE] obstáculos móviles con colisión (bajar si falla la puerta de rendimiento)
  asteroidRadius: 90, // [UNIFORME] radio de colisión de cada asteroide
  shipCollisionRadius: 2.5, // [UNIFORME] radio de colisión de la nave
  gateRadius: 900, // [UNIFORME] radio de las 2 esferas "planetas masivos" decorativas
  collisionBrakeFactor: 0.15, // [UNIFORME] multiplicador de velocidad al colisionar con un asteroide
};

/** Salas multijugador con host (Hito 6). */
export const ROOMS_CONFIG = {
  enabled: true, // [UNIFORME] kill-switch, mismo patrón que RACE_CONFIG.enabled
  countdownSeconds: 3, // [PERSONALIZABLE] cuenta atrás local tras el flip lobby->racing
  startLineSpacing: 60, // [UNIFORME] separación lateral entre naves en la parrilla de salida
  roomCodeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // [UNIFORME] sin 0/O/1/I (ambiguos)
  roomCodeLength: 4, // [UNIFORME]
  roomsListRefreshMs: 2000, // [UNIFORME] refresco del listado mientras el panel está abierto
};
