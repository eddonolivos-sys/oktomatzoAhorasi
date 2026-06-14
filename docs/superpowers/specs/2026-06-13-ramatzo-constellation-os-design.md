# Especificación — Ramatzo Constellation OS v2 (Port al Shell Lit)

> **Fecha:** 2026-06-13
> **Estado:** Aprobado para implementación
> **Origen:** Port de [`docs/referencia-espacial.html`](../../referencia-espacial.html) (demo funcional, 1879 líneas) al shell Lit, integrado con el `app-registry` real y `shell-app-container`, reemplazando el dashboard post-login. Diseño visual y conceptual completo en [`docs/diseno-espacial-plan.md`](../../diseno-espacial-plan.md).

---

## 1. Objetivo y alcance

Transformar la UI post-login del shell de un dashboard clásico (topbar + sidebar + iframe) a una **experiencia 3D navegable** (galaxia, constelaciones = apps, naves, radar, cabina). El demo de referencia ya prueba toda la estética y la mecánica; este trabajo lo **moduliza** dentro de `shell/src/space/`, lo conecta a datos reales y añade el sistema de **chunks** para que el espacio vasto se maneje con eficiencia.

### Principio rector (instrucción del usuario)
> Priorizar la **interfaz gráfica** sin alterar el **funcionamiento**. No eliminar funcionalidades existentes.

### NO se toca (funcionamiento intacto)
- `shell/src/services/auth-client.ts` (auth JWT)
- `shell/src/services/protocol.ts` y `packages/shell-protocol/` (postMessage)
- `apps/**`, `backend/**`, `services/**` (módulos embebidos y backend)
- `shell/public/app-registry.yaml` (se **lee**, no se modifica)
- `shell/src/components/shell-app-container.ts` (se **reutiliza** tal cual, dentro de la cabina)

### Sí se modifica
- `shell/src/components/shell-app.ts` — post-login renderiza la experiencia espacial (reemplaza topbar/sidebar/dashboard).
- `shell/src/components/shell-login.ts` — refinamiento estético naranja/ámbar + hook de transición "ignición".
- `shell/src/styles/themes.css` — tokens `--space-*`, `--orange-*`, `--metal-*`.
- `shell/index.html` — fuentes (Cinzel, Cinzel Decorative, JetBrains Mono).
- `shell/package.json` — declarar `three@0.170.0` + `@types/three@0.170.0` (ya presentes en `node_modules` del monorepo).

### Se crea
Todo bajo `shell/src/space/` (motor agnóstico de framework) + dos componentes Lit. Ver §3.

### Fuera de alcance (por ahora)
- Selección de nave por el jugador (las 3 naves existen como decorado/NPC).
- Multijugador, persistencia de posición.
- Reescritura de cualquier app embebida.

---

## 2. Restricciones (del prompt y del proyecto)

1. Paleta naranja/ámbar/oxidado. **Sin neón ni cyan.**
2. **Sin scroll.** Navegación WASD + Space (nitro) + mouse look (Pointer Lock).
3. No cambiar la interfaz de los módulos embebidos.
4. Sin emojis ni iconos de texto; ASCII / SVG / geometría.
5. `e.preventDefault()` en Space y flechas (evitar salto/scroll).
6. Three.js **nativo** (no React Three Fiber). Carga **dinámica post-login**.

---

## 3. Arquitectura

### 3.1 División motor (vanilla) vs. capa Lit

El demo usa DOM global + `getElementById`. El shell es Lit con Shadow DOM. Meter todo el motor en Shadow DOM rompería las búsquedas del demo y complica Pointer Lock. **Decisión:** el motor es **TypeScript agnóstico** que gestiona su propio canvas y overlays *in-space* (HUD, radar, project-info) dentro de un elemento host que se le entrega, guardando **referencias** a los nodos que crea (nunca `document.getElementById`). La capa Lit solo aporta ciclo de vida, el contenedor host, los datos (`AppInfo[]`) y la **cabina** (que reutiliza `shell-app-container`).

```
┌─────────────────────────────────────────────────────────────┐
│ Lit                                                          │
│  shell-app  ──post-login──▶  <shell-space>                   │
│                                  │ host div + dynamic import │
│                                  ▼                            │
│                           SpaceEngine (vanilla)              │
│                            ├─ renderer / scene / composer    │
│                            ├─ galaxy · chunks(star-gas)      │
│                            ├─ constellations · planets       │
│                            ├─ spaceships                     │
│                            ├─ flight (WASD + pointer lock)   │
│                            └─ overlays DOM: hud · radar ·    │
│                                 project-overlay              │
│                                  │ onEnterApp(app)           │
│                                  ▼                            │
│                           <shell-cockpit>                    │
│                            └─ <shell-app-container .app>     │ ← iframe real, SIN cambios
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Flujo de interacción
1. Login → (ignición) → `<shell-space>` monta el motor; mensaje de inicio + reticula.
2. Click en canvas → Pointer Lock; WASD/mouse/Space para volar.
3. Reticula sobre una constelación + click → raycaster (centro de pantalla) → `project-overlay` con datos reales del app.
4. "Ingresar" → `onEnterApp(app)` → la capa Lit muestra `<shell-cockpit>` con `<shell-app-container .app .theme>`; el motor hace `pause()`, el radar se oculta.
5. "VOLVER AL ESPACIO" → cierra cabina, motor `resume()`, radar reaparece.
6. Logout disponible en titlebar de cabina **y** en un menú mínimo ESC del espacio.

---

## 4. Contratos de módulos (`shell/src/space/`)

Cada módulo: propósito, exports, dependencias. Diseñados para entenderse y probarse aislados.

### 4.1 `space-engine.ts` — orquestador y ciclo de vida
- **Propósito:** crear renderer/scene/cámara/luces/composer; loop con delta; resize; pausa por visibilidad; resolution scaling adaptativo; **dispose** completo (libera geometrías, materiales, texturas, render targets, listeners, contexto WebGL).
- **Exports:** `class SpaceEngine`
  - `mount(host: HTMLElement, opts: { apps: AppInfo[]; onEnterApp: (app: AppInfo) => void; onLogout: () => void }): void`
  - `pause(): void` / `resume(): void` (usado al entrar/salir de cabina y por Page Visibility)
  - `dispose(): void`
- **Depende de:** todos los subsistemas siguientes. Setup del renderer/escena/luces/bloom según demo (líneas ~642–682, 1468–1478).
- **Loop:** un solo `requestAnimationFrame`; actualiza flight, uTime compartido de shaders, órbitas de planetas, rotación de galaxia, flotación de naves, chunks, radar; `composer.render()`.
- **Resolution scaling:** si FPS medio < 25 por ~1s, baja `setPixelRatio` por pasos (2 → 1.5 → 1) y reduce `loadRadius` de chunks; recupera si FPS > 50.

### 4.2 `galaxy.ts` — fondo galáctico
- **Propósito:** 80k puntos espiral (4 brazos), shader de gas difuso, rotación lenta. Backdrop lejano.
- **Exports:** `createGalaxy(renderer): { object: THREE.Points; update(elapsed, delta): void; dispose(): void }`
- **Nota:** se reposiciona suavemente para seguir al jugador a gran escala (no se "acerca" nunca). No participa en chunks.

### 4.3 `star-gas.ts` — fábrica de campos de estrellas (gas)
- **Propósito:** material shader compartido + builder de geometría sembrada. **Base reutilizable por `chunks.ts`.**
- **Exports:**
  - `getStarGasMaterial(renderer): THREE.ShaderMaterial` (singleton; `uTime` se actualiza una vez por frame)
  - `buildStarFieldGeometry(opts: { count; sizeBounds:[number,number]; box:{min:Vec3,max:Vec3}; rng:()=>number }): THREE.BufferGeometry`
  - `createStarField(opts): THREE.Points` (conveniencia: geometría + material compartido)
- **Shader:** fragment de gas difuso del demo (líneas ~820–832). Pulsación suave por `uTime`.

### 4.4 `chunks.ts` — streaming del campo estelar (PRIORIDAD)
- **Propósito:** poblar el espacio vasto sin mantener todo en memoria. Grid 3D alrededor del jugador, carga/descarga por distancia, semilla determinista, pooling de objetos, generación amortizada.
- **Exports:** `class ChunkManager`
  - `constructor(scene, opts: { chunkSize?: Vec3=(100,100,50); loadRadius?: number=2; starsPerChunk?: number=500; maxLoadedChunks?: number=125 })`
  - `update(playerWorldPos: THREE.Vector3): void`
  - `rebase(delta: THREE.Vector3): void` (ver §5)
  - `setLoadRadius(n): void` (lo usa resolution scaling)
  - `get loadedCount(): number`
  - `dispose(): void`
- **Algoritmo:**
  - Celda actual = `floor(playerWorldPos / chunkSize)`.
  - `needed` = celdas en `±loadRadius` (cap por `maxLoadedChunks`; si excede, prioriza por cercanía y registra `console.debug` del recorte — sin truncado silencioso).
  - Faltantes → **cola de generación**; se procesan N por frame con presupuesto de tiempo (~2 ms) y/o `requestIdleCallback` cuando exista. **Fade-in** de opacidad 0→1 en ~0.5 s para evitar pop-in.
  - Semilla determinista por celda: `seed = hash(cx, cy, cz)`; mismas coords ⇒ mismas estrellas.
  - Estrellas generadas en espacio local `[0..chunkSize]`; el `Points` se ubica en `chunkWorldOrigin − worldOffset` (ver rebase).
  - **Pooling:** al descargar, el `Points` no se destruye; vuelve a un free-list y, al cargar otra celda, se **reescriben** sus atributos (`position/color/size`, `needsUpdate=true`) evitando churn de allocations. `dispose()` final libera el pool.
- **Relación con `star-gas.ts`:** usa `getStarGasMaterial` (1 material) + `buildStarFieldGeometry` por celda. La esfera estática de 4k del demo queda **superada** por el grid (mejor para vastedad).

### 4.5 `spaceships.ts` — naves prefabricadas
- **Exports:** `createShipAuriga()`, `createShipYunque()`, `createShipFlecha()`, `placeShips(scene): Ship[]` (geometría exacta del demo, líneas ~850–1170). Flotación en el loop.
- Cada nave `userData = { name, type:'ship' }`.

### 4.6 `constellations.ts` — gestor desde el registry
- **Propósito:** construir una constelación por app del `app-registry`, distribuirlas, y resolver el raycast.
- **Exports:** `class ConstellationManager`
  - `constructor(scene, apps: AppInfo[], renderer)`
  - `update(elapsed, delta): void` (uTime + órbitas de planetas)
  - `raycastFromCenter(camera): AppInfo | null` (rayo desde `(0,0)` NDC sobre los `points`)
  - `getRadarBlips(): { name; position: Vector3 }[]`
  - `rebase(delta): void`
  - `dispose(): void`
- **Layout determinista** (reemplaza el `projectData` hardcodeado del demo): pasillo a lo largo de −Z con X/Y variados, derivado de índice y categoría:
  - `z = -50 - i*45`, `x` alterna ±(25..60) por índice, `y ∈ [-3..4]`.
  - color por categoría (Analítica→`#D4A84B`, Herramientas→`#C84B31`/`#E6A817`/`#8B7A5A`, Juegos→`#D43A1A`, Sistema→`#6B8A3A`, Pruebas→`#5A4A3A`); fallback determinista por hash si aparece categoría nueva.
  - **Funciona para N apps** (no fijo en 8).

### 4.7 `constellation.ts` — una constelación
- **Exports:** `createConstellation(app: AppInfo, layout: { position; color }, renderer): THREE.Group`
- Contenido (demo ~1205–1337): 10–18 estrellas (shader points), líneas de conexión (<4u), sprite nebulosa (textura radial procedural), 1–2 planetas. `group.userData = { app, points, planets, mat, lineMat }`.

### 4.8 `planet.ts` — planeta irregular con magma
- **Exports:** `createPlanet(radius, seed, baseColor): THREE.Mesh` (esfera deformada + shader de magma con noise, líneas ~1356–1448). `userData = { orbitRadius, orbitSpeed, orbitOffset }`.
- **LOD:** `detail` (segmentos) según radio; planetas pequeños usan menos polígonos.

### 4.9 `flight.ts` — control de vuelo
- **Exports:** `class FlightController`
  - `constructor(camera, canvas, opts?)`
  - `attach(): void` / `detach(): void` (listeners: keydown/keyup, pointerlockchange, mousemove, click→requestPointerLock)
  - `update(delta): FlightState` (`{ speed, isNitro, yaw, sectorX, sectorZ }`)
  - `get isPointerLocked(): boolean`
- Física del demo (líneas ~1640–1733): velocity/accel/damping 0.97, maxSpeed 30, nitro x3, pitch/yaw vía Euler 'YXZ'. `e.preventDefault()` en Space/flechas.

### 4.10 `radar.ts` — radar 2D
- **Exports:** `class Radar { constructor(host); draw(playerPos, yaw, blips); show(); hide(); dispose(); }` (canvas 180×180 fijo arriba-izq, demo ~1484–1594). Barrido usa `Date.now()` (válido en navegador).

### 4.11 `hud.ts` — overlay HUD
- **Exports:** `class Hud { constructor(host); update(state: FlightState); setStartMessageVisible(b); dispose(); }`
- Crea: velocidad (mono, ámbar), barra nitro, coordenadas/sector, reticula, vignette, mensaje de inicio. CSS desde `space.css`.

### 4.12 `project-overlay.ts` — overlay de proyecto
- **Exports:** `class ProjectOverlay { constructor(host, { onEnter, onCancel }); show(app); hide(); dispose(); }`
- Tarjeta con borde metálico, nombre (Cinzel Decorative), categoría, descripción, botones Cancelar/Ingresar (animación scale 0.9→1).

### 4.13 `space.css` — estilos de overlays
- Tokens locales + estilos de HUD/radar/project-info/cabina portados del demo (`<style>` líneas ~11–534). Se importa por el motor (inyecta `<style>` en el host) o vía `index.html`.

### 4.14 Componentes Lit
- **`components/shell-space.ts`** — `<shell-space .apps .theme @logout>`: render-root con `<div id=host>`; en `firstUpdated` hace `await import('../space/space-engine')`, instancia y `mount`; gestiona estado `cockpitApp`; al `onEnterApp` muestra `<shell-cockpit>` y `engine.pause()`; en `disconnectedCallback` `engine.dispose()`. Render-root: light DOM (`createRenderRoot(){return this}`) para evitar fricción Shadow DOM con overlays/pointer-lock.
- **`components/shell-cockpit.ts`** — `<shell-cockpit .app .theme @back @logout>`: marco con remaches/scan-line + `<shell-app-container .app .theme>` (iframe real) + titlebar (nombre, VOLVER, logout) + panel inferior de sistemas.

---

## 5. Espacio vasto: rebase de origen (precisión)

Para evitar jitter de coma flotante lejos del origen:
- El motor mantiene `worldOffset: THREE.Vector3` (inicia en 0). La posición "real" del jugador es `camera.position + worldOffset`.
- Cuando `camera.position.length() > REBASE_THRESHOLD` (4000), se calcula `delta = camera.position` (redondeado a múltiplos de `chunkSize`), se hace `camera.position.sub(delta)`, `worldOffset.add(delta)`, y se notifica `rebase(delta)` a galaxy/chunks/constellations/ships para restar `delta` a sus posiciones de escena.
- Radar/HUD usan la posición real (`camera.position + worldOffset`) para sector/coords.
- **Aislamiento de riesgo:** el rebase es **aditivo y separable**. El streaming de chunks funciona sin él; si el rebase resultara inestable se desactiva con un flag sin perder el resto. Umbral alto ⇒ rara vez se dispara dentro del área poblada.

---

## 6. Ciclo de vida e integración con `shell-app.ts`

- Tras autenticación, en vez de topbar+sidebar+container, `render()` retorna `<shell-space .apps=${this.apps} .theme=${this.theme} @logout=${this.handleLogout}>`.
- **Carga dinámica:** `space-engine` y Three.js se importan con `import()` dentro de `<shell-space>` (no en el bundle de login).
- Se conserva `loadApps()`, `handleLogin`, `handleLogout`, detección de tema y broadcast (para el iframe de cabina).
- **Guard WebGL:** si no hay contexto WebGL, `<shell-space>` muestra una pantalla "WebGL requerido" (sin white-screen). No es el dashboard clásico (el usuario aceptó reemplazo), solo una salvaguarda.
- **Sin scroll:** `<shell-space>` fija `overflow:hidden` en el host; el motor previene scroll por teclado.

---

## 7. Transición de "ignición" (login → espacio)

Versión modesta: al `login-success`, oscurecer desde bordes + vibración CSS breve (~1.2 s) + fade a la escena ya montada con el mensaje de inicio. Implementada en `shell-login.ts`/`shell-space.ts`, sin librerías nuevas (CSS + `motion` ya disponible si conviene).

---

## 8. Estilo, tokens y tipografía

- `themes.css`: añadir bloque `--space-*`, `--orange-*`, `--metal-*`, `--text-*` (valores de §12 del plan). No se rompen los tokens `--shell-*` existentes (el login y otros componentes los usan).
- `index.html`: `<link>` a Cinzel, Cinzel Decorative, JetBrains Mono (Inter opcional).
- Fuentes mapeadas: display=Cinzel Decorative, serif=Cinzel, mono=JetBrains Mono.

---

## 9. Rendimiento y límites de seguridad

| Parámetro | Valor |
|---|---|
| pixelRatio | ≤ 2 (escala dinámica 2→1.5→1 si FPS<25) |
| maxSpeed (nitro) | 90 U/s |
| loadRadius chunks | 2 (1 en modo degradado) |
| starsPerChunk | 500 |
| maxLoadedChunks | 125 |
| REBASE_THRESHOLD | 4000 U |
| Page Visibility | pausa render al ocultar pestaña |

- Frustum culling: nativo de Three.js.
- Sombras: solo `starLight` direccional; se evalúa desactivar si pesa (no aporta tanto en escena espacial).
- `dispose()` riguroso al desmontar/logout/HMR para no filtrar contextos WebGL.

---

## 10. Desviaciones respecto al prompt (con justificación)

1. **`chunks.ts` incluido como pieza central** (no diferido) — petición explícita del usuario; unifica con `star-gas.ts`.
2. **`cockpit.ts` (vanilla) → `<shell-cockpit>` (Lit)** reutilizando `shell-app-container` — el propio prompt pide usar `shell-app-container` dentro de la cabina; evita reimplementar iframe/sandbox/estados de carga.
3. **`star-gas.ts` redefinido** como fábrica que alimenta a `chunks.ts` (en vez de esfera estática) — mejor para espacio vasto.
4. **Guard WebGL mínimo** pese a "sin fallback" — evita white-screen.
5. **Layout de constelaciones derivado del registry** (N apps), no hardcode de 8.

Ninguna desviación elimina funcionalidad existente.

---

## 11. Verificación (cómo confirmamos que funciona)

Por hito (no al final):
1. **Motor base:** `pnpm dev` en `shell/`; login; se ve galaxia + bloom, FPS estable, sin errores de consola.
2. **Vuelo:** click activa pointer lock; WASD mueve; Space sube velocidad y muestra barra nitro; HUD/coords/sector actualizan; sin scroll de página.
3. **Chunks:** volar lejos en −Z y en +X mantiene campo estelar; `loadedCount` sube/baja; sin fugas de memoria (perf monitor) ni caída de FPS sostenida.
4. **Constelaciones:** las N apps del registry aparecen como constelaciones con planetas orbitando; radar muestra blips correctos; reticula+click abre overlay con datos reales.
5. **Cabina:** "Ingresar" carga el **iframe real** del app (p. ej. dashboard React) dentro del marco; el módulo se ve y funciona igual que antes (auth token llega vía postMessage); "VOLVER" regresa al espacio.
6. **Ciclo de vida:** logout limpia el contexto WebGL (sin warnings de "too many contexts" tras varios login/logout); cambiar de pestaña pausa el render.
7. **Cross-app:** abrir cada una de las 8 apps del registry desde su constelación sin romper su interfaz.

---

## 12. Riesgos

- **Chunks + rebase:** lo más complejo; mitigado por separabilidad (§5) y fade-in/pooling.
- **Pointer Lock dentro de Lit:** mitigado usando light DOM en `<shell-space>` y canvas en el host directo.
- **Rendimiento en equipos modestos:** mitigado por resolution scaling + degradación de `loadRadius`; sin fallback clásico por decisión del usuario, pero con guard WebGL.
- **Fuga de contexto WebGL en HMR/logout:** mitigado por `dispose()` riguroso.

---

> **Siguiente paso:** plan de implementación por fases (skill writing-plans), ejecutable con verificación por hito.
