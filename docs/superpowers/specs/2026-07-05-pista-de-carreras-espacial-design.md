# Pista de carreras espacial (single-player) — diseño

Fecha: 2026-07-05 · Rama: `ramatzo` · Alcance: `shell/src/space/race-*.ts` (nuevos) + costura puntual en `space-engine.ts`/`hud.ts`/`space-config.ts`.

## Contexto y proceso

Hito 5 del master plan (`docs/superpowers/plans/2026-07-04-master-plan-ramatzo.md`), marcado `[SPEC PROPIO]`: exige su propio ciclo brainstorm→spec→plan antes de escribir código, a diferencia de los Hitos 1-4 que ya tenían spec cerrado de antemano.

**Nota de proceso:** esta es una sesión de ejecución autónoma continua (Hitos 1→7 sin pausas), con libertad técnica ya concedida por el usuario para decisiones de arquitecto reversibles (precedente: Hito 1, S3/S4). No hay una ronda interactiva de preguntas con el usuario en este documento — las decisiones de diseño de abajo las tomé yo, están documentadas con su justificación, y quedan abiertas a revisión por el planificador o el usuario antes o después de implementarse. Si alguna se rechaza, es aislada y reversible (no compromete el resto del hito).

El master plan YA fija el alcance y la arquitectura de alto nivel (no se cuestionan aquí, son punto de partida):
- Zona de carrera anclada a un punto LEJANO del sistema (no un planeta del app-registry — ver Decisión 1).
- Pista larga con esferas guía semitransparentes, checkpoints con respawn automático, minimapa en HUD, zonas de asteroides en movimiento, pasos entre "planetas masivos" (gates visuales).
- Lógica pura TDD en `race-track.ts` (generación paramétrica por semilla), `race-state.ts` (máquina checkpoint/respawn/vuelta), `race-math.ts` (distancia a pista/progreso); render en módulo Three separado.
- Colisión esfera-esfera simple; chequeo por SEGMENTO recorrido en el frame (no por posición puntual) para evitar tunneling, dado que la nave no tiene `maxSpeed`.
- Puerta de rendimiento: p95 frame time en carrera ≤ baseline+20% (baseline Hito 0: ~8.5 ms) y nunca <30 FPS sostenidos.
- Integración por la costura EXISTENTE de aproximación (NO envolver `enterProject` de otros planetas).

## Decisiones de diseño (mías, documentadas para revisión)

### Decisión 1 — La zona de carrera NO es un planeta del app-registry
El master plan dice "anclada a un planeta lejano", pero un planeta real del registry está ligado a un `AppInfo` (iframe de un proyecto) — mezclar eso con una carrera nativa 3D violaría "no tocar `apps/**` ni el app-registry" y crearía ambigüedad (¿qué pasa si entras al mismo tiempo al proyecto Y a la carrera?). Decisión: la carrera es un **landmark nativo independiente**, con su propio punto de anclaje en `RACE_CONFIG.center` (no aparece en `app-registry.yaml`, no tiene `AppInfo`, no es un `SolarPlanet`). Ubicación: `{ x: 0, y: 4000, z: 70000 }` — lejos del clúster de planetas (radio ≤30 000 desde el origen) y en dirección OPUESTA al cinturón Ramatzo (`ramatzoCenter.z = -45000`), para no solaparse visualmente. Sigue el mismo patrón que el propio cinturón (landmark ajeno al app-registry, ya establecido en el código).

### Decisión 2 — Detección de proximidad y entrada: prompt + tecla dedicada, sin capturar la nave
A diferencia de la órbita de planetas (que SÍ captura la nave, Hito 1), la carrera **nunca quita el control**: el jugador conserva vuelo libre en todo momento, dentro y fuera de la pista (es una carrera, no una cabina). Detección de proximidad: un radio de "zona de carrera" (`RACE_CONFIG.zoneRadius`) alrededor de `center`; dentro de él, el HUD muestra "Pulsa E para iniciar la carrera" (mismo estilo que el aviso de aproximación a planetas, pero un prompt DISTINTO — no reutiliza `ApproachInfo`/`enterProject`, que quedan intocados). Tecla dedicada: **E para iniciar** (si no está ya corriendo), **Q para abandonar** (tecla libre, no usada por ningún otro sistema — confirmado por `grep` sobre `ship-controller.ts`/`space-engine.ts`).

### Decisión 3 — Trazado: bucle cerrado (vuelta), generado por semilla con jitter radial/vertical
"Completar una vuelta" (criterio de aceptación) implica un circuito CERRADO, no un trayecto punto-a-punto. Generación determinista: N checkpoints repartidos en ángulo uniforme alrededor de `center`, con radio y altura perturbados por un PRNG (`mulberry32`, sembrado por un número) para que el circuito serpentee en 3D sin ser un círculo perfecto — mismo espíritu que `orbits.ts` (determinista, sin Three.js). El "paso entre planetas masivos" se resuelve como DOS esferas grandes decorativas (sin colisión, solo visuales) colocadas a ambos lados de un tramo del circuito, de forma que el jugador vuele "entre" ellas — no son planetas reales del sistema.

### Decisión 4 — Colisión: solo con los asteroides móviles, no con las esferas guía ni las "planetas masivos"
El master plan pide colisión esfera-esfera contra obstáculos. Alcance: SOLO los asteroides móviles (obstáculos reales) colisionan (empujón/frenado, sin daño ni "vida" — no hay ese concepto en el juego). Las esferas guía (checkpoints) y los gates visuales NO colisionan — son puramente informativos/decorativos, evita convertir la carrera en un puzzle de esquivar geometría de guía que no es su propósito. Respuesta a la colisión: frenado brusco de la velocidad (multiplicador de amortiguación fuerte por un instante), sin expulsión ni control perdido — mantiene la nave jugable y evita un sistema de físicas de rebote complejo que no aporta al objetivo del hito.

### Decisión 5 — Fuera de pista y respawn: por distancia al segmento más cercano, no por "estar dentro de un tubo"
"Fuera de pista >N segundos → respawn al último checkpoint validado" (criterio ya fijado). Implementación: cada frame se calcula la distancia de la nave al segmento de circuito MÁS CERCANO (entre checkpoints consecutivos, incluida la vuelta de cierre); si excede `offTrackToleranceDistance`, se acumula tiempo; al superar `offTrackRespawnSeconds`, la nave se teletransporta al ÚLTIMO checkpoint alcanzado (no al inicio del circuito) y el contador de "fuera de pista" se reinicia. Esto es más simple y robusto que modelar la pista como un tubo con ancho variable, y es coherente con "esferas guía" como referencia visual (no como paredes físicas).

### Decisión 6 — Kill-switch y presupuesto de rendimiento
`RACE_CONFIG.enabled` (booleano en `space-config.ts`) apaga la zona de carrera sin revertir código, tal como pide la sección 5.5 del master plan. El presupuesto de rendimiento (`PERF_CONFIG`, ya existente desde el Hito 0) se referencia aquí: `p95BudgetMultiplierRace: 1.2` ya está definido — la verificación final del hito compara el p95 medido EN la zona de carrera contra `baseline × 1.2`.

## Arquitectura

### Módulos puros (Vitest, sin Three.js)

**`shell/src/space/race-track.ts`** — generación determinista del circuito.
- `generateTrack(seed: number, params: TrackParams): RaceTrack` — `TrackParams = {checkpointCount, baseRadius, radiusJitter, heightJitter}`; `RaceTrack = {waypoints: V3[]}` (local al centro de la zona, no en coordenadas de escena — el cableado del motor suma `RACE_CONFIG.center`).
- PRNG `mulberry32` interno (no exportado), determinista por semilla.
- Tests: mismo seed → mismo resultado; distinta seed → distinto resultado; `waypoints.length === checkpointCount`; todos los puntos dentro de `baseRadius * (1 + radiusJitter)` del centro.

**`shell/src/space/race-math.ts`** — distancia y colisión, reutilizando `vec3-math.ts` (Hito 1).
- `distanceToSegment(p: V3, a: V3, b: V3): number`.
- `sweptSphereHitsSphere(segStart: V3, segEnd: V3, obstacleCenter: V3, obstacleRadius: number, shipRadius: number): boolean` — colisión POR EL TRAMO recorrido en el frame (evita tunneling; ver Decisión del master plan).
- `nearestSegmentDistance(p: V3, waypoints: V3[]): number` — distancia de `p` al segmento cerrado más cercano del circuito (recorre todos los pares consecutivos, incluida la vuelta de cierre `waypoints[n-1]→waypoints[0]`).
- Tests: distancia a un segmento conocido (perpendicular, en los extremos, colineal); `sweptSphereHitsSphere` detecta un obstáculo que el ship "atraviesa" en un frame grande (tunneling) aunque ni el punto inicial ni el final estén dentro del radio; `nearestSegmentDistance` con un circuito de 4 puntos.

**`shell/src/space/race-state.ts`** — máquina de estados pura (mismo patrón que `orbit.ts`).
- `RaceState = {phase: 'idle'|'racing'|'finished', currentCheckpoint: number, lap: number, offTrackSeconds: number}`.
- `startRace(): RaceState`.
- `stepRace(prev, input: {distanceToNearestSegment, reachedCheckpoint, dt}, params: {totalCheckpoints, totalLaps, offTrackToleranceDistance, offTrackRespawnSeconds}): {state, action: 'none'|'checkpoint'|'lap'|'finish'|'respawn'}`.
- Tests: avanza checkpoint al alcanzarlo; completa vuelta al llegar al último checkpoint y reinicia `currentCheckpoint`; termina (`finish`) al completar `totalLaps`; acumula `offTrackSeconds` solo mientras está fuera de tolerancia y lo resetea al alcanzar cualquier checkpoint; dispara `respawn` al superar `offTrackRespawnSeconds` y resetea el contador; no hace nada si `phase !== 'racing'`.

### Cableado Three.js (sin tests unitarios, verificado en runtime)

**`shell/src/space/race-render.ts`** — construye y anima la geometría:
- Esferas guía semitransparentes en cada waypoint (una más brillante en el checkpoint actual).
- 2 esferas "planetas masivos" decorativas a los lados de un tramo (sin colisión).
- N asteroides móviles (esferas con desplazamiento orbital/patrulla simple alrededor de un punto local), con colisión real.
- API: `{object: THREE.Group, update(elapsed, delta, currentCheckpoint): void, obstaclePositions(): V3[], dispose(): void}` (patrón de `createPlayerShip`/`createRamatzoBelt`: contrato mínimo, sin exponer internals).

**`shell/src/space/race-hud.ts`** — panel de estado (checkpoint N/total, vuelta X/Y, aviso "fuera de pista") + minimapa reutilizando `bearingToDisc` de `radar-projection.ts` (Hito 1-4, ya pura y testeada) para proyectar los próximos waypoints relativos a la nave — NO se reinventa la proyección.

**Cableado en `space-engine.ts`:**
- Import de `RACE_CONFIG` y los módulos de arriba.
- Un campo `raceState: RaceState = {phase:'idle',...}` y una instancia de `race-render`/`race-hud` creadas en `mount()` SOLO si `RACE_CONFIG.enabled`.
- En `loop()`: si `RACE_CONFIG.enabled`, calcular distancia de la nave a `RACE_CONFIG.center` para el prompt de entrada (independiente de `SolarSystem`/`ApproachInfo`); si `raceState.phase==='racing'`, calcular `nearestSegmentDistance`/`reachedCheckpoint` y llamar `stepRace`; en `action==='respawn'` teletransportar la nave al último checkpoint válido; comprobar colisión con `sweptSphereHitsSphere` contra `obstaclePositions()` usando la posición del frame anterior y la actual (frenado brusco si colisiona).
- Teclas: `KeyE` (ya existe, usado para entrar a proyectos) — dentro de la zona de carrera y con `raceState.phase!=='racing'`, inicia la carrera EN VEZ de intentar `enterCurrentProject` (mutuamente excluyentes por posición: la zona de carrera está a 70 000 unidades de cualquier planeta, nunca coincide con `approachingApp`). `KeyQ` nueva, solo abandona si `raceState.phase==='racing'`.

**Toda constante afinable nueva** va a `space-config.ts` como `RACE_CONFIG`, marcada `[UNIFORME]`/`[PERSONALIZABLE]`. Valores de partida (evita ambigüedad en el plan de implementación; todos afinables después sin tocar lógica):

| Constante | Valor | Nota |
|---|---|---|
| `enabled` | `true` | kill-switch |
| `center` | `{x:0, y:4000, z:70000}` | Decisión 1 |
| `zoneRadius` | `3000` | radio de detección para el prompt "Pulsa E" |
| `checkpointCount` | `10` | nº de waypoints del circuito |
| `baseRadius` | `2200` | radio medio del circuito alrededor de `center` |
| `radiusJitter` | `0.4` | variación de radio por checkpoint (fracción de `baseRadius`) |
| `heightJitter` | `600` | variación de altura por checkpoint (unidades) |
| `checkpointRadius` | `220` | distancia para considerar "alcanzado" un checkpoint |
| `offTrackToleranceDistance` | `450` | distancia al segmento más cercano antes de contar como "fuera de pista" |
| `offTrackRespawnSeconds` | `4` | segundos fuera de pista antes de respawnear |
| `totalLaps` | `2` | vueltas para terminar la carrera |
| `asteroidCount` | `14` | obstáculos móviles con colisión |
| `asteroidRadius` | `90` | radio de colisión de cada asteroide |
| `shipCollisionRadius` | `2.5` | radio de colisión de la nave (aprox. su tamaño visual) |
| `gateRadius` | `900` | radio de las 2 esferas "planetas masivos" decorativas |
| `collisionBrakeFactor` | `0.15` | multiplicador de velocidad al colisionar (frenado brusco) |

## Flujo de datos

1. `loop()` calcula `distToRaceCenter = ship.position.distanceTo(RACE_CONFIG.center_en_escena)`. Si `<= RACE_CONFIG.zoneRadius` y `raceState.phase!=='racing'`: HUD muestra el prompt de inicio.
2. `KeyE` dentro de la zona (y no en fase `racing`) → `raceState = startRace()`.
3. Cada frame en fase `racing`: `nearestSegmentDistance(shipPosLocal, waypoints)` para "fuera de pista"; distancia al waypoint `currentCheckpoint` para `reachedCheckpoint`; `sweptSphereHitsSphere` contra cada obstáculo con el segmento (posición anterior → actual) de la nave.
4. `stepRace(...)` decide la transición; `action==='respawn'` mueve la nave; `action==='finish'` muestra un mensaje de fin y vuelve `raceState` a `idle` tras unos segundos (sin abandonar el vuelo libre).
5. `race-hud.ts` se actualiza con `raceState` + waypoints para el minimapa.

## Testing

- Vitest puro para `race-track.ts`, `race-math.ts`, `race-state.ts` (sin Three.js).
- Verificación runtime (arnés dev + `localhost:8080`): completar una vuelta real, provocar un respawn saliéndose de pista, provocar una colisión con un asteroide, medir p95 frame time en la zona (tecla P / `getPerfSnapshot()`) contra el presupuesto `baseline × 1.2`.

## Riesgos y notas

- Colisión esfera-esfera con chequeo por segmento es una aproximación simple (no hay motor de físicas): suficiente para el objetivo del hito, documentado como tal por el propio master plan.
- El "feel" de la pista (dificultad, curvatura, densidad de asteroides) es afinable vía `RACE_CONFIG` sin tocar lógica — si el usuario la encuentra muy difícil/fácil tras probarla, es un ajuste de constantes, no de arquitectura.
- Si la puerta de rendimiento fallara (poco probable dado el bajo conteo de geometría propuesto), la primera palanca es reducir `asteroidCount` en `RACE_CONFIG`, tal como indica la sección 5.2 del master plan.
