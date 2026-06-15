# Rediseño de la experiencia 3D — Constellation OS v3

> **Origen:** Tras construir con Docker, la experiencia espacial post-login es inoperante: el ratón no controla la cámara, no se puede acceder a los proyectos, la nave es estática y la navegación es confusa. Este spec rediseña la **experiencia 3D** (motor en `shell/src/space/`) sobre la base existente (port de `docs/referencia-espacial.html`, ver [spec previo](2026-06-13-ramatzo-constellation-os-design.md)).
>
> **Fecha:** 2026-06-14 · **Rama:** `ramatzo`

## 1. Objetivo

Transformar el vuelo espacial post-login en una experiencia **fluida, legible y atractiva**: controles de ratón fiables, una nave que se siente como un vehículo (se inclina y reacciona), un **sistema solar** donde cada planeta es un proyecto al que se entra **atravesando su esfera**, un **radar 3D** que comunica altitud, y un menú de pausa claro que recupera el cursor.

## 2. Alcance

**Dentro:** todo el motor 3D y sus overlays — `shell/src/space/**` y los componentes Lit que lo hospedan (`shell-space`, `shell-cockpit`, HUD/menús inyectados por el motor).

**Fuera (decisión del usuario):** despliegue y build — `shell/Dockerfile`, `shell/nginx.conf`, `proxy/Caddyfile`, `deploy/docker-compose.yml`, `basePath` de apps Next.js y `sandbox` del `app-registry`. Se documentan como riesgos pero **no se tocan**.

> **Implicación operativa:** el `dist` que sirve Docker es un *bind-mount* del host y está desactualizado respecto al código. Ningún cambio de este spec será visible en Docker hasta **recompilar** (`pnpm --filter shell build`). La verificación durante el desarrollo se hace con el dev server (`vite`); el redespliegue queda a cargo del usuario.

## 3. Decisiones de diseño (acordadas)

| Decisión | Elección |
|---|---|
| Modelo de control | **Enfoque A**: la nave es una entidad en el mundo; la cámara la sigue (chase cam). |
| Estética | **Sci-fi luminoso y elegante**: auto-iluminación + emisivos, paleta fría + ámbar, bloom marcado. Sin neón chillón (mantiene la dirección de diseño sobria del proyecto). |
| Entrada a proyecto | **Permanencia (dwell ~1s)** dentro de la esfera de influencia del planeta. |
| Velocidad | **Sin límite máximo**, aceleración progresiva, con **frenado de aproximación** automático cerca de planetas + tecla de freno. |
| Layout | **Sistema solar**: planetas orbitan el sol Ramatzo en planos inclinados, escala compacta. |

## 4. Causas raíz que se corrigen (trazabilidad)

1. **Ratón:** `flight.ts:110-115` acumula `e.movementX/Y` sin pointer lock → deltas poco fiables y bloqueo en el borde de la ventana. Control 2-DOF sin roll (`flight.ts:23,35`).
2. **Acceso:** proyectos a 13k–61k u en vacío (`layout.ts:74-83`); objetivo cliqueable (cúmulo ~5 u) separado de los planetas gigantes que orbitan a 2.8k–8.8k u (`constellation.ts:170-181`); selección solo por raycast al centro exacto (`space-engine.ts:240-250`).
3. **Nave:** `update(elapsed)` sin estado de vuelo (`player-ship.ts:211`) → no puede reaccionar; atornillada a la cámara (`space-engine.ts:141-143`).
4. **Radar:** descarta el eje Y (`radar.ts:71-73`) e ignora el pitch (`radar.ts:76`).
5. **Navegación:** galaxia pegada al jugador sin parallax (`galaxy.ts:85-89`); vacíos sin referencias; sol detrás al spawnear; sin brújula ni waypoints.
6. **Menú/cursor:** el primer ESC solo libera el pointer lock (navegador) y el menú requiere un segundo ESC; volver a mirar exige clic en vacío no explicado.

## 5. Arquitectura

Subsistemas nuevos/renombrados en `shell/src/space/`:

- **`ship-controller.ts`** (evoluciona `flight.ts`) — estado y física de la nave en el mundo.
- **`chase-camera.ts`** (nuevo) — sigue a la nave con resorte y FOV dinámico.
- **`solar-system.ts`** (reemplaza `constellations.ts`/`constellation.ts`) — planetas heliocéntricos = proyectos, esferas de influencia, máquina de estados de dwell.
- **`asteroids.ts`** (nuevo) — cinturón con marca "Ramatzo".
- **`radar.ts`** (reescritura) — radar 3D holográfico.
- **`hud.ts`** + **`pause-menu.ts`** (nuevo) — HUD reactivo y menú de pausa con cursor.
- **`player-ship.ts`** (modelo nuevo + animación reactiva), `galaxy.ts`, `ramatzo-sun.ts`, `star-gas.ts`/`chunks.ts`, `space-engine.ts` (orquestación), `space.css`.

Lógica pura (sin Three.js) se concentra en funciones testeables (patrón de `layout.ts`).

### 5.1 `ship-controller.ts`

**Estado:** `position: Vector3` (con rebase de origen), `velocity: Vector3`, `quaternion`, `yaw`, `pitch`, `roll`, `speed`, `isNitro`.

**Entrada:**
- Ratón (solo con pointer lock): acumula delta → `targetYaw -= dx*sens`, `targetPitch -= dy*sens` (pitch clamp ±~85°). `yaw/pitch` siguen al target con suavizado (damp) → sin tirones.
- Teclado: `W` empuje continuo, `S`/`Shift` freno, `A/D` strafe, `Space` nitro.

**Física:** empuje a lo largo de `forward`; `velocity` integra empuje y damping; **sin `maxSpeed`** (la velocidad crece mientras se mantiene `W`). `nitro` multiplica el empuje.

**Alabeo (banking):** `targetRoll = clamp(-yawRate * kRoll, ±maxRoll)`, `roll` lerp al target; ligero cabeceo visual por `pitchRate`. El `roll` se aplica a la **orientación de la nave**, no a la cámara (la cámara no rota en roll para no marear).

**Pointer lock:** se solicita al hacer clic en el canvas o al pulsar "Tomar control"; al perderlo, la mirada se congela pero la nave conserva inercia. Contrato: `ShipState` que consumen HUD, radar y `player-ship`.

**Lógica pura testeable:** `bankFromYawRate(yawRate, k, max)`, curva de freno de aproximación, integración de velocidad.

### 5.2 `chase-camera.ts`

`desiredPos = ship.position + offset.applyQuaternion(ship.quaternion)` (detrás y arriba). `camera.position` lerp hacia `desiredPos`; `lookAt(ship.position + velocityLead)`. **FOV** interpola de base→base+kick según `speed`/nitro (sensación de velocidad). La nave deja de ser hija de la cámara (se quita `camera.add(this.playerShip.object)` de `space-engine.ts:143`); la nave se añade a la escena y la cámara la sigue.

### 5.3 `solar-system.ts`

- Un planeta por app del registry. Órbita heliocéntrica: `radius_i`, `inclination_i` (plano inclinado → uso de las 3 dimensiones), `phase_i`, `speed_i` (lento). Escala **compacta**: radios de órbita ~600–3000 u, radio de planeta ~120–260 u.
- **Esfera de influencia** por planeta: `influenceRadius ≈ planetRadius * 2.5`. El sol Ramatzo en el centro como faro.
- **Frenado de aproximación:** dentro de `influenceRadius`, factor de damping extra proporcional a la cercanía (de `1` en el borde a fuerte en el núcleo) → la nave desacelera para entrar con control.
- **Máquina de estados de dwell** (lógica pura, testeable): `idle → approaching (dentro de la esfera) → dwell timer acumula mientras dentro → enter (≥1s) | cancel (sale)`. Al `enter`: `onEnterApp(app)` (mismo contrato actual hacia `shell-space`/`shell-cockpit`).
- Sustituye el raycast al centro y el `ProjectOverlay` actual por la mecánica de proximidad.
- Expone blips para el radar con `position` completa (incluida `y`) y marca de objetivo en aproximación.

### 5.4 `asteroids.ts`

Cinturón de asteroides instanciados orbitando el sol. Un subconjunto lleva la marca **"Ramatzo"** (texto extruido o textura/decal en relieve), dando presencia de marca. Sobrio, coherente con la iluminación.

### 5.5 `radar.ts` (3D)

Entrada: posición y orientación de la nave (`yaw` + `pitch`), blips `{name, position, app}`, objetivo en aproximación.
- **Disco táctico inclinado:** proyección del plano XZ a una elipse rotada por `yaw`.
- **Postes de altitud:** stem vertical de longitud ∝ `(blip.y − ship.y)` con chevron ▲ (encima) / ▼ (debajo).
- **Anillos con distancia numérica** y escala estable (rangos fijos escalados al tamaño del sistema), no autoescala por frame.
- **Lock:** el objetivo en aproximación con corchetes + distancia; puntero de rumbo en el borde si está fuera del disco.
- Estilo holográfico ámbar/sobrio. Funciones puras testeables: proyección rumbo/elevación.

### 5.6 `hud.ts` + `pause-menu.ts`

- **HUD:** reticula con estado (`idle` / `aproximando` con **anillo de permanencia**), velocidad real (sin tope), **altitud real** (`ship.position.y + worldOffset.y`), rumbo/brújula. Se elimina el `Z … AU` engañoso. Leyenda de controles persistente y discreta.
- **`pause-menu.ts`:** un solo `ESC` abre overlay **con cursor** (`document.exitPointerLock()` + cursor visible): botones `Reanudar control`, `Controles`, `Cerrar sesión`. **Truco clave:** como el navegador procesa el primer ESC liberando el pointer lock, se escucha `pointerlockchange`; si se pierde el lock y no hay menú abierto, se interpreta como "abrir pausa" → la primera pulsación libera ratón *y* muestra el menú. `Reanudar control` vuelve a solicitar el lock. El vuelo se congela mientras el menú está visible (gate existente en `space-engine.ts:176`).
- Investigar y corregir el bug de "Skip"/deformación reproduciéndolo con el dev server (no existe en el código del shell; probablemente proviene de una app embebida o del bundle obsoleto).

### 5.7 Iluminación, realismo y entorno

- **Parallax:** `galaxy.ts` deja de recentrarse en el jugador cada frame; se coloca a transform fijo o se mueve a una fracción de la velocidad. Capa de estrellas lejanas fijas.
- **Sol Ramatzo:** colocado/orientado para ser visible al spawnear (la nave mira hacia el sistema); rango de luz que cubre el sistema compacto; etiqueta "Ramatzo".
- Nebulosas/gas redistribuidos para evitar vacíos; rim light en planetas y nave; tone mapping/bloom afinados para que la nave y los acentos destaquen.

## 6. Flujo de datos (por frame, en `space-engine.ts`)

1. `pauseMenu.visible`/cockpit → gate de entrada del `ship-controller`.
2. `ship.update(delta)` → `ShipState` (posición/orientación/velocidad/roll).
3. `chaseCamera.update(ship, delta)` → cámara.
4. `solarSystem.update(elapsed, delta, ship)` → órbitas + frenado de aproximación + máquina de dwell (puede emitir `onEnterApp`).
5. `radar.draw(ship, blips, lockTarget)`; `hud.update(shipState, dwellProgress, altitude, heading)`.
6. `playerShip.update(elapsed, shipState, delta)` (alabeo/toberas/estela).
7. `galaxy/sun/asteroids/star-gas` update; `composer.render()`.
8. `maybeRebase()` sobre la **posición de la nave** (no la cámara): rebase de origen del mundo cuando la nave se aleja del origen (preserva `worldOffset` para HUD).

## 7. Estrategia de pruebas

- **Unitarias (Vitest, lógica pura)**, patrón de `layout.test.ts`/`chunks.test.ts`:
  - `bankFromYawRate` (signo, clamp, monotonía).
  - Curva de frenado de aproximación (1 en el borde → fuerte en el núcleo; continuidad).
  - Máquina de estados de dwell (entra a ≥1s; cancela al salir; reinicia el timer).
  - Posiciones orbitales (determinismo, inclinación).
  - Proyección de radar (rumbo y elevación; signo del chevron).
  - Formato de altitud/rumbo del HUD.
- **Verificación manual (dev server + preview):** pointer lock fiable; sensación de vuelo y alabeo; entrar a un planeta (dwell → cabina); radar muestra arriba/abajo; menú de pausa recupera cursor y reanuda; iluminación y marca "Ramatzo" visibles. Repro del bug "Skip".

## 8. Riesgos y notas

- **Despliegue (fuera de alcance):** sin recompilar `shell/dist`, los cambios no se verán en Docker; además la imagen suelta del shell no enruta `/apps/*` (solo `proxy/Caddyfile` lo hace). Documentado, no corregido aquí.
- **Origen de "Skip":** desconocido hasta reproducir; puede requerir tocar una app embebida (quedaría fuera de alcance) o resolverse al recompilar.
- **Ajuste de escala** (órbitas, esferas de influencia, sensibilidad, fuerza de freno): iterativo, se calibra con el dev server.
- **Intercepción del primer ESC / pointer lock:** matices entre navegadores; se valida en Chromium (entorno objetivo).
- **Rendimiento:** mantener el escalado adaptativo de `pixelRatio` y el `dispose` riguroso existentes; la estela/asteroides instanciados deben respetar el presupuesto de partículas.

## 9. No-objetivos (YAGNI)

Sin 6DOF newtoniano completo (roll manual Q/E), sin multijugador, sin editor de naves, sin cambios de despliegue/CI, sin tocar el login ni el backend.
