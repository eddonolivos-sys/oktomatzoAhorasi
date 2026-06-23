# Spec — Mejora #7: Haces de luz (reemplazo de las esferas de chunks)

- **Fecha:** 2026-06-22
- **Rama:** `ramatzo`
- **Bloque:** 2 (7 mejoras del espacio 3D). Orden aprobado: **7 → 1 → 2 → 4 → 3 → 5 → 6**.
- **Alcance:** solo el campo estelar de fondo del motor `shell/src/space/`. No toca apps, app-registry, cabina/iframe ni multijugador.

## Contexto

Hoy el campo estelar de fondo lo dibujan [chunks.ts](../../../shell/src/space/chunks.ts) + [star-gas.ts](../../../shell/src/space/star-gas.ts) como "esferas" de colores: point sprites (`THREE.Points`) que comparten un `ShaderMaterial` singleton. Su fragment shader pinta un **disco radial difuso** con un núcleo brillante y un **latido global** (`pulse = 0.85 + 0.15·sin(uTime·0.5 + dist·10)`), igual para todas las estrellas. La generación es por celdas (grid 3D alrededor del jugador) con pool de reuso, presupuesto por frame y rebase de origen.

El usuario quiere reemplazar las esferas por **haces/rayos de luz** con parpadeo sutil (sensación de estrellas lejanas), **manteniendo la generación por chunks** por rendimiento (es sensible a FPS).

## Decisiones (confirmadas en brainstorming)

| Eje | Decisión |
|---|---|
| Forma | Cruz de 4 puntas (espigas de difracción de estrella) |
| Orientación | Billboard (encara cámara) + **rotación aleatoria por estrella**. NO orientación 3D (rompería el modelo de `Points` → riesgo FPS) |
| Parpadeo | Sutil e **independiente por estrella** (fase + velocidad aleatorias; amplitud ~0.15 sobre 0.85) |
| Densidad | Bajar `starsPerChunk` 16 → **12** (cap 125×12 = 1500 puntos) |
| Paleta | Cálida actual (crema `#ffe4c4` / ámbar `#ff8c42` / rojo `#d43a1a`, 60/20/20) |
| Enfoque | **Fragment shader procedural + 1 atributo `aSeed` por estrella**. Sin geometría nueva, sin draw calls extra, sin tocar el streaming |

## Configuración centralizada (directiva del usuario)

Se crea un módulo único **`shell/src/space/space-config.ts`**: fuente única de las "variables generales" afinables del espacio 3D, **estructurada por subsistema**. Para #7 se puebla la sección `STAR_FIELD_CONFIG`. Las futuras mejoras (#2 escala, #4 cámara, #5 naves…) añadirán **sus propias secciones al mismo módulo** (patrón del bloque).

Convención de marcado por parámetro (en comentario):
- `[UNIFORME]` — igual para todos los clientes; se cambia **solo aquí** (estandarización máxima).
- `[PERSONALIZABLE #5]` — candidato a exponerse en el menú de configuración (mejora #5, futuro). En #7 son **solo constantes**; #5 decidirá cuáles se promueven a ajuste en vivo (uniforms / settings) y la persistencia.

```ts
// shell/src/space/space-config.ts
export const STAR_FIELD_CONFIG = {
  // ── Densidad / streaming ──
  starsPerChunk: 12,                  // [PERSONALIZABLE #5] densidad (antes 16)
  sizeBounds: [0.5, 1.6] as [number, number], // [UNIFORME] tamaño del sprite (px-ish)

  // ── Paleta cálida (coherente con el sol Ramatzo) ──
  palette: [0xffe4c4, 0xff8c42, 0xd43a1a] as const,  // [UNIFORME] crema / ámbar / rojo
  paletteThresholds: [0.6, 0.8] as const,            // [UNIFORME] crema<0.6, ámbar<0.8, resto rojo

  // ── Forma de la cruz (fragment shader) ──
  coreFalloff: 16.0,      // [UNIFORME] nitidez del núcleo (mayor = núcleo más pequeño)
  spikeAlong: 3.0,        // [UNIFORME] caída a lo largo de la espiga (menor = espiga más larga)
  spikeAcross: 30.0,      // [UNIFORME] caída transversal (mayor = espiga más fina)
  spikeIntensity: 0.6,    // [UNIFORME] brillo de las espigas relativo al núcleo
  baseAlpha: 0.9,         // [UNIFORME] alfa base del sprite

  // ── Parpadeo (independiente por estrella) ──
  flickerAmplitude: 0.15, // [PERSONALIZABLE #5] amplitud (0 = sin parpadeo)
  flickerBase: 0.85,      // [UNIFORME] brillo base (base + amplitud ≈ 1.0)
  flickerSpeedMin: 0.3,   // [UNIFORME] rad/s
  flickerSpeedMax: 0.8,   // [UNIFORME] rad/s
} as const;
```

Los valores que hoy viven dispersos se **centralizan** aquí y sus consumidores los leen del config:
- `PALETTE` (hoy en `star-gas.ts:59`) → `STAR_FIELD_CONFIG.palette` + `paletteThresholds`.
- `sizeBounds [0.5,1.6]` y `starsPerChunk 16` (hoy en `chunks.ts`) → del config.

## Arquitectura y archivos

- **`space-config.ts` (NUEVO):** `STAR_FIELD_CONFIG`. Sin dependencias de Three.js.
- **`layout.ts`:** + función **pura** `buildStarSeeds(count, rng): Float32Array` (sin Three.js). Devuelve `count` valores en `[0,1)` consumiendo el `rng` del chunk. Es el punto testeable.
- **`star-gas.ts`:**
  - `getStarGasMaterial`: reescribe vertex+fragment leyendo los parámetros de forma/parpadeo del config (inyectados en el GLSL como constantes al crear el material). Conserva `uPixelRatio`/`uTime`, `AdditiveBlending`, `depthWrite:false`.
  - `buildStarFieldGeometry`: añade el atributo `aSeed` (vía `buildStarSeeds`) y usa `palette`/`paletteThresholds` del config. Firma pública (`StarFieldOptions`, retorno) **intacta**.
  - `setStarGasTime`, `disposeStarGasMaterial`, `createStarField`: sin cambios de firma.
- **`chunks.ts`:** `starsPerChunk` por defecto y `sizeBounds` se leen de `STAR_FIELD_CONFIG` (este módulo ya es el streamer específico del campo estelar). Pool, cola, `rebase`, `dispose`, presupuesto por frame: **intactos**. **`space-engine.ts` no se toca.**
- **Test:** `buildStarSeeds` en la suite Vitest existente del math de chunks (`chunks.test.ts` o `layout.test.ts`).

## Shader (concreto; constantes desde config)

Vertex — añade `aSeed` y deriva por `varying` rotación/fase/velocidad con un hash barato (cómputo una vez por vértice):

```glsl
attribute float size;
attribute vec3 color;
attribute float aSeed;
varying vec3 vColor;
varying float vRot;     // ángulo de la cruz
varying float vPhase;   // desfase del parpadeo
varying float vSpeed;   // velocidad del parpadeo
uniform float uPixelRatio;
float hash(float n){ return fract(sin(n) * 43758.5453123); }
void main() {
  vColor = color;
  vRot   = aSeed * 6.2831853;
  vPhase = hash(aSeed * 1.7) * 6.2831853;
  vSpeed = FLICKER_SPEED_MIN + hash(aSeed * 3.1) * (FLICKER_SPEED_MAX - FLICKER_SPEED_MIN);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uPixelRatio * (80.0 / -mv.z); // billboard/tamaño igual que hoy
  gl_Position = projectionMatrix * mv;
}
```

Fragment — rota `gl_PointCoord`, dibuja núcleo + 2 espigas (cruz de 4 puntas) y aplica parpadeo:

```glsl
varying vec3 vColor;
varying float vRot, vPhase, vSpeed;
uniform float uTime;
void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float c = cos(vRot), s = sin(vRot);
  vec2 r = vec2(uv.x*c - uv.y*s, uv.x*s + uv.y*c); // ejes de la cruz, rotados por estrella
  float d = length(uv);
  float core   = exp(-d * CORE_FALLOFF);
  float spikeH = exp(-abs(r.y) * SPIKE_ACROSS) * exp(-abs(r.x) * SPIKE_ALONG);
  float spikeV = exp(-abs(r.x) * SPIKE_ACROSS) * exp(-abs(r.y) * SPIKE_ALONG);
  float beam   = core + (spikeH + spikeV) * SPIKE_INTENSITY;
  float flick  = FLICKER_BASE + FLICKER_AMPLITUDE * sin(uTime * vSpeed + vPhase);
  vec3 col = mix(vColor * 0.5, vColor * 1.25, core) * flick;
  gl_FragColor = vec4(col, clamp(beam, 0.0, 1.0) * BASE_ALPHA * flick);
}
```

(Las constantes en MAYÚSCULAS se inyectan desde `STAR_FIELD_CONFIG` al construir el material; valores exactos afinables en el dev server.)

## Determinismo

`aSeed` se siembra con el **mismo `rng` del chunk** (`seededRng(hashChunk(cx,cy,cz))`), en el mismo orden que `position`/`color`/`size`. Un chunk que se descarga y vuelve a cargar regenera **idéntico** → sin "saltos" de rotación/parpadeo al reciclar del pool. El modelo de chunks (cola, pool, `rebase`, `dispose`) no cambia.

## Rendimiento

- Densidad −25% (16→12 → cap 1500 puntos).
- La cruz (espigas finas + núcleo pequeño) ilumina **igual o menos píxeles** que el disco difuso actual → fill-rate neto neutro o mejor.
- `UnrealBloomPass` (threshold 0.6) sin cambios; el brillo del núcleo se mantiene cercano al actual para no disparar el bloom.
- Red de seguridad existente: `trackFps` (baja `pixelRatio` si avg < 25 fps).

## Lógica pura y TDD

- **Testeable (Vitest, node, sin Three.js):** `buildStarSeeds(count, rng)` →
  1. longitud = `count`;
  2. todos los valores en `[0, 1)`;
  3. determinismo: misma semilla (`seededRng(n)`) ⇒ array idéntico.
- **No testeable en unidad:** el GLSL y el aspecto visual → verificación **manual** en el dev server (arnés `debug.html` sin login, dev-only, no se commitea) + `tsc` + `vite build`.

## Verificación

- `pnpm --filter @plataforma/shell test` (Vitest, incluye el nuevo test).
- `pnpm --filter @plataforma/shell lint` (`tsc --noEmit`).
- `pnpm --filter @plataforma/shell build` (`tsc && vite build`).
- Visual: dev server / arnés (lo prueba el usuario; el 3D no se verifica del todo headless).

## Fuera de alcance

- Lógica de streaming/pool/rebase de chunks (solo cambian sus defaults vía config).
- Resto de `layout.ts`, otros subsistemas del espacio, apps/registry/cabina, multijugador.
- Orientación 3D de los haces (descartada por FPS).
- UI del menú de configuración (es la mejora #5; aquí solo se deja `space-config.ts` listo y marcado).
