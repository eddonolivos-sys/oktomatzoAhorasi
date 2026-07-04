# Órbita cinemática estable y navegación de planetas — diseño

Fecha: 2026-07-04 · Rama: `ramatzo` · Alcance: `shell/src/space/**` + arreglo puntual de sesión en `shell/src/services/` y `shell/src/components/shell-app.ts`.

## Contexto y origen

Tras probar el flujo real en `http://localhost:8080` (login del backend → espacio → entrar a un proyecto → volver), el usuario reportó cuatro fallos y varios deseos de sensación. Una investigación de causa raíz con verificación adversarial (workflow `rca-espacio-4-bugs`, 10 agentes) estableció las causas verificadas que fundamentan este diseño. Este spec unifica los arreglos de comportamiento con el rediseño de la interacción orbital, porque están entrelazados.

### Causas raíz verificadas (resumen)

- **Bug B (no se entra a otro planeta tras volver) — confianza alta.** `pause()`/`resume()` y `enterProject` no limpian el estado orbital: al volver, `orbit.phase='orbiting'`, `ship.orbiting=true` y `approachingApp` siguen apuntando al planeta A. La nave queda re-anclada por `advanceOrbit` (WASD ignorado) y E re-entra al mismo planeta. Evidencia: `space-engine.ts:620-641,455-467,496-505,508-512`; `ship-controller.ts:233-247`.
- **Bug C (los planetas desaparecen) — confianza alta en el defecto.** Los planetas son los únicos cuerpos que NO viven en el marco rebasado del mundo: `solar-system.update()` reescribe `mesh.position` en coords absolutas centradas en el origen cada frame sin restar `worldOffset` (`solar-system.ts:98-103`), y `rebase()` (`:145-147`) queda anulado por `update()`. Al alejarse del origen más que `fogFar=camera.far=110000`, los planetas (radio ≤30000) caen fuera de niebla/far y se esfuman. El rebase agrava (desincroniza planetas vs sol) pero no es la causa.
- **Bug D (órbita "inestable") — confianza alta.** El radio de la órbita nave-planeta es exactamente constante (no es elipse) y las órbitas planeta-sol son deterministas y estables. Lo inestable es la ORIENTACIÓN DEL PLANO: `beginOrbit` deriva `orbitV` de la velocidad de llegada (`space-engine.ts:480-487`); como se llega volando casi radial al planeta, la componente tangencial es pequeña y la fija el drift/ratón del momento → plano distinto e inclinado en cada captura. (Descartados: condicionamiento numérico y el frenado de aproximación.) Aparte hay una deriva epitrocoidal correcta (la trayectoria absoluta no cierra porque el planeta se traslada); no es un bug.
- **Bug A (re-pide login) — confianza media.** No lo causa el ciclo de la cabina in-tab (no toca auth). Aparece en un montaje fresco del shell: `render()` monta `<shell-login>` si `authState.user` es falsy (`shell-app.ts:306`), `authState` arranca null (`:45`), `authClient.subscribe()` no reemite el estado al suscribir (`auth-client.ts:45-48`) y la única vía que repone `user` es `me()` en `connectedCallback`, cuyo fallo se traga y que hace `logout()` ante cualquier respuesta no-success (`auth-client.ts:111-113`). Token en `sessionStorage` (no `localStorage`).

### Deseos del usuario (comportamiento esperado)

- El rango de captura es excesivamente amplio → se pierde el control de la posición.
- La cámara gira de forma brusca y continua ante movimientos mínimos del ratón, sin límite ni suavizado.
- Incluso sin mover el ratón, la nave debe orbitar el planeta con movimiento suave y continuo, mostrando el planeta con el sol en la composición (encuadre atractivo y estable), evitando la pérdida de control al entrar/salir.
- Debe calcularse desde qué posiciones/ángulos se alcanza el planeta y, desde ahí, iniciar una transición suave que muestre el sol sin que los controles se vean afectados.
- En órbita, bloqueo parcial de controles: solo entrar o salir.
- Entrar al proyecto no debe re-pedir login (ya autenticado).

## Decisiones que revierten acuerdos previos (CONFIRMAR)

1. **Suavizado de mirada.** El modelo actual es "mirada 1:1 con `movementX/Y` sin interpolación" (confirmado por el usuario en su día; `maxLookRate=30` casi no actúa). Este spec propone AÑADIR un suavizado de paso bajo real y recalibrar `maxLookRate` para que la cámara deje de sentirse brusca. Revierte el 1:1 explícito.
2. **"Volver-orbitando".** El commit `beae8fe` dejó que al volver del proyecto la nave "siguiera orbitando" el planeta. Ese estado no reiniciado ES la causa del Bug B. Este spec propone que al volver quedes en VUELO LIBRE justo fuera de la esfera de influencia (con cooldown anti-recaptura), controlable para ir a otro planeta.

## Principios de diseño

- Lógica pura y testeable con Vitest (sin Three.js) para todo lo calculable: selección del plano orbital, geometría de la cámara de composición, suavizado de mirada, máquina de estados de la órbita, y helpers de marco de mundo. Three.js solo en el cableado del motor.
- Sintonía centralizada en `space-config.ts`, marcada `[UNIFORME]` vs `[PERSONALIZABLE #5]`.
- No se toca `apps/`, el app-registry, ni el contrato del iframe de la cabina.

## Componentes / secciones

Cada sección es independiente y se implementará como su propio paso del plan (TDD). El orden sugerido está al final.

### S1 — Planetas en el marco de mundo (arreglo Bug C)

**Qué:** que los planetas viajen con el mismo marco rebasado que el sol/cinturón/chunks, para que no caigan fuera de niebla/far ni se desincronicen tras el rebase.

**Cómo:**
- En `solar-system.ts`, agrupar los meshes de planetas bajo un `THREE.Group` "sistema" hijo de la escena (centrado en el origen del sistema). `update()` fija posiciones LOCALES vía `orbitPosition(elapsed)` (ya determinista). `rebase(delta)` mueve `group.position.sub(delta)` (patrón de `asteroids.ts:273-311`) en vez de tocar cada mesh.
- El centro entregado a la órbita de la nave (`ApproachInfo.center`) se calcula en coordenadas de ESCENA del frame: `worldCenter = group.position + localPos`. Así la órbita de la nave (que vive en coords de escena) sigue usando el centro correcto y coherente con el rebase.
- La detección de aproximación (`dist <= influenceRadius`) usa `worldCenter` vs `ship.position` (ambos en coords de escena).

**Pura/TDD:** helper `planetWorldCenter(groupPos, localPos)` (trivial pero explícito) y un test de invariante: tras `rebase(delta)`, el `worldCenter` de un planeta cambia exactamente en `-delta` igual que la nave/sol (queda en el mismo marco). `orbitPosition` ya está testeada.

**Archivos:** `solar-system.ts` (wiring + rebase), test nuevo.

### S2 — Recalibración de la captura (rango excesivo)

**Qué:** esfera de captura mucho más ceñida sin perder alcanzabilidad.

**Cómo:**
- Bajar `SOLAR_CONFIG.influenceFactor` de 8 a **3** (esfera = `planetRadius*3`). Se subió a 8 para hacer los planetas alcanzables; se compensa con la inserción asistida de S3/S4 (transición suave) y manteniendo nave rápida / planetas lentos (`acceleration=700`, `orbitSpeedScale=0.3`, ya presentes).
- Añadir `ORBIT_CONFIG.approachHintFactor` (p.ej. **6**) para un radio de AVISO mayor que el de captura: el HUD marca el planeta en aproximación antes de capturar, para que la captura no sorprenda. Solo aviso; no captura.

**Pura/TDD:** función `captureState(dist, planetRadius, {influenceFactor, approachHintFactor})` → `'far' | 'hint' | 'capture'`. Tests de umbrales.

**Archivos:** `space-config.ts`, `solar-system.ts` (usa `captureState`), HUD (aviso).

### S3 — Plano de órbita determinista orientado al sol (arreglo Bug D + composición)

**Qué:** eliminar la dependencia del plano orbital respecto a la velocidad de llegada; el plano se elige de forma determinista y coherente con la dirección del sol, para una órbita estable y una composición planeta+sol.

**Cómo (módulo puro nuevo `orbit-frame.ts`):**
- `buildOrbitBasis({ center, ship, sun })` → `{ U, V, N }` ortonormal:
  - `sunDir = normalize(sun - center)`.
  - `N` (normal del plano orbital) `= normalize(cross(sunDir, worldUp))`; si degenerado (sunDir ~‖ up), fallback `cross(sunDir, worldForward)`.
  - `U` (radial inicial) `= normalize(proj de (ship - center) sobre el plano ⟂ N)`; si degenerado, `U = cross(N, sunDir)` normalizado.
  - `V = cross(N, U)` (sentido de avance).
- Resultado: el plano contiene el eje planeta→sol, por lo que la órbita pasa por delante/detrás del sol respecto al planeta; determinista (misma entrada → mismo plano), sin dependencia del ruido de llegada.
- `beginOrbit` usa `buildOrbitBasis` en vez de derivar de `shipState.velocity`. `advanceOrbit` se mantiene (radio constante por construcción). `angularSpeed` (auto-órbita suave sin ratón) se mantiene.

**Pura/TDD:** ortonormalidad de `{U,V,N}`, determinismo (idempotencia), que `sunDir` yace en el plano (`dot(sunDir, N) ≈ 0`), y los casos degenerados (nave sobre el eje, sunDir ‖ up).

**Archivos:** `orbit-frame.ts` (nuevo) + test; `space-engine.ts` (`beginOrbit`).

### S4 — Cámara de composición en órbita (encuadre estable planeta+sol)

**Qué:** durante la órbita, la cámara encuadra el PLANETA con el SOL en la composición y se mantiene estable mientras la nave orbita visiblemente; transición suave al entrar y salir (sin tirón de controles).

**Cómo:**
- Modo órbita en la cámara (en `chase-camera.ts` o `orbit-camera.ts` nuevo). Geometría PURA `orbitCameraPose({ center, sun, planetRadius, params })` → `{ position, target, up }`:
  - `target` = `center` (con leve desplazamiento para dejar aire al sol).
  - `position` = `center + back * dist`, donde `back` se deriva de `sunDir` y `worldUp` de forma determinista para que el sol quede al fondo/lateral del encuadre (composición a contraluz). `dist` proporcional a `planetRadius` (encuadre que llena ~⅓ del alto).
  - La nave orbita dentro del encuadre (elemento visible en movimiento); la cámara NO persigue a la nave en órbita.
- Transición: al capturar, lerp de la cámara desde la pose de chase hacia la pose orbital (constante de tiempo `orbitCamEaseSeconds`); al salir, lerp de vuelta. Sin roll.

**Pura/TDD:** `orbitCameraPose` — el sol queda en el semiespacio del fondo (`dot(sun - position, target - position) > 0`), la cámara mira al planeta, distancia ∝ radio, determinista.

**Archivos:** `chase-camera.ts` (modo órbita) o `orbit-camera.ts` (nuevo) + test; `space-engine.ts` (selección de modo en `loop`); `space-config.ts` (`CAMERA_CONFIG.orbit*`).

### S5 — Bloqueo parcial de controles + salida explícita (deseo + reemplazo del modelo de expulsión)

**Qué:** en órbita solo dos acciones: **Entrar** y **Salir de la órbita**. Se elimina "el empuje expulsa".

**Cómo (ajuste de la máquina pura `orbit.ts`):**
- `OrbitInput` pasa a `{ insideInfluence, enterPressed, exitPressed, dt }` (fuera `thrustActive`).
- En `'orbiting'`: `enterPressed` → acción `enter`; `exitPressed` → `'ejecting'` (acción `eject`); salir de influencia → `'free'`. El empuje ya no expulsa; mirar y empujar quedan deshabilitados (ya se ignora la mirada; ahora también el empuje no tiene efecto en órbita, lo cual ya ocurre porque `ship.orbiting` no integra empuje — se elimina la expulsión por empuje).
- Cableado en `space-engine.ts`: `exitPressed` = tecla dedicada de "salir de órbita" (propuesta: **S**/"freno", que en órbita no frena) o botón "Salir" del HUD. `enter` = **E** o botón "Entrar". Esc permanece reservado a "salir del proyecto" cuando estás DENTRO del proyecto, para no colisionar. Salir de órbita = transición suave a vuelo libre + impulso radial suave + cooldown anti-recaptura.
- Se elimina `captureGrace` (ya no hace falta, porque el empuje no expulsa); se conserva `ejectCooldownSeconds`.

**Pura/TDD:** `stepOrbit` con el nuevo contrato: enter y exit explícitos, sin auto-eject por empuje; enter gana a exit si ambos; cooldown tras salir.

**Archivos:** `orbit.ts` + test (actualizar los existentes); `space-engine.ts` (`updateOrbit`, teclas, HUD `onEnter`/`onExit`); `space-config.ts` (`ORBIT_CONFIG`); `hud.ts` (botón Salir).

### S6 — Re-entrada tras volver del proyecto (arreglo Bug B)

**Qué:** al volver del proyecto quedas en vuelo libre controlable, no atrapado orbitando.

**Cómo:**
- En `enterProject` (antes de `pause()`) y/o en `resume()`/`exitCockpit`: resetear `this.orbit` a `{phase:'free', cooldown: ejectCooldownSeconds, grace:0}` (cooldown para no re-capturar el mismo planeta al instante), `this.ship.setOrbiting(false)`, y limpiar `this.approachingApp`. Empujar la nave ligeramente hacia afuera de la esfera para no reentrar en el mismo frame.
- Así, al reanudar, WASD vuelve a integrar empuje y `advanceOrbit` deja de re-anclar.

**Pura/TDD:** helper `freeAfterExit(orbitParams)` que produce el estado 'free' con cooldown; test de que tras el reset, un frame con `insideInfluence=true` NO recaptura mientras el cooldown > 0.

**Archivos:** `space-engine.ts` (`enterProject`, `resume`); posible helper en `orbit.ts` + test.

### S7 — Suavizado real de la mirada en vuelo libre (queja de brusquedad)

**Qué:** giros suaves; se acaba la sensación brusca ante movimientos mínimos.

**Cómo:**
- Función PURA en `flight-math.ts`: `dampedFollow(current, target, damp, delta)` (paso bajo exponencial: `current + (target-current)*(1 - exp(-damp*delta))`). En `ShipController.update`, la mirada aplicada persigue el objetivo crudo con `dampedFollow` y luego se acota con `limitAngularStep` (se conserva).
- `CONTROL_CONFIG`: nuevo `lookDamp` (p.ej. **12**, `[PERSONALIZABLE #5]`) y recalibrar `maxLookRate` a un valor que actúe (p.ej. **8** rad/s en vez de 30). `sensitivity` se mantiene o se afina.

**Pura/TDD:** `dampedFollow` converge a `target`, es estable con delta variable, y a `damp` alto se aproxima al 1:1.

**Archivos:** `flight-math.ts` + test; `ship-controller.ts`; `space-config.ts`.

### S8 — Persistencia de sesión (arreglo Bug A)

**Qué:** no re-pedir login si el usuario ya está autenticado.

**Cómo:**
- `authClient.subscribe(cb)` reemite el estado actual al suscribir (llama `cb(state)` de inmediato) O `shell-app` inicializa `authState` desde `authClient.getState()` de forma síncrona en `connectedCallback`. Así `user` se rehidrata del token persistido sin depender de `me()`.
- `me()` NO ejecuta `logout()` ante fallos transitorios/red; solo ante 401/token inválido explícito. Distinguir "sesión expirada" de "fallo de red".
- Persistir el estado de auth en `localStorage` en vez de `sessionStorage` (sobrevive recargas y pestañas). Migración simple: al leer, si no hay en localStorage pero sí en sessionStorage, adoptarlo.
- No toca el contrato del iframe de la cabina (es `auth-client.ts` + `shell-app.ts`).

**Pura/TDD (vitest jsdom):** `subscribe` reemite el estado inicial; `me()` ante error de red conserva la sesión; rehidratación desde storage repone `user`.

**Archivos:** `shell/src/services/auth-client.ts`, `shell/src/components/shell-app.ts` + tests.

**Verificación runtime pendiente (no bloquea el arreglo):** confirmar si al volver del proyecto la página se recarga (montaje fresco) o si alguna app embebida navega el top. El arreglo cubre el caso dominante en cualquier caso.

## Flujo de datos (órbita, tras el rediseño)

1. `solar-system.update()` mueve los planetas (marco de mundo, S1) y calcula `approaching` con `captureState` (S2) usando `worldCenter`.
2. `updateOrbit()`: `stepOrbit` (S5) con `enter/exit` explícitos. Al capturar, `beginOrbit` fija la base con `buildOrbitBasis` (S3). `advanceOrbit` mantiene radio constante alrededor del centro vivo.
3. `loop()`: si `orbit.phase==='orbiting'`, la cámara usa `orbitCameraPose` con transición suave (S4); si no, chase-cam normal con mirada suavizada (S7).
4. Entrar a proyecto (`enterProject`) o volver (`resume`): reset a vuelo libre + cooldown (S6).
5. Sesión (S8) es ortogonal al motor.

## Testing

- Vitest puro (sin Three.js) para: `buildOrbitBasis`, `orbitCameraPose`, `dampedFollow`, `stepOrbit` (nuevo contrato), `captureState`, helpers de marco de mundo y `freeAfterExit`.
- Vitest jsdom para auth (S8).
- Verificación visual/feel por el usuario en `http://localhost:8080` (o el arnés dev) tras recompilar: captura ceñida, órbita estable con el sol encuadrado, giros suaves, poder salir y entrar a otro planeta, planetas que no desaparecen, y no re-login.
- Comandos: `pnpm --filter @plataforma/shell test`, `lint`, `build`.

## Orden de implementación sugerido

1. **S1** (marco de planetas) — base; sin él, C persiste y complica la prueba visual.
2. **S6** (reset al volver) — desbloquea probar entradas repetidas.
3. **S3 + S5** (plano determinista + control entrar/salir) — núcleo de la órbita.
4. **S4** (cámara de composición) — encima de S3.
5. **S2** (recalibración de captura) — afinado tras S3/S4.
6. **S7** (suavizado de mirada) — independiente.
7. **S8** (sesión) — independiente.

## Riesgos y notas

- S3/S4 redefinen la sensación de la órbita: alto riesgo de "feel"; afinar con el usuario. `buildOrbitBasis` y `orbitCameraPose` deben cubrir bien los casos degenerados (nave alineada con el eje planeta-sol).
- La deriva epitrocoidal (la órbita "no cierra" respecto al fondo) es correcta; si molesta, es decisión aparte (no se arregla aquí).
- S8 toca auth del shell; no toca el contrato del iframe. Confirmar el disparador en runtime como seguimiento.
- El circuito de obstáculos (#6) sigue pendiente y fuera de alcance; la costura `enterProject` se respeta.
