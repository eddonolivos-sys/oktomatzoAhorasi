# Hito 1 — Núcleo estable: reporte de cierre

Fecha: 2026-07-05 · Rama: `ramatzo`

## Criterios de aceptación (master plan, Hito 1)

- [x] Los 4 bugs reproducidos por el usuario ya NO son reproducibles:
  - **Bug A (re-pide login):** verificado con el backend REAL (`localhost:8080`, build de producción). Se registró una cuenta de prueba (`hito1-qa@ramatzo.local`), se inició sesión desde el navegador, se hizo una recarga completa (F5) y la app fue directa al espacio, sin volver a pedir login. `localStorage` contiene el token (`sessionStorage` no); `sessionStorage` limpiado en el arranque.
  - **Bug B (no-reentrada tras volver de un proyecto):** verificado con el arnés dev conduciendo el motor a mano (`window.__space.step`). Al capturar órbita y pulsar E, `enterProject` dejó `orbit.phase='free'` con `cooldown=1` ANTES de pausar (antes se quedaba en `'orbiting'`); al "volver" y dar W, la nave se movió de inmediato (verificado el desplazamiento real de posición), sin quedar re-anclada.
  - **Bug C (planetas que desaparecen):** verificado forzando un rebase (nave más allá de `rebaseThreshold=200000`, luego un frame conducido a mano). El grupo `systemGroup` se desplazó exactamente `-delta` junto con la nave/cámara, y la posición de escena de los planetas (`groupPos + localPos`) siguió siendo finita y coherente — ya no se separan del marco de mundo tras el rebase.
  - **Bug D (órbita "inestable"):** el plano orbital ahora es determinista (`buildOrbitBasis`, 7 tests unitarios incluyendo determinismo, ortonormalidad y casos degenerados) en vez de depender de la velocidad de llegada. Verificado en vivo: captura con el nuevo `influenceRadius` recalibrado (432 = 144×3), transición de cámara a la pose orbital completa (`orbitCamBlend=1`).
- [x] Nuevos tests puros: `orbit-frame` (`buildOrbitBasis`/`orbitPlaneNormal`, 7 tests), `orbit-camera` (`orbitCameraPose`, 6 tests), `vec3-math` (helpers compartidos, 8 tests), `dampedFollow` (flight-math, 6 tests), `stepOrbit`/`freeAfterExit` (nuevo contrato, 17 tests), `captureState` (4 tests), `planetWorldCenter` (3 tests), rehidratación/persistencia de `auth-client` (8 tests). Suite completa en verde: **232 tests, 19 archivos**.
- [x] Plan detallado generado con `writing-plans` (`docs/superpowers/plans/2026-07-04-hito-1-nucleo-estable-plan.md`, 14 tareas) y ejecutado con `subagent-driven-development` (7 subagentes implementadores en grupos S1 / S5+S6 / S3 / S4 / S2 / S7 / S8, en orden estricto por dependencias de archivo; verificación de cada grupo antes de continuar al siguiente).

## Verificado

- `pnpm --filter @plataforma/shell test`: **232/232 tests**, 19 archivos, todos en verde.
- `pnpm --filter @plataforma/shell lint` (tsc --noEmit): sin errores.
- `pnpm --filter @plataforma/shell build`: OK.
- Runtime en `http://localhost:8080` (redeploy real vía `deploy/ejec-shell.bat`, NO `docker-compose.dev.yml`): hash del bundle cambió de `index-BnVwKSDn.js` a `index-DaeUsGwt.js`. Sin errores de consola ni requests fallidas en el navegador real.
- Verificación manual de los 4 bugs: ver detalle arriba (arnés dev para B/C/D, backend real para A).
- `grep -rn "thrustActive|captureGrace|isThrusting|\.grace\b" shell/src` → único resultado es un comentario histórico en el docblock de `orbit.ts` (documenta qué se eliminó), sin código ni símbolo activo.

## Bugs reales encontrados y corregidos DURANTE la ejecución del plan (no en el código final, en el propio documento del plan)

Los subagentes implementadores, siguiendo TDD estricto, encontraron 3 inconsistencias reales entre el código y los tests que el plan especificaba (verificadas antes de "arreglar", nunca asumidas como error de transcripción):

1. **`stepOrbit`, rama `free`:** no recomprobaba `insideInfluence` en el mismo frame en que el cooldown llegaba a 0 (introducía un frame de retraso injustificado en la recaptura). Fix: chequeo `cooldown<=0 && insideInfluence` dentro de la rama de cooldown activo.
2. **Test de `dampedFollow`:** `toBeCloseTo(10, 4)` no alcanzable con `exp(-12)≈6.14e-6` (el error real, `6.14e-5`, supera la tolerancia de 4 dígitos por un margen de `~1e-5`). Fix: tolerancia a 3 dígitos.
3. **`auth-client.test.ts`:** `export const authClient = new AuthClient()` a nivel de módulo se ejecuta en el momento del `import`, ANTES de que `vi.stubGlobal` en `beforeEach` pueda definir `localStorage`/`sessionStorage`/`fetch` (con `environment:'node'` esos globals no existen hasta que se stubean). Fix: `vi.hoisted()` (se reubica antes de los imports) definiendo los 3 stubs, combinado con `makeStorage` como `function` (no arrow) para aprovechar el hoisting nativo de JS.

Los tres se corrigieron en el plan y en el código real, verificados con ejecución real (no solo inspección) antes de continuar.

## Desviaciones del spec (documentadas, no bloquean)

- S8: tests en `environment: 'node'` con mocks manuales de `localStorage`/`sessionStorage`/`fetch` (+ `vi.hoisted`, ver arriba), en vez de `jsdom` — evita añadir una dependencia nueva; `AuthClient` no toca el DOM.
- S6: no se implementó el "empujar la nave hacia afuera" que sugería el spec como medida extra — el cooldown de `freeAfterExit` ya impide la recaptura instantánea del mismo frame sin necesidad de mover la nave; verificado en vivo que WASD integra empuje de inmediato tras volver.
- Se consolidaron S5 y S6 en las Tareas 3-4 del plan (ambas reescriben `OrbitState`/`orbit.ts` de forma inseparable) — ver nota de arquitectura al inicio del plan.
- No se tocó `shell-app.ts` para S8 (el spec lo mencionaba como archivo candidato): la estrategia elegida (`subscribe()` reemite el estado) resuelve el Bug A sin necesitar cambios ahí.

## Observación de "feel" para follow-up (no bloquea)

Al probar la tecla "S" de salida de órbita MANTENIDA (no un toque breve), el impulso de expulsión se combina con el freno normal de vuelo libre (S también frena fuera de órbita) y la nave puede no alejarse lo suficiente antes de que expire el cooldown, resultando en recaptura del mismo planeta. Es un comportamiento consistente con el diseño (S sigue siendo freno fuera de la órbita) y no es uno de los 4 bugs reportados, pero puede afinarse en una pasada de "feel" (Hito 4 ya contempla afinar `CAMERA_CONFIG`/sensación).

## Bloqueos

Ninguno.
