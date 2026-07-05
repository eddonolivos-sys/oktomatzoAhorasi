# Hito 5 — Pista de carreras espacial: reporte de cierre

**Fecha:** 2026-07-05
**Spec:** `docs/superpowers/specs/2026-07-05-pista-de-carreras-espacial-design.md`
**Plan:** `docs/superpowers/plans/2026-07-05-hito-5-pista-de-carreras-plan.md`

## Resumen

Pista de carreras espacial single-player anclada al planeta lejano reservado
para el Hito 6. Circuito cerrado generado por semilla (10 checkpoints en
forma de aros translúcidos), HUD con minimapa circular reutilizando
`bearingToDisc`, respawn automático fuera de pista, colisión esfera-esfera
anti-tunneling contra asteroides móviles y "gates" decorativos, y frenado al
colisionar. Toda la lógica de estado/generación/colisión es pura y está
cubierta por Vitest; el cableado Three.js vive en un módulo de render
separado sin tests unitarios (verificado solo en runtime, como el resto del
motor).

## Criterios de aceptación verificados

- **Inicio de carrera**: al entrar en la zona (`RACE_CONFIG.zoneRadius`) se
  activa el HUD de carrera y arranca el cronómetro/checkpoint 1. Verificado
  en runtime con el arnés de depuración.
- **Progresión de checkpoints**: cruzar el aro activo avanza
  `currentCheckpoint`; el aro activo se renderiza más opaco (0.85 vs 0.5).
  Verificado visualmente (captura con "Checkpoint 2/10 · Vuelta 1/2").
- **Vuelta completa / multi-vuelta**: al cruzar el último checkpoint de una
  vuelta se incrementa `lap` y se reinicia `currentCheckpoint` a 0; con
  `totalLaps: 2` la carrera continúa a la vuelta 2 en vez de terminar.
  Verificado en `race-state.test.ts` y en runtime.
- **Finalización**: al completar `totalLaps` vueltas la máquina de estados
  transiciona a `finished` sin excepción ni checkpoint fantasma. Verificado
  en `race-state.test.ts`.
- **Respawn a checkpoint correcto**: salir de pista más de
  `offTrackRespawnSeconds` teletransporta al ÚLTIMO checkpoint VALIDADO
  (`currentCheckpoint - 1`), no al próximo objetivo pendiente — bug real
  encontrado y corregido durante este hito (ver sección de bugs). Verificado
  con prueba dirigida en el arnés de depuración simulando una salida de
  pista controlada.
- **Colisión anti-tunneling**: `sweptSphereHitsSphere` evalúa el segmento
  recorrido en el frame (posición previa → actual), no solo la posición
  puntual, evitando que velocidades altas atraviesen asteroides sin
  detección. Cubierto por `race-math.test.ts` (incluye test dedicado de
  tunneling) y confirmado en runtime con velocidades altas cerca de
  asteroides.
- **Frenado al colisionar**: al detectar colisión, la nave aplica
  `dampVelocity(RACE_CONFIG.collisionBrakeFactor)`. Verificado en runtime.
- **Abandonar la pista (tecla Q)**: `KeyQ` desactiva la zona de carrera y
  devuelve el control normal de vuelo libre. Verificado en runtime.
- **Puerta de rendimiento**: p95 de frame time dentro de la zona de carrera
  medido en 8.5ms, igual al baseline general (`docs/superpowers/notes/2026-07-04-baseline-perf.md`),
  muy por debajo del límite baseline+20% (~10.2ms), y muy por encima de 30
  FPS sostenidos. Ver sección de bugs para el detalle del hallazgo y la
  corrección que llevó a este número.

## Bugs encontrados y corregidos durante el hito

### 1. Respawn a checkpoint incorrecto (lógica de estado)

`space-engine.ts` teletransportaba la nave a
`raceTrack.waypoints[raceState.currentCheckpoint]` al respawnear, pero
`currentCheckpoint` es el PRÓXIMO objetivo aún no alcanzado — colocar la nave
ahí "regalaba" el checkpoint pendiente en el frame siguiente, ya que
`reachedCheckpoint` se cumple de inmediato al estar exactamente sobre el
objetivo. Corregido para respawnear en el último checkpoint VALIDADO:
`(currentCheckpoint - 1 + total) % total`. Encontrado mediante prueba
dirigida en el arnés de depuración (una salida de pista simulada mostró que
el checkpoint avanzaba sin que la nave lo hubiera cruzado realmente).

### 2. Regresión de rendimiento por overdraw (render)

Los aros guía de checkpoint se implementaron originalmente como esferas
rellenas, translúcidas, de radio 220, con `depthWrite: false`. Con la cámara
cerca o dentro de una de estas esferas, el framebuffer completo debía
mezclarse por píxel contra la superficie transparente, causando un p95 de
frame time de 41.5ms dentro de la zona de carrera (vs. 8.5ms de baseline).
Diagnosticado mediante una re-medición controlada (aislando "en spawn" vs.
"en zona de carrera") que descartó degradación ambiental. Corregido
reemplazando las esferas por anillos delgados (`THREE.TorusGeometry`) del
mismo radio exterior, orientados como "puertas" con `mesh.lookAt()` hacia el
siguiente waypoint — visualmente equivalente, ~7x menos superficie de
pantalla cubierta. Re-medido en dos ubicaciones (cerca de un checkpoint,
cerca de las esferas "gate" decorativas): p95 de vuelta a 8.5ms en ambas.

## Tests

- `race-track.test.ts`: 6 tests (generación determinista por semilla).
- `race-math.test.ts`: 11 tests (distancia a segmento, distancia a pista,
  colisión anti-tunneling).
- `race-state.test.ts`: 9 tests (máquina de estados: inicio, checkpoint,
  vuelta, finalización, off-track/respawn, orden de chequeos).
- Total de la suite del shell tras el hito: **284/284 tests pasando**
  (25 archivos de test).
- `pnpm --filter @plataforma/shell lint`: limpio (`tsc --noEmit` sin
  errores).
- `pnpm --filter @plataforma/shell build`: verde.

## Hash del bundle

- Antes del hito (Hito 4): `index-BHql01Go.js`
- Después del hito (Hito 5, redesplegado con `deploy/ejec-shell.bat`):
  `index-CdwiM77E.js`
- Verificado servido en `http://localhost:8080/` mediante `curl` directo,
  coincide con el hash producido por `pnpm --filter @plataforma/shell build`
  local.

## Arnés de depuración

`shell/debug.html` y `shell/src/debug-space.ts` se usaron para iterar sobre
el motor de carrera sin pasar por login, y fueron borrados antes de este
commit (confirmado: `git status --short shell/` no muestra rastro de estos
archivos).

## Desviaciones del plan

Ninguna relevante. Dos correcciones (respawn y overdraw) se aplicaron tanto
al código como al documento del plan (`docs/superpowers/plans/2026-07-05-hito-5-pista-de-carreras-plan.md`)
antes de este cierre, quedando el plan consistente con el código final.

## Bloqueos

Ninguno.
