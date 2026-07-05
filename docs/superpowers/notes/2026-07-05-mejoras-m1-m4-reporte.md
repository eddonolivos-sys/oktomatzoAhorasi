# Mejoras M1-M4 (post-Hito 7): reporte de cierre

**Fecha:** 2026-07-05 · **Rama:** `ramatzo`

Correcciones sobre 4 problemas reportados por el usuario tras probar el
sistema, con causa raíz ya verificada y localizada (file:line) por el
planificador antes de esta ronda. Cuatro commits, uno por mejora:

| # | Commit | Alcance |
|---|---|---|
| 1 | `6e1ddf6` | Cámara rígida en vuelo libre |
| 2 | `5f9d5c3` | Planetas y sol siempre visibles |
| 3 | `ffedbd8` | Carrera: escala ×10, parrilla de salida, botón de sala |
| 4 | `fcf2d72` | Aviso de escritorio en móvil + docs de despliegue público |

## Mejora 1 — Cámara rígida en vuelo libre

**Causa:** `chase-camera.ts` seguía la nave con un resorte (`lerp`,
`stiffness=8`) y miraba con un adelanto proporcional a la VELOCIDAD
(`lookAhead * 0.15`) en vez de la orientación — sensación de cámara con
inercia/deriva.

**Arreglo:** modo rígido (`CAMERA_CONFIG.chaseRigid`, `true` por defecto):
posición = offset rotado por el quaternion del raíz SIN lerp; orientación =
quaternion del raíz directamente (sin `lookAt`). El modo resorte anterior se
conserva íntegro tras `chaseRigid=false` para poder revertir el feel sin
tocar código. No se tocó el suavizado ratón→nave de S7
(`lookDamp`/`maxLookRate`), que suaviza la nave, no la cámara.

**Verificado:** con un giro brusco de ratón, `camera.quaternion` iguala a
`ship.quaternion` en el mismo frame (sin lag); con nitro sostenido (~4600
u/s en vuelo libre, antes de la mejora 3a) la distancia entre la posición de
cámara real y la posición-offset esperada se mantiene en **0** en todo
momento.

## Mejora 2 — Planetas y sol siempre visibles

**Causa:** `camera.far` era literalmente igual a `fogFar` (ambos 110000):
el recorte del far plane coincidía con el punto donde debía EMPEZAR el
desvanecido por niebla, así que los objetos desaparecían en seco
(dependiente del ángulo) en vez de esfumarse. El sprite de iniciales
heredaba `fog` por defecto (se desvanecía entre 55k-110k dejando al planeta
sin marcador) y tenía escala fija en mundo (sub-píxel a distancias grandes).

**Arreglo:** `camera.far` desacoplado a `SOLAR_CONFIG.cameraFar=300000`
(cubre el peor caso nave↔planeta, ~230000, acotado por
`rebaseThreshold=200000` + radio de órbita ~30000); `camera.near` subido a 1
(antes 0.1). La niebla (`fogNear`/`fogFar`, sin cambios) sigue ocultando el
fondo por su cuenta. Sprite de iniciales con `fog:false` + escala
compensada por distancia (nuevo módulo puro `sprite-scale.ts`,
`markerScaleForDistance`, 5 tests).

**Verificado:** fórmula de escala coincide exactamente con el cálculo
cerrado en el rango 1k-150k u; sol visible a ~191k u (antes invisible en
seco a partir de ~110k); sin z-fighting visible en la superficie de un
planeta con `near=1`.

## Mejora 3 — Carrera espacial: tres arreglos

**(a) Pista ×10 + tope de velocidad.** La nave sin `maxSpeed` alcanzaba
~4600 u/s con nitro, superando el radio de giro del circuito original
(`baseRadius=2200`). `baseRadius` sube a 22000 (×10, pedido por el usuario),
escalando proporcionalmente `checkpointRadius`/`offTrackToleranceDistance`/
`zoneRadius`/`heightJitter`. Nuevo `RACE_CONFIG.speedCap=3000` vía
`ShipController.setRaceSpeedCap()`, resincronizado cada frame contra la
fase actual (no solo en las transiciones) para que ningún camino de salida
lo deje pegado. `center` (z=70000) no invade las órbitas de planetas (punto
más cercano del anillo al origen: ~43800u, vs. ~30000u de las órbitas).

**(b) Teleport a la salida + checkpoint 0 regalado.** Nuevo helper único
`enterStartingGrid()` (posiciona en la parrilla, orienta hacia
`waypoints[1]`, velocidad a cero), usado tanto por el flujo SP (tecla E,
ahora con countdown local visible — antes solo existía en sala) como por el
bloque de sala y el respawn inicial. `race-grid.ts` gana un parámetro
`behindDistance`: la parrilla queda `checkpointRadius × 1.5` DETRÁS de
`waypoints[0]` en vez de exactamente encima — corrige el "regalo" del
checkpoint 0 en SP y en sala con un solo cambio compartido.

**(c) Botón de inicio de sala muerto.** `roomsPanel.showLobby()` se llamaba
cada frame y reconstruía el `innerHTML` completo (incluido `.rooms-start` y
sus listeners) en cada llamada — el click del usuario caía sobre un nodo ya
destruido y nunca disparaba `start_race`. Doble fix: (1) salta el re-render
si una clave serializada del estado no cambió; (2) delegación de eventos
(listener único y persistente en la raíz del panel). Además: `KeyE`/`Space`
ya no arrancan una carrera SP local mientras hay una sala activa; `KeyR`
bloqueado durante la cuenta atrás SP; `onCanvasClick` ya no recaptura el
pointer lock con el panel de salas visible.

**Verificado contra el stack real** (space-server real, botón clicado con
un click de verdad vía `preview_click`, no invocando el callback
directamente): velocidad clavada en 3000 u/s bajo nitro sostenido;
`currentCheckpoint` pasa de 0 a 1 solo tras recorrer la distancia real
(3300u), tanto en SP como en sala; el botón "Iniciar carrera" de una sala
real dispara `start_race` y la carrera arranca correctamente — antes de
este fix, el mismo click real NUNCA producía efecto.

## Mejora 4 — Aviso de escritorio en móvil + docs

La causa raíz principal (túnel del VPS desconectado, Cloudflare 530/1033)
es infraestructura del usuario — no se tocó, según lo pedido. Código del WS
ya verificado limpio (`wss://` relativo, sin `localhost` hardcodeado).

**Código:** `shell-space.ts` detecta dispositivos sin puntero fino
disponible (`matchMedia('(pointer: coarse)')` sin
`matchMedia('(any-pointer: fine)')` — no existe API web para detectar un
teclado físico, este es el proxy estándar) y muestra un aviso sobrio
ámbar/crema "Experiencia de escritorio", dismissable, sin bloquear el motor
(a diferencia del aviso de WebGL no disponible). Lógica de decisión en un
módulo puro nuevo (`device-warning.ts`, `shouldWarnDesktopOnly`, 4 tests).

**Docs:** `docs/deployment.md` gana una sección "Verificación e2e contra el
dominio público" (el Hito 7 solo validó `localhost:8080`) y una aclaración
de que el túnel PERMANENTE es un servicio systemd del VPS distinto del
contenedor `cloudflared` del overlay `docker-compose.internet.yml` (el
"Rápido", para pruebas con URL efímera) — si el túnel permanente se cae, el
diagnóstico es en el VPS, no en este repo.

**Verificado:** overlay renderiza con la estética esperada, no bloquea el
motor por debajo (confirmado con el motor corriendo visible detrás), el
botón "Continuar de todas formas" lo cierra correctamente. La rama de
decisión (`shouldWarnDesktopOnly`) está exhaustivamente cubierta por tests
puros dado que esta herramienta de preview no emula la capacidad de
puntero/touch real de un dispositivo (solo cambia el tamaño de viewport).

## Rendimiento (p95 frame time)

| Momento | Escenario | p95 | Draw calls | Triángulos |
|---|---|---|---|---|
| Baseline (Hito 0) | Vuelo libre en spawn | 8.50 ms | 95 | 32316 |
| Tras M2 (far=300000, near=1) | En órbita, arnés con 4 apps | 8.50 ms | 220 | 48016 |
| Tras M3 (pista ×10) | Centro de zona de carrera, arnés con 4 apps | 8.50 ms | 89 | 26170 |
| **Final (M1-M4, bundle real desplegado)** | **Vuelo libre en spawn, app-registry real (8 apps)** | **8.50 ms** | **120** | **52326** |

Sin regresión de rendimiento en ningún punto — el p95 se mantiene
idéntico al baseline (8.50 ms) durante toda la ronda, con RTT de
multijugador en 18 ms (real, contra el space-server desplegado; muy por
debajo del presupuesto de 120 ms).

## Tests

Suite completa del shell: **301/301** (28 archivos). Nuevos en esta ronda:
`sprite-scale.test.ts` (5), `race-grid.test.ts` (+3, ahora 8 en total),
`device-warning.test.ts` (4). `pnpm --filter @plataforma/shell lint`/`build`:
limpios en cada commit.

## Hash de bundle

- Antes de esta ronda (cierre Hito 7): `index-BgnRfGH_.js`.
- Después (las 4 mejoras, redesplegado con `deploy/ejec-shell.bat`):
  `index-DE4qYIV4.js`, verificado servido en `http://localhost:8080/`.

## Arnés de depuración

`shell/debug.html` + `shell/src/debug-space.ts` (con apps falsas para tener
planetas reales, identidad fabricada para multijugador real) y el proxy
temporal de `shell/vite.config.ts` se usaron para toda la verificación
runtime de M1-M3 y se borraron/revirtieron antes de cada commit
correspondiente. M4 se verificó contra el bundle ya desplegado en
`localhost:8080` (no requería el arnés, ya que `shell-space.ts` no forma
parte del camino que el arnés monta).

## Desviaciones y decisiones propias documentadas

- M3 se implementó y commiteó como UNA sola mejora ("mejora 3") cubriendo
  los tres arreglos (a/b/c) en vez de tres commits separados: los tres
  tocan el mismo bloque de código y comparten el mismo criterio de
  verificación e2e dado por el planificador.
- El fix del botón de sala (3c) se implementó con DOS mecanismos
  complementarios (salto de re-render por clave de estado + delegación de
  eventos) en vez de solo uno de los dos sugeridos, como defensa en
  profundidad — cualquiera de los dos por sí solo ya resolvía el bug
  observado.
- La corrección de "no regalar el checkpoint 0" (pedida explícitamente
  solo para el arranque SP en el enunciado de 3b) se aplicó al helper
  COMPARTIDO `startingSlotPosition`, corrigiendo el mismo problema latente
  en el flujo de sala de paso — no se dejó la sala con el bug sabiendo que
  el arreglo compartido ya lo resolvía gratis.
- La constante `ROOMS_CONFIG.countdownSeconds` se renombró/trasladó a
  `RACE_CONFIG.startCountdownSeconds` (usada ahora por SP y por sala por
  igual) — cambio mecánico, sin impacto de comportamiento salvo unificar
  el valor.

## Bloqueos

Ninguno. La causa raíz de M4 (túnel VPS) queda explícitamente fuera del
alcance de esta ronda, tal como se indicó.
