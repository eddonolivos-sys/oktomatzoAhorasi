# Baseline de rendimiento — Hito 0

Fecha: 2026-07-04 · Rama: `ramatzo` · Máquina: dev local (Windows, GPU del equipo del
desarrollador — NO representativa del hardware del usuario final; sirve como
referencia relativa para detectar regresiones, no como cifra absoluta).

Instrumentación: `shell/src/space/perf-stats.ts` (ring buffer de 300 muestras de
delta CRUDO, ~5 s a 60 fps; percentiles p50/p95/p99), `renderer.info.render`
(draw calls/triángulos, con `autoReset=false` + reset manual por frame — el
`EffectComposer` llama `renderer.render()` varias veces por frame y el
autoReset por defecto solo dejaba ver la ÚLTIMA pasada, ver
`space-engine.ts`), y ping/pong (`{type:'ping',t}` → `{type:'pong',t}`) para
RTT del WebSocket `/space-ws`, con EWMA (`rttEwma`, α=0.2) en el cliente.

## Metodología

- Motor real (sin fake/mock) montado con el arnés dev `shell/debug.html` +
  `debug-space.ts` (`pnpm --filter @plataforma/shell dev --port 5311
  --strictPort`), abierto en una pestaña de navegador REAL y VISIBLE (no
  headless) para que `requestAnimationFrame` corra sin el freeze de pestaña
  oculta documentado en los errores previos del plan.
- Con `influenceFactor=8` (valor actual, pre-Hito 1) la esfera de captura de
  cada planeta es pequeña (radio físico 144–312 u) frente a las distancias del
  sistema (órbitas de 6 000–30 000 u) y el vuelo no tiene asistencia: alcanzar
  un planeta o el cinturón a ciegas por vuelo libre es poco práctico para un
  baseline reproducible (es precisamente el problema que ataca el Hito 1). Para
  los escenarios 2 y 3 se teletransportó la nave (acceso directo a los campos
  internos del motor desde la consola del arnés, técnica de QA estándar; no
  se tocó ninguna ruta de gameplay) a una posición representativa y se dejó
  que la lógica real (`solarSystem.update` → `stepOrbit`) reaccionara sin
  intervención adicional.
- El snapshot se lee con `window.__space.engine.getPerfSnapshot()` tras
  esperar ~6 s (ventana de 300 muestras llena) en reposo relativo (velocidad
  ≈ 0) en cada escenario.
- RTT: el arnés dev no tiene backend (Vite solo sirve estáticos), así que el
  WebSocket de multijugador nunca llega a conectar y `rttMs` queda `null` en
  los tres escenarios de arriba. Se midió por separado con un cliente
  WebSocket directo (Node, `ws://127.0.0.1:8093/space-ws`) contra el
  contenedor real `deploy-space-server-1` (reconstruido con el eco ping/pong
  nuevo) — ver más abajo.

## Resultados

### 1. Vuelo libre (reposo en el punto de spawn)

| Métrica | Valor |
|---|---|
| frame p50 / p95 / p99 | 8.30 / 8.50 / 8.50 ms |
| frame min / max | 8.10 / 8.60 ms |
| draw calls | 95 |
| triángulos | 32 316 |
| pixelRatio vigente | 1.00 |

### 2. Cerca del cinturón de asteroides Ramatzo

Nave en `(19500, 3000, -45000)` (banda media entre `ramatzoInnerRadius` 17 000
y `ramatzoOuterRadius` 22 000, centrado en `ramatzoCenter`).

| Métrica | Valor |
|---|---|
| frame p50 / p95 / p99 | 8.30 / 8.50 / 8.50 ms |
| frame min / max | 8.00 / 8.60 ms |
| draw calls | 95 |
| triángulos | 26 810 |
| pixelRatio vigente | 1.00 |

### 3. En órbita (planeta "Dashboard Comercial", el más cercano al sol)

Captura automática real (`stepOrbit` → `'orbiting'`) tras colocar la nave a
300 u del centro del planeta (dentro de su `influenceRadius` de 1 152 u).

| Métrica | Valor |
|---|---|
| frame p50 / p95 / p99 | 8.30 / 8.50 / 8.60 ms |
| frame min / max | 8.10 / 8.70 ms |
| draw calls | 110 |
| triángulos | 32 316 |
| pixelRatio vigente | 1.00 |

### RTT del WebSocket `/space-ws` (contenedor real, loopback local)

10 pings directos contra `deploy-space-server-1` (puerto publicado 8093) tras
reconstruir con el eco ping/pong nuevo:

```
muestras (ms): 1, 12, 1, 1, 2, 2, 1, 2, 1, 2
promedio: 2.50 ms
```

Muy por debajo del presupuesto `PERF_CONFIG.rttP95BudgetMs = 120` (Hito 6);
esperable en loopback local. Confirma que el eco Go (`pongFor` en `hub.go` +
`case "ping"` en `main.go`) funciona end-to-end contra el contenedor
reconstruido.

## Lectura del baseline

- El motor está muy lejos de cualquier cuello de botella de GPU/CPU con el
  contenido actual: ~8.3–8.6 ms de frame time (≈ 116–120 fps) es prácticamente
  idéntico en los tres escenarios; la degradación automática de `pixelRatio`
  (`trackFps`, umbral 25 fps promedio) ni se acerca a activarse.
  **Esta cifra es del hardware de desarrollo, no un SLA**: sirve para
  comparar ANTES/DESPUÉS de los Hitos 4/5/6, no como garantía para el usuario
  final.
- Draw calls (95–110) y triángulos (~27 k–32 k) dejan margen amplio antes de
  los presupuestos de los Hitos 5/6 (`PERF_CONFIG.p95BudgetMultiplierRace =
  1.2`, `...Rooms = 1.25`): con este baseline, el presupuesto del Hito 5 sería
  ≤ ~10.2 ms p95 y el del Hito 6 ≤ ~10.6 ms p95 (sobre el peor de los tres
  escenarios, 8.5–8.6 ms).
- El riesgo real para las puertas de latencia NO está en el contenido
  existente sino en lo que se añade después: geometría de la pista de
  obstáculos (Hito 5) y naves remotas + throttle de Redis (Hito 6). El
  baseline aquí es el punto de partida limpio para medir ese delta.
- El eco RTT ping/pong (cliente + Go) está verificado end-to-end contra el
  contenedor real, no solo con tests unitarios.
