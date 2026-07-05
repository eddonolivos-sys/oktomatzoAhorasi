# Hito 7 — Endurecimiento y despliegue final: reporte de cierre

**Fecha:** 2026-07-05

## Alcance

Sin código nuevo de producto: checklist e2e manual ejecutado contra el
stack real desplegado (`http://localhost:8080`), revisión de consumo de
recursos, actualización de `docs/deployment.md`, limpieza de flags y
verificación final de caché.

## Checklist e2e ejecutado (guest y registrado)

Todo verificado contra el stack real (`docker compose`, no el arnés dev),
navegando la app real vía Preview con clics/eventos de teclado reales
(deep-query a través de shadow roots donde aplica):

- [x] **Login como invitado**: botón con el label exacto requerido
      ("Quién te crees que eres para pedirme el login?" / "Continuar
      como invitado") → entra directo al espacio 3D.
- [x] **Modal de audio**: abre/cierra correctamente, controles de volumen
      y silenciar visibles (Hito 3).
- [x] **Menú de pausa**: abre con ESC, muestra Configuración/Controles/
      Cerrar sesión.
- [x] **Cerrar sesión (invitado)**: vuelve limpio a la pantalla de login.
- [x] **Registro de usuario nuevo**: formulario Nombre/Correo/Contraseña,
      alta exitosa, entra directo al espacio (mismo flujo que login).
- [x] **Aproximación + captura orbital** a un planeta real (`Búsqueda`):
      captura automática dentro del radio de influencia, HUD muestra
      "ENTRAR AL PROYECTO (SPACE/E)" / "Salir de la órbita (S)".
- [x] **Entrar a un proyecto** (E): carga la cabina (iframe) a pantalla
      completa con "VOLVER AL ESPACIO (ESC)"/"SALIR" visibles; probado
      con la app "Búsqueda" (búsqueda de documentación).
- [x] **Volver al espacio** (ESC desde la cabina): motor se reanuda,
      nave permanece en órbita del mismo planeta (no se pierde el
      estado); **S** para salir de la órbita devuelve a vuelo libre.
- [x] **Carrera espacial single-player**: teletransporte a la zona,
      **E** inicia la carrera, HUD muestra checkpoint/vuelta/aviso de
      fuera de pista correctamente, **Q** abandona limpiamente
      (`raceState.phase` vuelve a `idle`).
- [x] **Salas multijugador** (Hito 6): **R** abre el panel, "Crear sala
      nueva" crea una sala real en el servidor (confirmado vía
      `GET /rooms` a través de Caddy), el lobby muestra correctamente al
      usuario **registrado** (nombre real, no solo invitados) como host;
      "Cerrar"/"Salir de la sala" destruye la sala al vaciarse (confirmado
      vía `/rooms` de nuevo).
- [x] **Cerrar sesión (registrado)** y **reingreso con las mismas
      credenciales**: login exitoso, confirma persistencia de cuenta en
      el backend real.
- [x] Sin errores en consola del navegador durante todo el recorrido
      (`preview_console_logs` con filtro `error`, vacío en cada punto de
      control).

No se ejecutó un segundo navegador real simultáneo (fuera del alcance de
las herramientas disponibles); la interacción multi-cliente ya se validó
exhaustivamente en el Hito 6 (transferencia de host, aislamiento de
salas) con clientes WebSocket reales contra el mismo servidor.

## Revisión de consumo (docker stats)

No existía un baseline previo de consumo de contenedores (el baseline del
Hito 0 midió frame time/RTT, no CPU/memoria de Docker). Se tomó un
snapshot de referencia con los 14 servicios en reposo — ver la nueva
sección "Consumo de recursos" en `docs/deployment.md`. Todos los
servicios están muy por debajo de cualquier límite razonable (el más
pesado, `oktomatzo2-app`, ~87 MiB en reposo); nada indica una regresión
de recursos introducida por los Hitos 1-6.

## Documentación actualizada

`docs/deployment.md`:
- Comando VPS corregido para incluir el overlay `docker-compose.internet.yml`
  cuando se requiere exposición a internet (antes solo se mostraba en la
  sección de Cloudflare Tunnel, no en la de VPS genérico).
- Nueva sub-sección de redespliegue selectivo documentando los scripts
  `deploy/ejec-*.sh/.bat` ya existentes (creados en un hito anterior) y
  la advertencia de que un cambio en `Caddyfile` requiere reinicio manual
  del contenedor `caddy` (bind mount, no detectado por `docker compose up
  -d`) — descubierto y documentado durante la verificación del Hito 6.
- Tabla de puertos completada con los 6 servicios que faltaban
  (`app-mundo-3d`, `app-combate-3d`, `oktomatzo2-api`, `oktomatzo2-app`,
  `game-server`, `redis`, `space-server`).
- Nueva sección "Consumo de recursos" (snapshot de referencia).
- Nueva sección "Tests" (cómo correr Vitest/lint/build del shell,
  `go test` del backend y del space-server, incluyendo los targets de
  Makefile `test-backend`/`test-space-server`).

`shell/public/audio/README.md`: revisado, ya documentaba correctamente
cómo reemplazar la música/efectos (creado en el Hito 3); sin cambios
necesarios.

## Limpieza de flags/documentos

- `RACE_CONFIG.enabled` y `ROOMS_CONFIG.enabled`: confirmados en `true`
  (ambas funcionalidades están terminadas y en producción, no son flags
  experimentales pendientes de apagar).
- Sin rastro de arneses de depuración (`shell/debug.html`,
  `shell/src/debug-space.ts`) en el árbol de trabajo.
- `shell/vite.config.ts`: sin diffs residuales de ninguna sesión de
  depuración anterior.
- Sin `console.log` sueltos en `shell/src/space/` ni `shell/src/services/`
  (fuera de archivos de test).

## Verificación de caché

No hubo cambios de código en el shell durante este hito (solo
documentación), por lo que no se redesplegó: el hash servido en
`http://localhost:8080/` sigue siendo `index-BgnRfGH_.js`, el mismo
confirmado al cierre del Hito 6.

## Bloqueos

Ninguno.
