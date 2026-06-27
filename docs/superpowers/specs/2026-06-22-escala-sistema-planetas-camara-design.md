# Spec — Cluster A: #2 Escala del sistema solar + #4 Planetas y cámara

- **Fecha:** 2026-06-22
- **Rama:** `ramatzo`
- **Bloque:** 2 (7 mejoras). Orden: 7 → 1 → **2 → 4** → 3 → 5 → 6 (#7 y #1 ya code-complete).
- **Alcance:** sistema solar y cámara de persecución en `shell/src/space/`. No toca apps, registry, cabina, multijugador, ni la galaxia/far-starfield/nebulosas de fondo.

## Contexto

Sistema heliocéntrico **compacto** (verificado en código vivo): órbitas `1200–6000` ([orbits.ts:8-9](../../../shell/src/space/orbits.ts)), planetas `120–260` con influencia `×2.5` ([solar-system.ts:41-43](../../../shell/src/space/solar-system.ts)), sol radio `340` + `PointLight(3.6, 7500, 1.5)` ([ramatzo-sun.ts:35,72](../../../shell/src/space/ramatzo-sun.ts)), radar `range=6000` fijo ([radar.ts:26](../../../shell/src/space/radar.ts)), niebla `35000–100000`, `camera.far=110000`, spawn `(0,120,2600)`, cinturón `RAMATZO` con `wordCenter` **hardcodeado** en `(0,900,-1800)` ([asteroids.ts:151](../../../shell/src/space/asteroids.ts)), `ChaseCamera` creado **sin opts** (offset `(0,9,34)`).

El usuario quiere un sistema **≥5× más separado** (más vasto) y el cinturón RAMATZO reubicado a la **periferia**; además planetas **+20%** y cámara **más cercana**.

## Decisiones (confirmadas en brainstorming)

| Eje | Decisión |
|---|---|
| Factor de escala | **×5** sobre la base compacta, proporción orbital intacta |
| Velocidad de la nave | **Sin compensar** (travesías ~5× más largas; nitro = cruce). El usuario prioriza vastedad |
| RAMATZO | **Opción A**: banner lejano hacia −Z, más allá de la órbita exterior, de cara al spawn |
| Sol | **Crece ×5** (radio 340→~1700); su luz se extiende a las órbitas exteriores |
| Planetas (#4) | **+20%** visual (120–260 → 144–312); **no** se escalan ×5 (de ahí la vastedad) |
| Cámara (#4) | **Más cercana**: offset (0,9,34) → (0,7,24); FOV base 65 sin cambio |

## Configuración centralizada

Nuevas secciones en `space-config.ts`. Un único `scale` del que **derivan** los valores acoplados (cambiar `scale` recalcula el mundo). Todos `[UNIFORME]` salvo nota.

```ts
const S = 5; // factor de escala del sistema

export const SOLAR_CONFIG = {
  scale: S,
  // Planetas (#4: +20% visual; NO se escala ×S)
  planetMin: 120 * 1.2,   // 144
  planetMax: 260 * 1.2,   // 312
  influenceFactor: 4,     // gatillo de aproximación; PROVISIONAL — #3 redefine la captura
  // Sol (crece con el sistema)
  sunRadius: 340 * S,           // 1700
  sunLightDistance: 7500 * S,   // 37500
  sunLightIntensity: 3.6,
  sunLightDecay: 1.5,
  // Radar (el sistema entero cabe en el disco)
  radarRange: 6000 * S,         // 30000
  radarAltScale: 0.012 / S,     // 0.0024 (Y orbital ×5 → poste recalibrado)
  // Niebla / spawn (el sistema siempre nítido)
  fogNear: 55000,
  fogFar: 110000,
  spawn: { x: 0, y: 120 * S, z: 2600 * S }, // (0, 600, 13000)
  // Cinturón RAMATZO (periferia, opción A)
  ramatzoCenter: { x: 0, y: 3000, z: -45000 },
  ramatzoInnerRadius: 3400 * S, // 17000
  ramatzoOuterRadius: 4400 * S, // 22000
};

export const CAMERA_CONFIG = {
  chaseOffset: { x: 0, y: 7, z: 24 }, // #4 cámara más cercana (antes 0,9,34)
};
```

`camera.far` se **mantiene en 110000**: RAMATZO queda a ~58000 del spawn (cabe) y subirlo empeoraría la precisión de profundidad (near 0.1).

## Cambios por archivo

- **[orbits.ts](../../../shell/src/space/orbits.ts):** `planetLayout(index, total, scale = 1)` → `radius = (MIN + (MAX−MIN)·f) · scale`. `inclination/phase/speed` **sin cambio** (la velocidad **angular** no escala → mismo ritmo orbital visual). Base `MIN=1200/MAX=6000` permanece como autoridad del layout.
- **[solar-system.ts](../../../shell/src/space/solar-system.ts):** `PLANET_MIN/MAX/INFLUENCE_FACTOR` se leen de `SOLAR_CONFIG`; `planetLayout(i, total, SOLAR_CONFIG.scale)`.
- **[ramatzo-sun.ts](../../../shell/src/space/ramatzo-sun.ts):** `radius` y la distancia/intensidad/decay de la `PointLight` desde `SOLAR_CONFIG`. Corrige el comentario obsoleto ("~600-3000").
- **[asteroids.ts](../../../shell/src/space/asteroids.ts):** `RamatzoBeltOptions` gana `center?: {x,y,z}` (sustituye el `wordCenter` hardcodeado, default = valor actual para no romper). Material de roca a **`fog:false`** (landmark visible de lejos, como el sol).
- **[radar.ts](../../../shell/src/space/radar.ts):** `range` y `altScale` desde `SOLAR_CONFIG` (rings a 10000/20000/30000).
- **[chase-camera.ts](../../../shell/src/space/chase-camera.ts):** sin cambios de código (ya acepta `opts.offset`).
- **[space-engine.ts](../../../shell/src/space/space-engine.ts):** `fog` (fogNear/Far), spawn de cámara y nave (`SOLAR_CONFIG.spawn`), `new ChaseCamera(camera, { offset: CAMERA_CONFIG.chaseOffset })`, `createRamatzoBelt({ count, innerRadius, outerRadius, center })` desde config. `camera.far` queda en 110000.

## Lógica pura y TDD

`planetLayout(index, total, scale)` en `orbits.ts` (Vitest, sin Three.js). Tests nuevos en `orbits.test.ts`:
1. `radius(scale=5) === radius(scale=1) × 5` para varios índices (escala lineal).
2. **Proporción preservada**: el cociente entre radios consecutivos no cambia con `scale`.
3. `speed` (velocidad angular) **independiente** de `scale` (mismo ritmo orbital).
4. `scale = 1` (default) reproduce el comportamiento actual (retrocompatibilidad: los tests existentes siguen verdes).

El resto (escena Three.js, niebla, luz, cámara, posición del cinturón) se verifica en build + dev server.

## Verificación

- `pnpm --filter @plataforma/shell test` (incluye los nuevos tests de escala).
- `pnpm --filter @plataforma/shell lint` (`tsc --noEmit`).
- `pnpm --filter @plataforma/shell build`.
- Visual: dev server (lo prueba el usuario; calibra spawn/cámara/RAMATZO/luz si hace falta).

## Riesgos y mitigaciones

- **Acoplamiento de escala** (radar/niebla/luz/spawn no se reescalan solos): mitigado con la fuente única `SOLAR_CONFIG` derivada de `scale`.
- **Aproximación más difícil** a esta escala (esfera de influencia pequeña frente a órbitas enormes): `influenceFactor` subido a 4 como provisional; **#3 reescribe la captura** (órbita automática) para el mundo grande.
- **RAMATZO fogueado** a distancia: material a `fog:false`.
- **Precisión de profundidad / clipping**: `camera.far` se mantiene; `near 0.1` y cámara a ~24u → sin clipping de la nave.

## Fuera de alcance

- Galaxia, far-starfield, nebulosas (telón de fondo; no se reescalan).
- Mecánica definitiva de captura/entrada a planeta (#3).
- Cambios de velocidad de la nave (decisión: sin compensar).
- UI del menú de configuración (#5).
