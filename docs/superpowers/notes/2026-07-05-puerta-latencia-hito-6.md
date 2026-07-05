# Puerta de latencia pre-Hito 6 — resultado

**Fecha:** 2026-07-05 · **Rama:** `ramatzo`

## Criterios (master plan, sección Hito 6)

> Con Hito 5 en verde, medir con la instrumentación del Hito 0: (a) p95 frame
> time con 4+ naves remotas simuladas en zona de carrera ≤ baseline+25%; (b)
> RTT p95 del WS < 120 ms en LAN/local; (c) sin pérdida de mensajes de
> control. Si NO pasa → el hito se pospone y se documenta.

## Metodología

Igual que el baseline del Hito 0 (motor real, sin mocks), pero esta vez
contra el **stack real desplegado** (`deploy-backend-1`, `deploy-space-server-1`,
`deploy-redis-1`, `deploy-caddy-1`, todos ya en ejecución), para que el
multijugador conecte de verdad:

- Se recreó temporalmente el arnés dev (`shell/debug.html` +
  `shell/src/debug-space.ts`), esta vez con una identidad de usuario
  FABRICADA (`{id:'debug-local-pilot', name:'DebugPilot'}`) para activar el
  multijugador (`SpaceEngine.mount` solo lo activa si `opts.user` existe).
- Se añadió temporalmente un proxy de WebSocket a `shell/vite.config.ts`
  (`/space-ws` → `ws://127.0.0.1:8093`, el puerto publicado de
  `space-server`) para que el arnés dev alcance el servidor real. Revertido
  íntegramente tras la medición (`git diff shell/vite.config.ts` limpio).
- La nave se teletransportó a `RACE_CONFIG.center` (`{0, 4000, 70000}`) vía
  acceso directo a `engine.ship.object.position` desde la consola (misma
  técnica de QA ya usada y documentada en el baseline del Hito 0).
- Se lanzaron **5 clientes WebSocket simulados** (supera el mínimo de 4+ del
  criterio) directamente desde la misma pestaña del navegador contra
  `ws://127.0.0.1:8093/space-ws?room=home&id=simN&name=simN` — mismo
  protocolo que usa el cliente real (`space-multiplayer.ts`), enviando
  `{type:'state',x,y,z,yaw}` cada 50 ms (20 Hz, igual throttle que el
  cliente real) desde posiciones repartidas en un círculo de radio 300
  alrededor del centro de la zona de carrera.
- Se dejó correr la carga sostenida ~1 minuto, leyendo
  `engine.getPerfSnapshot()` y el tamaño de `engine.remoteShips` en varios
  momentos.
- Arnés y proxy borrados/revertidos al terminar (ver sección de limpieza).

## Resultados

| Métrica | Valor medido | Presupuesto | Resultado |
|---|---|---|---|
| Frame p95 (zona de carrera + 5 naves remotas) | **8.5 ms** (p50 8.3, p99 8.5–8.6) | ≤ 10.6 ms (baseline 8.5 × 1.25) | ✅ PASA (0% de sobrecoste medible) |
| RTT (EWMA, WS `/space-ws`) | **1.1–1.8 ms** | < 120 ms | ✅ PASA (muy por debajo, loopback local) |
| Mensajes de control perdidos | **0** (5/5 clientes conectados y visibles todo el tiempo; 2 927 mensajes `state` enviados en 60 s, 0 `close`/`error`) | 0 | ✅ PASA |
| Naves remotas visibles en el cliente real | **5/5** (`remoteShips` con las 5 IDs `sim1..sim5`) | ≥ 4 | ✅ PASA |
| Draw calls (zona de carrera + 5 naves) | 86 (vs. 84 en zona de carrera sin naves) | — (informativo) | +2 por el coste de renderizado de naves remotas, despreciable |

## Veredicto

**PUERTA DE LATENCIA PASADA.** El Hito 6 (salas multijugador con host)
puede proceder sin condicionamientos ni reducción de alcance. El sistema de
multijugador de presencia ya existente (`SpaceMultiplayer`/`RemoteShips`/hub
Go por salas) absorbe 5 naves remotas simultáneas en la zona de carrera sin
degradación medible del frame time ni del RTT.

## Limpieza posterior a la medición

- `shell/debug.html` y `shell/src/debug-space.ts`: borrados
  (`git status --short shell/` sin rastro).
- `shell/vite.config.ts`: proxy temporal revertido (`git diff` limpio, sin
  cambios respecto al commit anterior).
- Los 5 WebSocket simulados se cerraron explícitamente
  (`ws.close()` + `clearInterval`) antes de detener el servidor de
  depuración.
- Ningún archivo de este hito (task de puerta, no de implementación) requiere
  commit de código — solo este reporte.
