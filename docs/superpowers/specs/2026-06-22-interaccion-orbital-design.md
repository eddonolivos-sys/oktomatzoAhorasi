# Spec — #3 Interacción orbital (+ contrato de entrada compartido con #6)

- **Fecha:** 2026-06-22
- **Rama:** `ramatzo`
- **Bloque:** 2. Orden: 7 → 1 → 2 → 4 → **3** → 5 → 6 (7, 1, 2, 4 ya code-complete).
- **Alcance:** mecánica de aproximación/entrada del jugador a un planeta. Reescribe `enterApproaching` + el bloque de aproximación del loop. Deja la **costura** que #6 (circuito) rellenará tras #5. No toca apps, registry, cabina/iframe.

## Contexto

Hoy ([space-engine.ts:405-436](../../../shell/src/space/space-engine.ts)): al estar dentro de la esfera de influencia de un planeta (`solar.approaching`), el HUD muestra "Pulsa E" y `KeyE` → `enterApproaching` abre el proyecto directo (`onEnterApp` o `externalUrl`). Además `setApproachBrake` amortigua la nave al acercarse ([:328](../../../shell/src/space/space-engine.ts)). `ApproachInfo` ([solar-system.ts:14-18](../../../shell/src/space/solar-system.ts)) sólo trae `{app, distance, influenceRadius}` — **no** la posición del planeta.

## Decisiones (confirmadas en brainstorming)

| Eje | Decisión |
|---|---|
| Captura | Al entrar en la esfera de influencia, la nave pasa a **órbita automática** (satélite) |
| Tecla de entrada | **E** (desde la órbita) |
| Expulsión | **Teclas de empuje** (W/A/S/D/Shift/Space) expulsan; **mirar con el ratón NO** |
| Dirección de expulsión | **Radial** (empujón hacia afuera del planeta) + cooldown sin recaptura |
| Circuito (#6) | **Custodia la entrada**: E → circuito → superar → proyecto; vida 0 → expulsado. Por-planeta (config del shell). En #3 la costura `enterFromOrbit` hace lo de hoy; #6 la envuelve |

## Flujo (máquina de estados)

```
free ──(entra en influencia)──▶ orbiting ──(E)──▶ acción 'enter' (→ circuito #6 / proyecto)
                                   │
                                   ├─(empuje WASD/Shift/Space)─▶ acción 'eject' ─▶ ejecting(cooldown) ─▶ free
                                   └─(sale de influencia)──────────────────────▶ free
```
Mirar con el ratón no cambia de estado (puedes contemplar en órbita). Durante `ejecting` se ignora la recaptura hasta agotar el cooldown.

## Lógica pura (TDD) — nuevo módulo `orbit.ts` (sin Three.js)

```ts
export type OrbitPhase = 'free' | 'orbiting' | 'ejecting';
export interface OrbitState { phase: OrbitPhase; cooldown: number; }
export interface OrbitInput { insideInfluence: boolean; enterPressed: boolean; thrustActive: boolean; dt: number; }
export interface OrbitResult { state: OrbitState; action: 'none' | 'enter' | 'eject'; }

export function stepOrbit(prev: OrbitState, input: OrbitInput, cooldownDuration: number): OrbitResult;
export function ejectVelocity(center: V3, ship: V3, strength: number): V3; // radial saliente · strength
```

Tests Vitest:
1. `free` + dentro de influencia → `orbiting` (captura), acción `none`.
2. `free` + fuera → sigue `free`.
3. `orbiting` + `enterPressed` → acción `enter` (una vez).
4. `orbiting` + `thrustActive` → `ejecting` (cooldown=duración) + acción `eject`.
5. `orbiting` + sale de influencia → `free`.
6. `ejecting`: descuenta `dt`; mientras `cooldown>0` NO recaptura aunque esté dentro de influencia; al agotarse → `free`.
7. `ejectVelocity`: dirección radial saliente correcta y magnitud = `strength`; caso degenerado (ship≈center) → vector seguro no-NaN.

La geometría 3D de la órbita (base del plano a partir de radial × velocidad, `center + radius·(cos·u + sin·v)`) vive en el motor/controlador con Three.js (verificada en build + dev server), no en unidad.

## Integración (Three.js)

- **[solar-system.ts](../../../shell/src/space/solar-system.ts):** `ApproachInfo` gana `center: THREE.Vector3` y `planetRadius` (campos nuevos; consumidores actuales no se rompen). `update` los rellena con el planeta más cercano.
- **[ship-controller.ts](../../../shell/src/space/ship-controller.ts):** modo órbita — `setOrbiting(on)`: mientras está activo, `update()` **no** integra empuje/posición (la posición la impone el motor) pero **sigue** componiendo orientación desde yaw/pitch (mirar libre). Nuevo `applyImpulse(v: Vector3)` (suma a `velocity`) para la expulsión. `setApproachBrake` deja de usarse (lo sustituye la captura).
- **[space-engine.ts](../../../shell/src/space/space-engine.ts):** mantiene `OrbitState`; `onKeyDown` E encola `enterPressed`; el loop ejecuta `stepOrbit(insideInfluence = !!approaching, enterPressed, thrustActive = ship.isThrusting, dt)`:
  - captura (`free→orbiting`): guarda `center`, `radius` (= distancia de captura, acotada), base `u,v` (radial y tangencial desde la velocidad de llegada; blend ~0.5 s), `angle0`; `ship.setOrbiting(true)`.
  - en `orbiting`: avanza `angle += angularSpeed·dt`; `ship.object.position = centerVivo + radius·(cos·u + sin·v)` (centro vivo del planeta → órbita de satélite; rebase automático).
  - acción `enter`: `enterFromOrbit(app)` → `externalUrl` (pestaña) o `onEnterApp(app)` (#6 envolverá con el circuito); limpia el modo órbita.
  - acción `eject`: `ship.setOrbiting(false)` + `ship.applyImpulse(ejectVelocity(center, shipPos, ORBIT_CONFIG.ejectStrength))`.
- **[hud.ts](../../../shell/src/space/hud.ts):** el prompt pasa de "Pulsa E" a, en órbita, "E entrar · muévete para salir" (texto; sin rediseño).
- **`ship-controller`** expone `get isThrusting()` (alguna de W/A/S/D/Shift/Space pulsada).

## Config (`space-config.ts`)

```ts
export const ORBIT_CONFIG = {
  angularSpeed: 0.5,      // [PERSONALIZABLE #5] rad/s de la órbita (periodo ~12.6 s)
  captureBlendSeconds: 0.5, // [UNIFORME] mezcla suave de la velocidad de llegada
  captureRadiusFactor: 0.85, // [UNIFORME] radio de órbita = distancia de captura × factor (acotado a la influencia)
  ejectStrength: 900,     // [UNIFORME] velocidad del impulso radial de expulsión (u/s); afinable
  ejectCooldownSeconds: 1.0, // [UNIFORME] sin recaptura tras expulsar
};
```

## Verificación

- `pnpm --filter @plataforma/shell test` (tests nuevos de `orbit.ts`).
- `lint` (`tsc --noEmit`) y `build`.
- Visual/feel: dev server (el usuario calibra órbita/expulsión).

## Riesgos y mitigaciones

- **Acoplamiento con el bucle de control** (la órbita impone posición): el modo órbita aísla la rama en `update()`; la velocidad se congela y se restaura por impulso al expulsar.
- **Rebase de origen** durante la órbita: se recalcula cada frame relativa al `center` vivo del planeta (ya rebasado por `solar-system.rebase`) → no se rompe.
- **Recaptura instantánea** tras expulsar: cooldown en `ejecting` que ignora la influencia.
- **Teclas tomadas** (E/C/Space/Esc): E sólo actúa en `orbiting`; el empuje (incl. Space=nitro) expulsa; C/Esc intactas.
- **Multijugador:** la órbita sigue difundiendo la posición real (otros te ven orbitar); sin cambios de protocolo.
- **Escala ×5 sin verificar aún:** el feel de órbita depende del mundo de Cluster A; calibración del usuario en dev server.

## Fuera de alcance

- El circuito de obstáculos en sí (#6): aquí sólo se deja la costura `enterFromOrbit` + se reservará `CIRCUIT_CONFIG` (lista de planetas) en #6.
- Cámara especial de órbita (se mantiene la chase cam).
- Cambios de velocidad de vuelo libre.
- UI del menú de configuración (#5).

## Addendum — corrección tras prueba del usuario (2026-06-27)

Tras probar la primera versión, el usuario reportó que la nave no orbitaba, no había expulsión y la entrada no pausaba el mapa.

**Causa raíz (depuración):** la órbita capturaba y se expulsaba en el mismo instante. La expulsión se evaluaba con el empuje **a nivel** (`thrustActive`); como uno se aproxima manteniendo W (más aún con el sistema ×5), el empuje seguía activo justo tras capturar → expulsión inmediata. Esto impedía que la órbita se sostuviera y, en cadena, que `E` emitiera `enter` (sólo válido en `orbiting`), por lo que `onEnterApp` casi nunca se llamaba y el mapa no se pausaba (el cableado de pausa en `shell-space.ts` era correcto; sólo no se disparaba).

**Correcciones:**
1. Expulsión por **flanco** (`thrustPressed`), no por tecla mantenida: acercarse con W no rompe la órbita; sólo una pulsación nueva de movimiento expulsa. El motor calcula el flanco (`isThrusting && !prevThrusting`).
2. **Bloqueo total de control en órbita** (decisión del usuario): además de congelar el empuje, se congela la mirada (`onMouseMove` ignora la entrada en órbita) y se **libera el pointer lock** para mostrar el cursor.
3. **Botón "Entrar" en el panel del proyecto** (`hud.ts`, callback `onEnter`): clic (o tecla `E`) → `enterCurrentProject` → `onEnterApp` → `engine.pause()` (mapa congelado) hasta cerrar la vista del proyecto, que reanuda con `resume()`.

Tests: nuevo caso en `orbit.test.ts` (empuje mantenido sin flanco NO expulsa). 165 tests verdes.
