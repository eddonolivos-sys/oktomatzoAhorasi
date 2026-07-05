# Hito 3 — Audio global y por proyecto: reporte de cierre

Fecha: 2026-07-05 · Rama: `ramatzo`

## Hallazgo importante (no en el alcance original, corregido en este hito)

Al verificar visualmente el botón de configuración en la app real (`localhost:8080`), se descubrió que **todo `space.css` llevaba tiempo sin aplicarse en producción**: `shell-app.ts` usa Shadow DOM (comportamiento por defecto de `LitElement`, sin `createRenderRoot()` propio), y `<shell-space>` (light DOM) se renderiza DENTRO de ese shadow root. Las hojas de estilo que Vite inyecta en `document.head` (`space.css`, `themes.css`, y mi nuevo `shell-settings.css`) no atraviesan esa frontera — la encapsulación de Shadow DOM bloquea selectores externos. Captura de pantalla ANTES del fix: el espacio 3D se veía, pero SIN ningún HUD (ni "Menú", ni velocidad, ni radar, ni reticula) — todo estaba en el DOM (los tests funcionales/snapshots de accesibilidad de los Hitos 1-2 lo confirmaban) pero visualmente ausente (`position:static`, `z-index:auto`, colores por defecto en vez de los del tema).

Este bug es preexistente (no lo introdujeron los Hitos 1 o 2 de esta sesión) y pasó inadvertido porque:
- La verificación manual de los Hitos 0 y 1 usó el arnés dev (`shell/debug.html`), que monta `<shell-space>` directo en `document.body` — SIN el shadow root de `shell-app` de por medio, así que ahí espacio.css sí se veía bien.
- Las verificaciones contra la app real (Bug A del Hito 1, flujo guest del Hito 2) comprobaron comportamiento funcional (accesibilidad, `localStorage`) pero no `getComputedStyle` de elementos del HUD.

**Fix aplicado** (mínimo, quirúrgico, sin efectos colaterales nuevos verificados):
- `shell-app.ts`: `createRenderRoot() { return this; }` (light DOM). Se eliminó el bloque `static styles` anterior (CSS muerto: `.shell-layout`/`.shell-main`/`.shell-content` nunca se generaban en `render()`). `<shell-login>` y `<shell-cockpit>` conservan su PROPIO shadow root vía su `static styles` — no se tocaron.
- `themes.css`: regla `shell-app { display:block; height:100%; width:100%; overflow:hidden; }` para sustituir el `:host{...}` perdido (sus hijos ya se autodimensionan con `100vh`/`position:fixed`, así que esto es un respaldo, no algo estrictamente necesario).
- El bug latente YA CONOCIDO y documentado ("`broadcastAuth`/`broadcastTheme` buscan iframes en `shadowRoot` de `shell-app`, que en realidad viven en `shell-cockpit`") sigue exactamente igual de no-funcional que antes (ya era inalcanzable por esa vía independientemente del modo DOM) — no se tocó, sigue fuera de alcance.
- Verificado visualmente con capturas de pantalla antes/después contra la app real: el HUD completo (menú, velocidad, radar, leyenda de controles, altitud/rumbo) pasó de invisible a correctamente estilizado.

## Criterios de aceptación (master plan, Hito 3)

- [x] **Botón de configuración visible y clicable en: espacio (vía PauseMenu + botón fijo cuando no hay lock), y DENTRO de la cabina de un proyecto.** Verificado visualmente (capturas) en el espacio; verificado funcionalmente (estado `cockpitApp` reflejado en `shell-settings`, sección "Silenciar audio de `<nombre>`" aparece) dentro de la cabina. Botón "Configuración" añadido al `PauseMenu` como entrada duplicada.
- [x] **Mute/volumen persisten (localStorage) y sobreviven a recarga.** Verificado: cambio de volumen a 0.35 → recarga completa (F5) → el valor persiste en `localStorage['plataforma_audio']` y se refleja en el slider.
- [x] **AudioContext se desbloquea con el primer gesto.** `audioService.unlock()` cableado en `_handleSubmit`/`_handleGuestLogin` (login) y en `onCanvasClick` (primer clic en el espacio).
- [x] **Instrucciones de reemplazo de música en un README corto.** `shell/public/audio/README.md`.
- [x] **Tests puros de `audio-math` y del reducer de `audio-service`.** 9 tests en `audio-math.test.ts` (thrusterGain, duckingGain), 9 tests en `audio-service.test.ts` (mute/volumen/persistencia/rehidratación, sin tocar WebAudio).
- [x] **El modal NO cierra con Esc.** Verificado: se despachó `Escape` con el modal abierto y siguió visible (Esc en el espacio abre el PauseMenu por separado, sin colisión con el modal).

## Verificado

- `pnpm --filter @plataforma/shell test`: **252/252 tests**, 21 archivos.
- `pnpm --filter @plataforma/shell lint` (tsc --noEmit): sin errores.
- `pnpm --filter @plataforma/shell build`: OK.
- Runtime real en `http://localhost:8080` (redeploy vía `deploy/ejec-shell.bat`): hash cambió de `index-BK9YdJ6V.js` (Hito 2) a `index-DiPKznW7.js`. Verificación visual con capturas de pantalla antes/después del fix de Shadow DOM; login y flujo guest siguen renderizando correctamente (sin regresión).

## Bug real encontrado durante TDD (no bloquea, corregido)

El test `audio-service.test.ts` tal como se especificó no tenía `beforeEach` para resetear el `localStorage` stubeado entre tests (a diferencia de `auth-client.test.ts`, que sí lo tiene) — el estado persistido por un test contaminaba la rehidratación del siguiente. Se corrigió añadiendo el mismo `beforeEach` con `vi.stubGlobal('localStorage', makeStorage())`.

## Desviaciones del spec (documentadas, no bloquean)

- El selector de nave (antiguo #5) queda pospuesto, tal como indica el master plan; el modal queda estructurado por secciones para añadirlo después.
- El hook de colisión (`playCollisionSfx`) existe y es invocable pero nada lo llama todavía — se conectará de verdad en el Hito 5, tal como especifica el master plan.
- No hay archivos `.ogg` reales en el repo (no se pueden generar en este entorno); el diseño tolera su ausencia (`fetch` fallido → `null` → sin música/SFX, sin romper nada). El README documenta cómo añadirlos.

## Bloqueos

Ninguno.
