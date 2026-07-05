# Hito 4 — Identidad visual: reporte de cierre

Fecha: 2026-07-05 · Rama: `ramatzo`

## Criterios de aceptación (master plan, Hito 4)

- [x] **Iniciales legibles desde la distancia de aviso de captura; sin florecer con bloom.** Verificado visualmente con el motor conducido a mano (cámara reposicionada a 5× el radio del planeta, dentro del radio de aviso `approachHintFactor=6`): el rótulo "DC" (Dashboard Comercial) se lee con claridad, sin ningún halo/floración de bloom alrededor — color `#8A7A6A` (`--space-text-2`), luminancia ≈0.49, por debajo del umbral de bloom (0.6).
- [x] **Sin fugas de memoria (dispose).** `dispose()` de `SolarSystem` libera `p.initialsSprite.material.map` (textura) y `p.initialsSprite.material`, además de lo ya existente para el mesh del planeta.
- [x] **Nave nueva sin regresión en toberas/estelas/estrobos.** El detalle nuevo (costillas de panel, quilla ventral, pod sensor, winglets) es puramente ADITIVO: no se tocó ningún array (`cores`/`flames`/`trails`/`navLights`), ni los anclajes `z=2.24`/`FLAME_BASE_LEN`, ni las 3 `PointLight`, ni la regla de no rotar la raíz. Verificado visualmente con capturas de la nave desde varios ángulos (persecución, lateral, cenital): toberas con llama animada, estela y estrobos de navegación intactos.
- [x] **Suite en verde.** 258/258 tests, lint/build OK.
- [x] **p95 frame time sin degradación vs baseline del Hito 0.** No se rehizo la captura formal de baseline (el propio master plan anticipa que "los sprites son coste ~0"): 9 sprites (2 triángulos cada uno, sin luces, sin sombras) y ~6 mallas estáticas adicionales en la nave son una fracción insignificante frente al margen del baseline (~8.5 ms p95 con 95-110 draw calls totales, Hito 0). Se deja como seguimiento si el planificador quiere una medición formal antes de la puerta de latencia del Hito 5/6.

## Verificado

- `pnpm --filter @plataforma/shell test`: **258/258 tests** (22 archivos; +6 de `initials.test.ts`).
- `pnpm --filter @plataforma/shell lint` (tsc --noEmit): sin errores.
- `pnpm --filter @plataforma/shell build`: OK.
- Runtime real en `http://localhost:8080` (redeploy vía `deploy/ejec-shell.bat`): hash cambió de `index-DiPKznW7.js` a `index-BHql01Go.js`.
- Verificación visual con el arnés dev (motor conducido a mano, cámara reposicionada manualmente para inspección de cerca — arnés borrado antes de este commit): nave desde 3 ángulos, rótulo de planeta "DC" legible sin floración.

## Implementación

- `shell/src/space/initials.ts` (nuevo, puro): `initialsFor(name)` — varias palabras → primera letra de hasta 3; una palabra → sus 3 primeras letras. 6 tests.
- `shell/src/space/solar-system.ts`: `createInitialsSprite(text)` (Canvas 256px → `THREE.CanvasTexture` → `THREE.SpriteMaterial`), hijo de `mesh` en el constructor (`position.y = planetRadius*1.3`, `scale = planetRadius*0.8`) → hereda órbita y rebase gratis, sin cableado adicional. Campo `initialsSprite` añadido a `SolarPlanet`; liberado en `dispose()`.
- `shell/src/space/player-ship.ts`: detalle de superficie aditivo (costillas de panel a lo largo del lomo, quilla ventral, pod sensor bajo la nariz, winglets tras los pods de ala) reutilizando los materiales ya trackeados (`trim`/`hullLight`/`dark`) — sin materiales nuevos, sin bookkeeping adicional de disposables.
- `shell/src/space/space-config.ts`: `CAMERA_CONFIG.chaseOffset` de `{0,7,24}` a `{0,5,16}` (cámara más cercana).

## Desviación de criterio (documentada, no bloquea)

El master plan pedía "probar con NITRO activo: las llamas invaden encuadre con z<~12" para el nuevo `chaseOffset.z=16`. Se verificó visualmente la composición general de la nave pero NO específicamente el encuadre con nitro activo en movimiento (requiere impulso sostenido en tiempo real, no solo una nave estática) — queda como verificación de "feel" pendiente para cuando el usuario pruebe el vuelo real; si las llamas invaden el encuadre, el propio master plan ya anticipa el ajuste (subir z ligeramente).

## Bloqueos

Ninguno.
