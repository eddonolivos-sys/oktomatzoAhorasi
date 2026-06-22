---
# Multijugador — cliente del shell (presencia + naves remotas + emoticonos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Ver y sentir a otros jugadores conectados en el espacio post-login: sus naves moviéndose con su nombre, comunicación por emoticonos y persistencia de posición, todo conectado al servidor `space-server` del plan 01.

**Architecture:** La lógica pura y testeable (throttle de envío, interpolación de estado, conversión `worldOffset`↔escena, sector de la rueda de emoticonos) vive en módulos THREE-free probados con Vitest. `space-multiplayer.ts` es el cliente WebSocket (espejo de `MultiplayerClient` de `app-combate-3d`) que conecta, envía estado con throttle, envía emoticonos, expone callbacks y reconecta con backoff. `remote-ships.ts` gestiona un `Map<id, RemoteShip>` con un modelo de nave ligero, interpolación entre snapshots, etiqueta de nombre proyectada a pantalla y emoji flotante temporal. `emote-wheel.ts` es un overlay DOM radial abierto con la tecla `C`. `space-engine.ts` orquesta: tras `mount` con `opts.user`, conecta, difunde la posición absoluta de la nave (escena + `worldOffset`) con throttle, coloca las naves remotas en `pos - worldOffset` y cablea la rueda de emoticonos. La identidad (`{id, name}`) fluye `shell-app` → `shell-space` → `engine.mount`.

**Tech Stack:** TypeScript, Three.js 0.170, Lit 3, Vitest (entorno node). Package @plataforma/shell. WebSocket nativo del navegador.

**Depends on:** Plan 01 (`docs/superpowers/plans/2026-06-15-multijugador-01-servidor.md`): el servidor `space-server` (Go + Redis) y la ruta Caddy `/space-ws` deben existir para la verificación manual end-to-end. La integración del cliente (tipos/build) NO requiere el servidor corriendo; tsc/build/Vitest la validan sin él.

---
---

## File structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `shell/src/space/multiplayer-math.ts` | Crear | Lógica pura THREE-free: `shouldSendState(now, last, intervalMs)` (throttle), `lerpState(from, to, t)` (interpola `{x,y,z,yaw}` con clamp de `t` y yaw de arco más corto), `toAbsolute(scenePos, worldOffset)` / `toScene(absPos, worldOffset)` (round-trip de `worldOffset`), `emoteWheelSector(dxNorm, dyNorm)` (3 sectores + centro muerto → `0|1|2|null`). Sin Three.js. |
| `shell/src/space/multiplayer-math.test.ts` | Crear | Tests Vitest de `multiplayer-math.ts`. |
| `shell/src/space/space-multiplayer.ts` | Crear | `class SpaceMultiplayer`: cliente WebSocket (espejo de `MultiplayerClient`). `connect({room,id,name})`, `sendState({x,y,z,yaw})` con throttle vía `shouldSendState`, `sendEmote(emoji)`, callbacks `onPlayers/onJoined/onLeft/onEmote`, reconexión con backoff, `disconnect`. Parsea los mensajes anclados del servidor. |
| `shell/src/space/remote-ships.ts` | Crear | `class RemoteShips`: gestiona `Map<id, RemoteShip>` con modelo de nave ligero (variante de `createPlayerShip`), interpolación `from→to` vía `lerpState` en `update(delta)`, alta/baja en `joined`/`left`, etiqueta de nombre proyectada (patrón `project()` del motor) y emoji flotante temporal (~3 s). Dispose-safe. |
| `shell/src/space/remote-ship-model.ts` | Crear | `createRemoteShip()`: modelo de nave LIGERO (menos luces/greebles que `createPlayerShip`), para las naves remotas. Devuelve `{ object, dispose }`. |
| `shell/src/space/emote-wheel.ts` | Crear | `class EmoteWheel`: overlay DOM radial (3 caras feliz/triste/enojada) abierto con `C`; selección por clic en sector o teclas `1/2/3`; `Esc` cierra sin enviar; callback con el emoji elegido. Dispose-safe. |
| `shell/src/space/space.css` | Modificar | Añadir estilos sobrios (sin neón) para `.remote-name`, `.remote-emote` y `#emoteWheel`. |
| `shell/src/space/space-engine.ts` | Modificar | Añadir `user?: { id: string; name: string }` a `MountOpts`; tras `mount` crear `SpaceMultiplayer` + `RemoteShips` + `EmoteWheel`; cada frame difundir estado absoluto con throttle, actualizar/colocar remotas en `pos - worldOffset`, recolocar etiquetas; tecla `C` abre la rueda; `onEmote` muestra emoji flotante (propio y remoto); dispose. Si no hay `opts.user`, omite multijugador. |
| `shell/src/components/shell-space.ts` | Modificar | Añadir `@property() user` y pasarlo a `engine.mount({ ..., user })`. |
| `shell/src/components/shell-app.ts` | Modificar | Pasar `.user=${this.authState.user}` a `<shell-space>`. |

> **Nota sobre tests:** el WebSocket en sí NO se prueba en unidad (necesita el stack vivo). Lo testeable es la lógica pura de `multiplayer-math.ts`. La integración del motor/escena/DOM la valida `tsc`/`build`; el extremo a extremo lo valida el usuario con 2+ navegadores + el stack.

> **Nota sobre el emoji "feliz/triste/enojada":** el protocolo usa los identificadores `"happy" | "sad" | "angry"`. La UI los muestra como glifos sobrios (p. ej. `:)` / `:(` / `>:(` o caracteres tipográficos); NO usar emojis a color (la dirección de diseño prohíbe emojis y neón). El glifo se decide en `emote-wheel.ts` y en `remote-ships.ts` con un mapa `EMOTE_GLYPH`.

---

### Task 1: `multiplayer-math.ts` — `shouldSendState` (throttle de envío)

**Files:**
- Test: `shell/src/space/multiplayer-math.test.ts` (crear)
- Create: `shell/src/space/multiplayer-math.ts` (crear)

- [ ] **Step 1: Write the failing test**

Crear `shell/src/space/multiplayer-math.test.ts` con:

```ts
import { describe, it, expect } from 'vitest';
import { shouldSendState } from './multiplayer-math';

describe('shouldSendState', () => {
  it('permite enviar la primera vez (last = 0) si ya pasó el intervalo', () => {
    expect(shouldSendState(50, 0, 50)).toBe(true);
  });

  it('bloquea si no ha pasado el intervalo completo', () => {
    expect(shouldSendState(149, 100, 50)).toBe(false);
  });

  it('permite justo al cumplirse el intervalo (>=)', () => {
    expect(shouldSendState(150, 100, 50)).toBe(true);
  });

  it('permite muy por encima del intervalo', () => {
    expect(shouldSendState(1000, 100, 50)).toBe(true);
  });

  it('intervalo de 50ms ≈ 20Hz: a 49ms bloquea, a 50ms pasa', () => {
    expect(shouldSendState(149.9, 100, 50)).toBe(false);
    expect(shouldSendState(150.0, 100, 50)).toBe(true);
  });

  it('now anterior a last (reloj raro) no envía', () => {
    expect(shouldSendState(90, 100, 50)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
  Run (desde la raíz del repo): `pnpm --filter @plataforma/shell exec vitest run shell/src/space/multiplayer-math.test.ts`
  Expected: FAIL — el módulo `./multiplayer-math` no existe / `shouldSendState` no está definido.

- [ ] **Step 3: Write minimal implementation**

Crear `shell/src/space/multiplayer-math.ts` con:

```ts
/**
 * Lógica pura del multijugador (sin Three.js, testeable con Vitest en node),
 * siguiendo el patrón de flight-math.ts / hud-format.ts. El cliente WebSocket,
 * la escena y el DOM viven en otros módulos; aquí solo van números puros.
 */

/**
 * Throttle de envío de estado: devuelve true si `now` está al menos `intervalMs`
 * después de `last` (último envío). Con intervalMs=50 → ~20 Hz.
 * now/last en milisegundos (p. ej. performance.now()).
 */
export function shouldSendState(now: number, last: number, intervalMs: number): boolean {
  return now - last >= intervalMs;
}
```

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/multiplayer-math.test.ts`
  Expected: PASS — los 6 casos de `shouldSendState` pasan.

- [ ] **Step 5: Commit**
  `git add shell/src/space/multiplayer-math.ts shell/src/space/multiplayer-math.test.ts && git commit -m "test(space): shouldSendState — throttle de envío de estado multijugador"`

---

### Task 2: `multiplayer-math.ts` — `lerpState` (interpolación de estado)

**Files:**
- Test: `shell/src/space/multiplayer-math.test.ts` (modificar — añadir bloque)
- Modify: `shell/src/space/multiplayer-math.ts`

- [ ] **Step 1: Write the failing test**

Añadir AL FINAL de `shell/src/space/multiplayer-math.test.ts`:

```ts
import { lerpState } from './multiplayer-math';

describe('lerpState', () => {
  const A = { x: 0, y: 0, z: 0, yaw: 0 };
  const B = { x: 10, y: 20, z: -30, yaw: 1 };

  it('t=0 devuelve el estado origen', () => {
    expect(lerpState(A, B, 0)).toEqual({ x: 0, y: 0, z: 0, yaw: 0 });
  });

  it('t=1 devuelve el estado destino', () => {
    expect(lerpState(A, B, 1)).toEqual({ x: 10, y: 20, z: -30, yaw: 1 });
  });

  it('t=0.5 interpola la posición a la mitad', () => {
    const r = lerpState(A, B, 0.5);
    expect(r.x).toBeCloseTo(5, 10);
    expect(r.y).toBeCloseTo(10, 10);
    expect(r.z).toBeCloseTo(-15, 10);
  });

  it('hace clamp de t por debajo de 0', () => {
    expect(lerpState(A, B, -2)).toEqual({ x: 0, y: 0, z: 0, yaw: 0 });
  });

  it('hace clamp de t por encima de 1', () => {
    expect(lerpState(A, B, 5)).toEqual({ x: 10, y: 20, z: -30, yaw: 1 });
  });

  it('yaw: toma el arco más corto cruzando ±π (de 3.0 a -3.0 va hacia arriba, no da la vuelta)', () => {
    // diff "ingenuo" = -6.0 (vuelta larga). Arco corto = +0.283 (cruza π).
    const r = lerpState({ x: 0, y: 0, z: 0, yaw: 3.0 }, { x: 0, y: 0, z: 0, yaw: -3.0 }, 0.5);
    // El resultado debe estar cerca de ±π (el punto medio del arco corto), no cerca de 0.
    expect(Math.abs(r.yaw)).toBeGreaterThan(3.0);
  });

  it('yaw: interpolación normal sin cruce de wrap', () => {
    const r = lerpState({ x: 0, y: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: 0, yaw: 1 }, 0.5);
    expect(r.yaw).toBeCloseTo(0.5, 10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/multiplayer-math.test.ts`
  Expected: FAIL — `lerpState` no está exportado.

- [ ] **Step 3: Write minimal implementation**

Añadir a `shell/src/space/multiplayer-math.ts`:

```ts
/** Estado interpolable de una nave (coordenadas absolutas de mundo + rumbo). */
export interface PlayerState {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Diferencia angular envuelta a (−π, π] (arco más corto entre dos ángulos). */
function shortestAngleDiff(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Interpola linealmente posición y yaw de `from` a `to` con factor `t∈[0,1]`
 * (clamp). El yaw usa el arco más corto (envoltura por ±π) para no "dar la vuelta".
 */
export function lerpState(from: PlayerState, to: PlayerState, t: number): PlayerState {
  const k = Math.max(0, Math.min(1, t));
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
    z: from.z + (to.z - from.z) * k,
    yaw: from.yaw + shortestAngleDiff(from.yaw, to.yaw) * k,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/multiplayer-math.test.ts`
  Expected: PASS — `shouldSendState` y `lerpState` pasan.

- [ ] **Step 5: Commit**
  `git add shell/src/space/multiplayer-math.ts shell/src/space/multiplayer-math.test.ts && git commit -m "test(space): lerpState — interpolación de posición + yaw de arco corto"`

---

### Task 3: `multiplayer-math.ts` — `toAbsolute` / `toScene` (conversión worldOffset)

**Files:**
- Test: `shell/src/space/multiplayer-math.test.ts` (modificar — añadir bloque)
- Modify: `shell/src/space/multiplayer-math.ts`

- [ ] **Step 1: Write the failing test**

Añadir AL FINAL de `shell/src/space/multiplayer-math.test.ts`:

```ts
import { toAbsolute, toScene } from './multiplayer-math';

describe('toAbsolute / toScene (conversión worldOffset)', () => {
  const offset = { x: 1000, y: -50, z: 2500 };

  it('toAbsolute suma el worldOffset a la posición de escena', () => {
    expect(toAbsolute({ x: 10, y: 5, z: -20 }, offset)).toEqual({ x: 1010, y: -45, z: 2480 });
  });

  it('toScene resta el worldOffset a la posición absoluta', () => {
    expect(toScene({ x: 1010, y: -45, z: 2480 }, offset)).toEqual({ x: 10, y: 5, z: -20 });
  });

  it('round-trip: toScene(toAbsolute(p)) === p', () => {
    const p = { x: 123.5, y: -7.25, z: 42 };
    const back = toScene(toAbsolute(p, offset), offset);
    expect(back.x).toBeCloseTo(p.x, 10);
    expect(back.y).toBeCloseTo(p.y, 10);
    expect(back.z).toBeCloseTo(p.z, 10);
  });

  it('offset cero es identidad', () => {
    const zero = { x: 0, y: 0, z: 0 };
    expect(toAbsolute({ x: 3, y: 4, z: 5 }, zero)).toEqual({ x: 3, y: 4, z: 5 });
    expect(toScene({ x: 3, y: 4, z: 5 }, zero)).toEqual({ x: 3, y: 4, z: 5 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/multiplayer-math.test.ts`
  Expected: FAIL — `toAbsolute` / `toScene` no están exportados.

- [ ] **Step 3: Write minimal implementation**

Añadir a `shell/src/space/multiplayer-math.ts`:

```ts
/** Punto 3D simple (sin Three.js). Compatible con `THREE.Vector3` por estructura. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Escena → mundo absoluto: el servidor trabaja en coordenadas absolutas, así que
 * el cliente SUMA su worldOffset antes de enviar el estado de su nave.
 */
export function toAbsolute(scenePos: Vec3, worldOffset: Vec3): Vec3 {
  return {
    x: scenePos.x + worldOffset.x,
    y: scenePos.y + worldOffset.y,
    z: scenePos.z + worldOffset.z,
  };
}

/**
 * Mundo absoluto → escena: al colocar una nave remota, el cliente RESTA su
 * worldOffset a la posición absoluta que llegó del servidor.
 */
export function toScene(absPos: Vec3, worldOffset: Vec3): Vec3 {
  return {
    x: absPos.x - worldOffset.x,
    y: absPos.y - worldOffset.y,
    z: absPos.z - worldOffset.z,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/multiplayer-math.test.ts`
  Expected: PASS — los bloques de `shouldSendState`, `lerpState` y conversión `worldOffset` pasan.

- [ ] **Step 5: Commit**
  `git add shell/src/space/multiplayer-math.ts shell/src/space/multiplayer-math.test.ts && git commit -m "test(space): toAbsolute/toScene — conversión worldOffset (round-trip)"`

---

### Task 4: `multiplayer-math.ts` — `emoteWheelSector` (sector de la rueda)

**Files:**
- Test: `shell/src/space/multiplayer-math.test.ts` (modificar — añadir bloque)
- Modify: `shell/src/space/multiplayer-math.ts`

> **Convención de sectores (3 caras, vector desde el centro de la rueda):**
> El vector `(dxNorm, dyNorm)` está en coordenadas de pantalla (y hacia abajo).
> Si su magnitud es menor que el radio del centro muerto → `null` (no selecciona).
> Si no, el ángulo del cursor cae en uno de 3 sectores de 120°, indexados en sentido
> horario empezando ARRIBA: sector 0 = arriba (centrado en −90° de pantalla = feliz),
> sector 1 = abajo-derecha (triste), sector 2 = abajo-izquierda (enojada).

- [ ] **Step 1: Write the failing test**

Añadir AL FINAL de `shell/src/space/multiplayer-math.test.ts`:

```ts
import { emoteWheelSector } from './multiplayer-math';

describe('emoteWheelSector', () => {
  it('centro muerto (cerca del centro) → null', () => {
    expect(emoteWheelSector(0, 0)).toBe(null);
    expect(emoteWheelSector(0.05, -0.05)).toBe(null); // magnitud < 0.2 (dead zone)
  });

  it('arriba (feliz) → sector 0', () => {
    expect(emoteWheelSector(0, -1)).toBe(0); // recto arriba
  });

  it('abajo-derecha (triste) → sector 1', () => {
    expect(emoteWheelSector(0.8, 0.6)).toBe(1);
  });

  it('abajo-izquierda (enojada) → sector 2', () => {
    expect(emoteWheelSector(-0.8, 0.6)).toBe(2);
  });

  it('los tres sectores cubren el círculo sin solaparse (12 muestras → 0|1|2, nunca null fuera del centro)', () => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const s = emoteWheelSector(Math.cos(a), Math.sin(a));
      expect([0, 1, 2]).toContain(s);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/multiplayer-math.test.ts`
  Expected: FAIL — `emoteWheelSector` no está exportado.

- [ ] **Step 3: Write minimal implementation**

Añadir a `shell/src/space/multiplayer-math.ts`:

```ts
/**
 * Sector de la rueda de emoticonos a partir del vector cursor-centro normalizado
 * (coords de pantalla: y hacia abajo). Devuelve 0|1|2 o null (centro muerto).
 *
 * 3 sectores de 120°, centrados en: arriba (feliz=0), abajo-derecha (triste=1),
 * abajo-izquierda (enojada=2). Centro muerto: magnitud < 0.2 → null.
 */
export function emoteWheelSector(dxNorm: number, dyNorm: number): 0 | 1 | 2 | null {
  const mag = Math.hypot(dxNorm, dyNorm);
  if (mag < 0.2) return null;
  // Ángulo en pantalla: 0 = derecha, crece en sentido horario (y hacia abajo).
  // Lo rotamos para que "arriba" (−90°) sea el centro del sector 0.
  let deg = (Math.atan2(dyNorm, dxNorm) * 180) / Math.PI; // (−180, 180], horario
  // Desplaza +90 → arriba pasa a 0; normaliza a [0, 360).
  deg = (deg + 90 + 360) % 360;
  // Sectores de 120° centrados en 0/120/240, con bordes en 60/180/300.
  if (deg < 60 || deg >= 300) return 0; // arriba (feliz)
  if (deg < 180) return 1; // abajo-derecha (triste)
  return 2; // abajo-izquierda (enojada)
}
```

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/multiplayer-math.test.ts`
  Expected: PASS — los 4 bloques (`shouldSendState`, `lerpState`, conversión `worldOffset`, `emoteWheelSector`) pasan.

- [ ] **Step 5: Type-check the package**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS — sin errores de tipos.

- [ ] **Step 6: Commit**
  `git add shell/src/space/multiplayer-math.ts shell/src/space/multiplayer-math.test.ts && git commit -m "test(space): emoteWheelSector — ángulo del cursor → 3 sectores + centro muerto"`

---

### Task 5: `space-multiplayer.ts` — cliente WebSocket (`SpaceMultiplayer`)

**Files:**
- Create: `shell/src/space/space-multiplayer.ts`

> Espejo de `apps/app-combate-3d/src/MultiplayerClient.ts` adaptado al protocolo anclado de `/space-ws`. El WebSocket NO se prueba en unidad (lo valida el extremo a extremo manual); el throttle/parse de helpers ya están testeados (Tasks 1–4). Aquí, solo build/tsc gatean.

- [ ] **Step 1: Write the module**

Crear `shell/src/space/space-multiplayer.ts` con:

```ts
import { shouldSendState, type PlayerState } from './multiplayer-math';

/** Jugador tal como lo envía el servidor (coordenadas absolutas de mundo). */
export interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Emoticonos del protocolo (identificadores, no glifos). */
export type Emote = 'happy' | 'sad' | 'angry';

export interface SpaceMultiplayerHandlers {
  onPlayers: (players: Player[]) => void; // snapshot al unirse + state_update por tick
  onJoined: (player: Player) => void;
  onLeft: (id: string) => void;
  onEmote: (id: string, emoji: string) => void;
}

export interface ConnectOpts {
  room: string;
  id: string;
  name: string;
}

/**
 * Cliente WebSocket del espacio multijugador (espejo de MultiplayerClient de
 * app-combate-3d). Conecta a /space-ws, envía estado con throttle (~20 Hz vía
 * shouldSendState), envía emoticonos, expone callbacks y reconecta con backoff.
 * Sin Three.js. El parseo de mensajes sigue el protocolo anclado del plan.
 */
export class SpaceMultiplayer {
  private ws: WebSocket | null = null;
  private handlers: SpaceMultiplayerHandlers;
  private opts: ConnectOpts | null = null;

  private reconnectTimer: number | null = null;
  private reconnectDelay = 1000; // backoff inicial
  private readonly maxReconnectDelay = 15000;

  private lastSentAt = 0;
  private readonly sendIntervalMs = 50; // ~20 Hz

  private closedByUser = false;

  constructor(handlers: SpaceMultiplayerHandlers) {
    this.handlers = handlers;
  }

  connect(opts: ConnectOpts) {
    this.opts = opts;
    this.closedByUser = false;
    this.open();
  }

  private open() {
    if (!this.opts) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = location.host;
    const q =
      `room=${encodeURIComponent(this.opts.room)}` +
      `&id=${encodeURIComponent(this.opts.id)}` +
      `&name=${encodeURIComponent(this.opts.name)}`;
    const url = `${protocol}//${host}/space-ws?${q}`;

    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.reconnectDelay = 1000; // reset del backoff al conectar
    };
    this.ws.onmessage = (event) => {
      try {
        this.handleMessage(JSON.parse(event.data));
      } catch {
        // mensaje no-JSON: ignora
      }
    };
    this.ws.onclose = () => {
      this.ws = null;
      if (this.closedByUser) return;
      this.scheduleReconnect();
    };
    // onerror no agenda reconexión: onclose siempre se dispara tras un error.
    this.ws.onerror = () => {};
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.maxReconnectDelay, this.reconnectDelay * 2);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private handleMessage(msg: { type?: string; [k: string]: unknown }) {
    switch (msg.type) {
      case 'players':
        this.handlers.onPlayers((msg.players as Player[]) || []);
        break;
      case 'state_update':
        this.handlers.onPlayers((msg.players as Player[]) || []);
        break;
      case 'joined':
        if (msg.player) this.handlers.onJoined(msg.player as Player);
        break;
      case 'left':
        if (typeof msg.id === 'string') this.handlers.onLeft(msg.id);
        break;
      case 'emote':
        if (typeof msg.id === 'string' && typeof msg.emoji === 'string') {
          this.handlers.onEmote(msg.id, msg.emoji);
        }
        break;
    }
  }

  /** Envía el estado absoluto de la nave, con throttle (~20 Hz). `now` en ms. */
  sendState(state: PlayerState, now: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!shouldSendState(now, this.lastSentAt, this.sendIntervalMs)) return;
    this.lastSentAt = now;
    this.ws.send(
      JSON.stringify({ type: 'state', x: state.x, y: state.y, z: state.z, yaw: state.yaw }),
    );
  }

  sendEmote(emoji: Emote) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'emote', emoji }));
  }

  disconnect() {
    this.closedByUser = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
```

- [ ] **Step 2: Type-check the package**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS — el módulo compila; `sendState` consume `shouldSendState` y `PlayerState` de `multiplayer-math.ts`.

- [ ] **Step 3: Commit**
  `git add shell/src/space/space-multiplayer.ts && git commit -m "feat(space): SpaceMultiplayer — cliente WebSocket /space-ws (estado throttled + emotes + reconexión)"`

---

### Task 6: `remote-ship-model.ts` — modelo de nave remota ligero

**Files:**
- Create: `shell/src/space/remote-ship-model.ts`

> Variante LIGERA de `createPlayerShip` (ver `shell/src/space/player-ship.ts`): mismo eje (nariz hacia −Z, motores hacia +Z) y silueta reconocible, pero SIN luces puntuales (point lights) ni estela/llamas animadas — para no saturar la escena con N naves. Materiales emisivos sobrios para que se distinga en la oscuridad. Devuelve `{ object, dispose }`.

- [ ] **Step 1: Write the module**

Crear `shell/src/space/remote-ship-model.ts` con:

```ts
import * as THREE from 'three';

export interface RemoteShipModel {
  object: THREE.Group;
  dispose(): void;
}

/**
 * Nave remota LIGERA: silueta de la nave del jugador (casco en flecha + cabina +
 * alas + toberas) pero SIN point lights, SIN estela ni llamas animadas. Pensada
 * para instanciarse N veces sin coste de iluminación. Eje: nariz a −Z, motores a +Z.
 * Auto-iluminación mínima por materiales emisivos sobrios (sin neón).
 */
export function createRemoteShip(): RemoteShipModel {
  const ship = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => {
    disposables.push(o);
    return o;
  };

  const hull = track(
    new THREE.MeshStandardMaterial({
      color: 0x2a3340,
      metalness: 0.85,
      roughness: 0.4,
      emissive: 0x141b26,
      emissiveIntensity: 0.6,
    }),
  );
  const hullLight = track(new THREE.MeshStandardMaterial({ color: 0x3d4a5c, metalness: 0.8, roughness: 0.45 }));
  const dark = track(new THREE.MeshStandardMaterial({ color: 0x10151c, metalness: 0.6, roughness: 0.7 }));
  const glass = track(
    new THREE.MeshStandardMaterial({
      color: 0x0a1820,
      metalness: 0,
      roughness: 0.15,
      emissive: 0x0c3a4a,
      emissiveIntensity: 0.7,
    }),
  );
  // Núcleo de tobera emisivo sobrio (estático: las remotas no animan toberas).
  const core = track(new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb24d, emissiveIntensity: 1.6 }));

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, cfg: (m: THREE.Mesh) => void) => {
    track(geo);
    const m = new THREE.Mesh(geo, mat);
    cfg(m);
    ship.add(m);
  };

  // Cuerpo central.
  add(new THREE.CapsuleGeometry(0.5, 2.6, 8, 16), hull, (m) => {
    m.rotation.x = Math.PI / 2;
    m.position.z = 0.1;
  });
  // Nariz cónica.
  add(new THREE.ConeGeometry(0.5, 1.8, 16), hullLight, (m) => {
    m.rotation.x = -Math.PI / 2;
    m.position.z = -2.5;
  });
  // Bloque trasero de motores.
  add(new THREE.CylinderGeometry(0.62, 0.5, 0.7, 16), dark, (m) => {
    m.rotation.x = Math.PI / 2;
    m.position.z = 1.7;
  });
  // Cabina.
  add(new THREE.SphereGeometry(0.4, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, (m) => {
    m.position.set(0, 0.34, -0.95);
    m.scale.set(1, 0.8, 1.8);
  });
  // Alas en flecha + núcleos de tobera.
  const wingGeo = new THREE.BoxGeometry(2.2, 0.07, 0.9);
  for (const side of [-1, 1] as const) {
    add(wingGeo, hull, (m) => {
      m.position.set(side * 1.35, -0.05, 0.45);
      m.rotation.y = side * -0.32;
      m.rotation.z = side * 0.08;
    });
  }
  for (const ex of [-0.3, 0.3] as const) {
    add(new THREE.CylinderGeometry(0.24, 0.3, 0.5, 14), dark, (m) => {
      m.rotation.x = Math.PI / 2;
      m.position.set(ex, 0, 2.0);
    });
    add(new THREE.CircleGeometry(0.2, 14), core, (m) => {
      m.position.set(ex, 0, 2.24);
      m.rotation.y = Math.PI;
    });
  }

  return {
    object: ship,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
```

- [ ] **Step 2: Type-check the package**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS — el módulo compila.

- [ ] **Step 3: Commit**
  `git add shell/src/space/remote-ship-model.ts && git commit -m "feat(space): createRemoteShip — modelo de nave remota ligero (sin luces ni estela)"`

---

### Task 7: `space.css` — estilos de etiqueta de nombre, emoji flotante y rueda

**Files:**
- Modify: `shell/src/space/space.css`

> Estilos sobrios (sin neón), consistentes con `.space-label` / `#menuBtn` ya existentes. Reutiliza los tokens `--space-*`, `--orange-*`, `--metal-*`, `--font-*`.

- [ ] **Step 1: Append styles**

Añadir AL FINAL de `shell/src/space/space.css` (antes de la sección `/* Responsive */` no es obligatorio; puede ir al final del archivo):

```css
/* ── Multijugador: etiqueta de nombre de naves remotas ── */
.remote-name {
  position: fixed;
  transform: translate(-50%, -160%);
  z-index: 92;
  pointer-events: none;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--space-text);
  text-shadow: 0 1px 3px #000;
  white-space: nowrap;
  padding: 1px 6px;
  border: 1px solid var(--metal-iron);
  border-radius: 4px;
  background: rgba(10, 5, 3, 0.5);
  opacity: 0;
  transition: opacity 0.2s;
}
.remote-name.visible {
  opacity: 0.92;
}

/* Emoji flotante sobre una nave (propia o remota), temporal ~3 s */
.remote-emote {
  position: fixed;
  transform: translate(-50%, -260%);
  z-index: 93;
  pointer-events: none;
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 700;
  color: var(--orange-amber);
  text-shadow: 0 1px 3px #000;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.2s;
}
.remote-emote.visible {
  opacity: 1;
}

/* ── Rueda de emoticonos (overlay DOM radial, abierta con C) ── */
#emoteWheel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 190;
  width: 220px;
  height: 220px;
  display: none;
  border-radius: 50%;
  background: rgba(10, 5, 3, 0.72);
  border: 1px solid var(--metal-brass);
}
#emoteWheel.visible {
  display: block;
}
#emoteWheel .ew-sector {
  position: absolute;
  width: 78px;
  height: 78px;
  margin: -39px 0 0 -39px;
  left: 50%;
  top: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--metal-iron);
  border-radius: 12px;
  background: rgba(20, 12, 8, 0.6);
  color: var(--space-text);
  font-family: var(--font-mono);
  font-size: 22px;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s, background 0.2s;
}
#emoteWheel .ew-sector:hover,
#emoteWheel .ew-sector.active {
  border-color: var(--orange-amber);
  color: var(--orange-amber);
  background: rgba(58, 42, 32, 0.6);
}
/* Posiciones: 0 arriba, 1 abajo-derecha, 2 abajo-izquierda. */
#emoteWheel .ew-sector[data-sector="0"] { transform: translate(0, -64px); }
#emoteWheel .ew-sector[data-sector="1"] { transform: translate(56px, 38px); }
#emoteWheel .ew-sector[data-sector="2"] { transform: translate(-56px, 38px); }
#emoteWheel .ew-key {
  position: absolute;
  bottom: 4px;
  right: 6px;
  font-size: 9px;
  color: var(--space-text-2);
}
```

- [ ] **Step 2: Verify the CSS builds with the bundle**
  Run: `pnpm --filter @plataforma/shell build`
  Expected: PASS — el build empaqueta `space.css` sin errores (es CSS válido importado por `space-engine.ts`).

- [ ] **Step 3: Commit**
  `git add shell/src/space/space.css && git commit -m "feat(space): CSS sobrio para nombre remoto, emoji flotante y rueda de emoticonos"`

---

### Task 8: `emote-wheel.ts` — rueda radial de emoticonos

**Files:**
- Create: `shell/src/space/emote-wheel.ts`

> Overlay DOM radial. Abre con `C` (lo cablea el motor), cierra con `Esc` o al elegir. Selección por clic en un sector o teclas `1/2/3`. Llama a `onPick(emoji)` con el identificador del protocolo. Usa `emoteWheelSector` solo conceptualmente; la selección efectiva es por clic en el `<button>` del sector o por tecla numérica (más fiable que rastrear el cursor sobre el overlay). Mapeo de glifos sobrios: feliz `:)`, triste `:(`, enojada `>:(`. Dispose-safe.

- [ ] **Step 1: Write the module**

Crear `shell/src/space/emote-wheel.ts` con:

```ts
import type { Emote } from './space-multiplayer';

/** Glifos sobrios (sin emojis a color) por sector e identificador de protocolo. */
const SECTORS: { sector: 0 | 1 | 2; emote: Emote; glyph: string; key: string }[] = [
  { sector: 0, emote: 'happy', glyph: ':)', key: '1' },
  { sector: 1, emote: 'sad', glyph: ':(', key: '2' },
  { sector: 2, emote: 'angry', glyph: '>:(', key: '3' },
];

/**
 * Rueda radial de emoticonos (overlay DOM, light DOM, estilos en space.css).
 * El motor la abre con la tecla `C`; cierra con `Esc` o al elegir. Selección por
 * clic en el sector o teclas 1/2/3. No usa Three.js.
 */
export class EmoteWheel {
  private root: HTMLDivElement;
  private onPick: (emote: Emote) => void;
  private isOpen = false;

  constructor(host: HTMLElement, onPick: (emote: Emote) => void) {
    this.onPick = onPick;
    this.root = document.createElement('div');
    this.root.id = 'emoteWheel';
    this.root.innerHTML = SECTORS.map(
      (s) =>
        `<button class="ew-sector" data-sector="${s.sector}" data-emote="${s.emote}" type="button">` +
        `${s.glyph}<span class="ew-key">${s.key}</span></button>`,
    ).join('');
    host.appendChild(this.root);

    this.root.querySelectorAll<HTMLButtonElement>('.ew-sector').forEach((btn) => {
      btn.addEventListener('click', () => {
        const emote = btn.dataset.emote as Emote;
        this.pick(emote);
      });
    });
    document.addEventListener('keydown', this.onKeyDown);
  }

  get visible(): boolean {
    return this.isOpen;
  }

  open() {
    this.isOpen = true;
    this.root.classList.add('visible');
  }

  close() {
    this.isOpen = false;
    this.root.classList.remove('visible');
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  private pick(emote: Emote) {
    this.onPick(emote);
    this.close();
  }

  // Teclas mientras la rueda está abierta: 1/2/3 eligen; Esc cierra sin enviar.
  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.isOpen) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    const match = SECTORS.find((s) => e.key === s.key);
    if (match) {
      e.preventDefault();
      this.pick(match.emote);
    }
  };

  dispose() {
    document.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
  }
}
```

- [ ] **Step 2: Type-check the package**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS — el módulo compila e importa `Emote` de `space-multiplayer.ts`.

- [ ] **Step 3: Commit**
  `git add shell/src/space/emote-wheel.ts && git commit -m "feat(space): EmoteWheel — rueda radial de emoticonos (C abre, 1/2/3 elige, Esc cierra)"`

---

### Task 9: `remote-ships.ts` — gestor de naves remotas (interpolación + etiqueta + emoji)

**Files:**
- Create: `shell/src/space/remote-ships.ts`

> Gestiona `Map<id, RemoteShip>`. En `setSnapshot(players, worldOffset)` fija el target absoluto de cada nave (convertido a escena con `toScene`), reinicia `t` y da de alta/baja. En `update(delta)` interpola `from→to` con `lerpState` y aplica posición + yaw a cada objeto. `updateLabels(project)` coloca etiquetas de nombre y emojis flotantes usando el `project()` que le pasa el motor (proyección a pantalla). `showEmote(id, glyph)` muestra el emoji ~3 s. Dispose-safe (libera modelos + nodos DOM).

- [ ] **Step 1: Write the module**

Crear `shell/src/space/remote-ships.ts` con:

```ts
import * as THREE from 'three';
import { createRemoteShip, type RemoteShipModel } from './remote-ship-model';
import { lerpState, toScene, type PlayerState, type Vec3 } from './multiplayer-math';
import type { Player } from './space-multiplayer';

/** Resultado de la proyección mundo→pantalla (lo provee el motor). */
export interface Projected {
  x: number;
  y: number;
  visible: boolean;
}

const EMOTE_GLYPH: Record<string, string> = { happy: ':)', sad: ':(', angry: '>:(' };
const EMOTE_MS = 3000; // duración del emoji flotante
const LERP_RATE = 12; // suavizado del seguimiento (mayor = más rápido)

interface RemoteShip {
  model: RemoteShipModel;
  name: string;
  from: PlayerState; // estado de escena actual (interpolado)
  to: PlayerState; // último target de escena recibido
  nameEl: HTMLDivElement;
  emoteEl: HTMLDivElement;
  emoteUntil: number; // performance.now() hasta el que se muestra el emoji
}

/**
 * Gestor de naves remotas: alta/baja, interpolación entre snapshots, etiqueta de
 * nombre flotante y emoji temporal. El servidor envía coords absolutas; este gestor
 * las convierte a escena con `toScene(worldOffset)` cada snapshot, de modo que un
 * rebase del origen recoloca las naves automáticamente (siempre se posicionan desde
 * coords absolutas vía el worldOffset vigente). No abre WebSocket.
 */
export class RemoteShips {
  private ships = new Map<string, RemoteShip>();
  private localId: string;
  private scene: THREE.Scene;
  private host: HTMLElement;

  constructor(scene: THREE.Scene, host: HTMLElement, localId: string) {
    this.scene = scene;
    this.host = host;
    this.localId = localId;
  }

  /** Aplica un snapshot del servidor (lista completa de la sala). */
  setSnapshot(players: Player[], worldOffset: Vec3) {
    const seen = new Set<string>();
    for (const p of players) {
      if (p.id === this.localId) continue; // la nave propia la dibuja el motor
      seen.add(p.id);
      const scenePos = toScene({ x: p.x, y: p.y, z: p.z }, worldOffset);
      const target: PlayerState = { x: scenePos.x, y: scenePos.y, z: scenePos.z, yaw: p.yaw };
      const existing = this.ships.get(p.id);
      if (existing) {
        existing.to = target;
        existing.name = p.name;
        existing.nameEl.textContent = p.name;
      } else {
        this.add(p.id, p.name, target);
      }
    }
    // Baja de naves ausentes del snapshot (salida sin "left" explícito).
    for (const id of [...this.ships.keys()]) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  /** Alta explícita (mensaje "joined"). */
  addPlayer(p: Player, worldOffset: Vec3) {
    if (p.id === this.localId || this.ships.has(p.id)) return;
    const scenePos = toScene({ x: p.x, y: p.y, z: p.z }, worldOffset);
    this.add(p.id, p.name, { x: scenePos.x, y: scenePos.y, z: scenePos.z, yaw: p.yaw });
  }

  /** Baja explícita (mensaje "left"). */
  removePlayer(id: string) {
    this.remove(id);
  }

  private add(id: string, name: string, target: PlayerState) {
    const model = createRemoteShip();
    model.object.scale.setScalar(0.85);
    model.object.position.set(target.x, target.y, target.z);
    model.object.rotation.y = target.yaw;
    this.scene.add(model.object);

    const nameEl = document.createElement('div');
    nameEl.className = 'remote-name';
    nameEl.textContent = name;
    this.host.appendChild(nameEl);

    const emoteEl = document.createElement('div');
    emoteEl.className = 'remote-emote';
    this.host.appendChild(emoteEl);

    this.ships.set(id, { model, name, from: { ...target }, to: target, nameEl, emoteEl, emoteUntil: 0 });
  }

  private remove(id: string) {
    const s = this.ships.get(id);
    if (!s) return;
    this.scene.remove(s.model.object);
    s.model.dispose();
    s.nameEl.remove();
    s.emoteEl.remove();
    this.ships.delete(id);
  }

  /** Interpola `from→to` y aplica posición + yaw a cada nave. */
  update(delta: number) {
    const t = Math.min(1, LERP_RATE * delta); // seguimiento exponencial estable
    for (const s of this.ships.values()) {
      s.from = lerpState(s.from, s.to, t);
      s.model.object.position.set(s.from.x, s.from.y, s.from.z);
      s.model.object.rotation.y = s.from.yaw;
    }
  }

  /** Muestra un emoji flotante ~3 s sobre la nave indicada. */
  showEmote(id: string, emoji: string) {
    const s = this.ships.get(id);
    if (!s) return;
    s.emoteEl.textContent = EMOTE_GLYPH[emoji] ?? emoji;
    s.emoteUntil = performance.now() + EMOTE_MS;
  }

  /** Reposiciona etiquetas de nombre y emojis con la proyección del motor. */
  updateLabels(project: (world: THREE.Vector3) => Projected, now: number) {
    const tmp = new THREE.Vector3();
    for (const s of this.ships.values()) {
      tmp.set(s.from.x, s.from.y, s.from.z);
      const p = project(tmp);
      if (p.visible) {
        s.nameEl.style.left = `${p.x}px`;
        s.nameEl.style.top = `${p.y}px`;
        s.nameEl.classList.add('visible');
      } else {
        s.nameEl.classList.remove('visible');
      }
      // Emoji: visible mientras no expire Y la nave esté en pantalla.
      const showEmote = now < s.emoteUntil && p.visible;
      if (showEmote) {
        s.emoteEl.style.left = `${p.x}px`;
        s.emoteEl.style.top = `${p.y}px`;
        s.emoteEl.classList.add('visible');
      } else {
        s.emoteEl.classList.remove('visible');
      }
    }
  }

  dispose() {
    for (const id of [...this.ships.keys()]) this.remove(id);
    this.ships.clear();
  }
}
```

- [ ] **Step 2: Type-check the package**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS — el módulo compila e importa `createRemoteShip`, `lerpState`/`toScene`/tipos y `Player`.

- [ ] **Step 3: Commit**
  `git add shell/src/space/remote-ships.ts && git commit -m "feat(space): RemoteShips — gestor de naves remotas (interpolación + nombre + emoji)"`

---

### Task 10: Hilo de identidad — `MountOpts.user`, `shell-space`, `shell-app`

**Files:**
- Modify: `shell/src/space/space-engine.ts` (solo `MountOpts`)
- Modify: `shell/src/components/shell-space.ts`
- Modify: `shell/src/components/shell-app.ts`

> Añade el campo `user` al contrato del motor y lo propaga desde el estado de auth. `AuthState.user` es `{ id, email, name, role } | null`; se pasa como `{ id, name }` (subconjunto). Aún no se usa para el multijugador (eso es la Task 11), pero el cableado de identidad se valida ya con `tsc`.

- [ ] **Step 1: Extender `MountOpts` en `space-engine.ts`**

En `shell/src/space/space-engine.ts`, reemplazar la interfaz `MountOpts` por:

```ts
export interface MountOpts {
  apps: AppInfo[];
  onEnterApp: (app: AppInfo) => void;
  onLogout: () => void;
  /** Identidad del usuario autenticado (de authState.user). Sin ella, el multijugador no se activa. */
  user?: { id: string; name: string };
}
```

- [ ] **Step 2: Pasar `user` en `shell-space.ts`**

En `shell/src/components/shell-space.ts`:

(a) Añadir la propiedad junto a las existentes (`apps`, `theme`):

```ts
  @property({ type: Object }) user: { id: string; name: string } | null = null;
```

(b) En `firstUpdated`, pasar `user` a `engine.mount` (reemplazar el objeto de opciones de `this.engine.mount(host, { ... })`):

```ts
    this.engine.mount(host, {
      apps: this.apps,
      user: this.user ?? undefined,
      onEnterApp: (app) => {
        this.cockpitApp = app;
        this.engine?.pause();
      },
      onLogout: () => this.dispatchEvent(new CustomEvent('logout', { bubbles: true, composed: true })),
    });
```

- [ ] **Step 3: Pasar `user` en `shell-app.ts`**

En `shell/src/components/shell-app.ts`, en el `render()`, añadir el binding `.user` al `<shell-space>`:

```ts
    return html`
      <shell-space
        .apps=${this.apps}
        .theme=${this.theme}
        .user=${this.authState.user}
        @logout=${this.handleLogout}
      ></shell-space>
    `;
```

> `this.authState.user` es `User | null` (`{ id, email, name, role }`); es asignable a `{ id, name } | null` por subconjunto estructural en Lit (binding de propiedad, no atributo). El motor solo lee `id` y `name`.

- [ ] **Step 4: Type-check the package**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS — los tres archivos compilan; el tipo de `user` fluye `shell-app → shell-space → MountOpts`.

- [ ] **Step 5: Commit**
  `git add shell/src/space/space-engine.ts shell/src/components/shell-space.ts shell/src/components/shell-app.ts && git commit -m "feat(space): hilo de identidad user{id,name} hacia MountOpts del motor"`

---

### Task 11: Integración en `space-engine.ts` — conectar, difundir, colocar, emotear

**Files:**
- Modify: `shell/src/space/space-engine.ts`

> Cablea todo: tras `mount` con `opts.user`, crea `SpaceMultiplayer` + `RemoteShips` + `EmoteWheel`; cada frame difunde el estado absoluto de la nave con throttle y actualiza/coloca las remotas; la tecla `C` abre la rueda; `onEmote` muestra el emoji flotante (propio y remoto). Si no hay `opts.user`, omite el multijugador con elegancia. Dispone todo en `dispose`.

- [ ] **Step 1: Añadir imports**

En `shell/src/space/space-engine.ts`, junto a los imports existentes, añadir:

```ts
import { SpaceMultiplayer, type Emote } from './space-multiplayer';
import { RemoteShips } from './remote-ships';
import { EmoteWheel } from './emote-wheel';
import { toAbsolute } from './multiplayer-math';
```

- [ ] **Step 2: Añadir campos de instancia**

Junto a los campos privados de la clase `SpaceEngine` (cerca de `private ramatzoLabel!: HTMLElement;`), añadir:

```ts
  private multiplayer: SpaceMultiplayer | null = null;
  private remoteShips: RemoteShips | null = null;
  private emoteWheel: EmoteWheel | null = null;
  /** Glifo del emoji propio flotante (id local) y su caducidad. */
  private selfEmoteEl: HTMLDivElement | null = null;
  private selfEmoteUntil = 0;
```

- [ ] **Step 3: Inicializar el multijugador al final de `mount`**

En `mount`, JUSTO ANTES de la llamada final `this.start();`, añadir:

```ts
    // ── Multijugador (solo con identidad de usuario) ──
    if (this.opts.user) {
      const user = this.opts.user;
      this.remoteShips = new RemoteShips(this.scene, host, user.id);

      // Emoji propio flotante (sobre la nave del jugador).
      this.selfEmoteEl = document.createElement('div');
      this.selfEmoteEl.className = 'remote-emote';
      host.appendChild(this.selfEmoteEl);

      this.multiplayer = new SpaceMultiplayer({
        onPlayers: (players) => this.remoteShips?.setSnapshot(players, this.worldOffset),
        onJoined: (player) => this.remoteShips?.addPlayer(player, this.worldOffset),
        onLeft: (id) => this.remoteShips?.removePlayer(id),
        onEmote: (id, emoji) => {
          if (id === user.id) this.showSelfEmote(emoji);
          else this.remoteShips?.showEmote(id, emoji);
        },
      });
      this.multiplayer.connect({ room: 'home', id: user.id, name: user.name });

      // Rueda de emoticonos: la tecla C la abre (ver onKeyDown).
      this.emoteWheel = new EmoteWheel(host, (emote: Emote) => this.multiplayer?.sendEmote(emote));
    }
```

- [ ] **Step 4: Difundir + actualizar remotas en el loop**

En `loop`, JUSTO DESPUÉS de `this.playerShip.update(this.elapsed, ship, delta);` y ANTES de `this.composer.render();`, añadir:

```ts
    // ── Multijugador por frame ──
    if (this.multiplayer) {
      const abs = toAbsolute(
        { x: ship.position.x, y: ship.position.y, z: ship.position.z },
        this.worldOffset,
      );
      this.multiplayer.sendState({ x: abs.x, y: abs.y, z: abs.z, yaw: ship.yaw }, time);
    }
    this.remoteShips?.update(delta);
```

> `time` es el argumento de `loop(time)` (ms desde `performance.now`), que es la base temporal del throttle `shouldSendState`.

- [ ] **Step 5: Colocar etiquetas de remotas en `updateLabels`**

En el método `updateLabels()`, AL FINAL (después del bloque del `ramatzoLabel`), añadir:

```ts
    // Etiquetas de nombre + emojis de las naves remotas (reusa project()).
    const now = performance.now();
    this.remoteShips?.updateLabels((w) => this.project(w), now);

    // Emoji propio flotante (anclado sobre la nave del jugador).
    if (this.selfEmoteEl) {
      const sp = this.project(this.ship.object.position);
      if (now < this.selfEmoteUntil && sp.visible) {
        this.selfEmoteEl.style.left = `${sp.x}px`;
        this.selfEmoteEl.style.top = `${sp.y}px`;
        this.selfEmoteEl.classList.add('visible');
      } else {
        this.selfEmoteEl.classList.remove('visible');
      }
    }
```

- [ ] **Step 6: Añadir `showSelfEmote` y abrir la rueda con `C`**

(a) Añadir el método helper (p. ej. junto a `updateLabels`):

```ts
  // Emoji propio flotante ~3 s (mapeo de glifos sobrios, igual que RemoteShips).
  private showSelfEmote(emoji: string) {
    if (!this.selfEmoteEl) return;
    const glyph: Record<string, string> = { happy: ':)', sad: ':(', angry: '>:(' };
    this.selfEmoteEl.textContent = glyph[emoji] ?? emoji;
    this.selfEmoteUntil = performance.now() + 3000;
  }
```

(b) En `onKeyDown`, añadir el manejo de la tecla `C` JUSTO DESPUÉS del bloque de `KeyE` (antes del bloque de `Escape`):

```ts
    // C: abre/cierra la rueda de emoticonos (solo si hay multijugador).
    if (e.code === 'KeyC') {
      this.emoteWheel?.toggle();
      return;
    }
```

- [ ] **Step 7: Liberar en `dispose`**

En `dispose()`, JUSTO DESPUÉS de `this.pause();` (al inicio del teardown, antes de `this.ship?.detach();`), añadir:

```ts
    this.multiplayer?.disconnect();
    this.multiplayer = null;
    this.remoteShips?.dispose();
    this.remoteShips = null;
    this.emoteWheel?.dispose();
    this.emoteWheel = null;
    this.selfEmoteEl?.remove();
    this.selfEmoteEl = null;
```

- [ ] **Step 8: Type-check the package**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS — el motor integra `SpaceMultiplayer`/`RemoteShips`/`EmoteWheel`/`toAbsolute` sin errores de tipos.

- [ ] **Step 9: Build the package**
  Run: `pnpm --filter @plataforma/shell build`
  Expected: PASS — el bundle del shell compila con la integración multijugador.

- [ ] **Step 10: Full unit test suite (regresión)**
  Run: `pnpm --filter @plataforma/shell test`
  Expected: PASS — toda la suite de Vitest (incluida `multiplayer-math.test.ts`) pasa.

- [ ] **Step 11: Commit**
  `git add shell/src/space/space-engine.ts && git commit -m "feat(space): integrar multijugador en el motor (difusión, remotas, rueda de emotes)"`

---

### Task 12: Verificación end-to-end manual (usuario, con el stack)

**Files:** (ninguno — verificación; el despliegue lo hace el usuario)

> El multijugador NO es verificable headless: necesita el `space-server` (plan 01) + Redis + Caddy corriendo y 2+ navegadores. Esta tarea documenta el guion de verificación. El usuario despliega (VPS / `docker compose`); este plan NO ejecuta el despliegue.

- [ ] **Step 1: Levantar el stack (usuario)**
  Con el plan 01 desplegado: `docker compose -f deploy/docker-compose.yml up -d --build` (incluye `space-server` + `redis` + Caddy con la ruta `/space-ws`). Recordatorio del spec §11: pre-`docker pull golang:1.22-alpine` y `redis:alpine` para evitar fallos de pull de Docker Hub.

- [ ] **Step 2: Presencia (2 navegadores)**
  Abrir la plataforma en dos navegadores/perfiles distintos y autenticarse con dos usuarios. Observable: cada uno ve la nave del otro moviéndose en tiempo real, con la etiqueta de nombre flotando sobre ella. Al mover la nave A, la nave A se desplaza suavemente (interpolada) en la vista de B.

- [ ] **Step 3: Emoticonos**
  En el navegador A: pulsar `C` → aparece la rueda radial con 3 caras; elegir una (clic en el sector o `1/2/3`). Observable: el emoji flota ~3 s sobre la nave de A tanto en A (propio) como en B (remoto). `Esc` cierra la rueda sin enviar.

- [ ] **Step 4: Persistencia / reconexión**
  Mover la nave A a una posición distinta, recargar la pestaña de A. Observable: A reaparece cerca de su última posición (estado restaurado desde Redis vía el servidor del plan 01), no en el spawn por defecto.

- [ ] **Step 5: Aislamiento de sala (sanity)**
  Confirmar que ambos clientes usan la sala `home` (MVP) y se ven entre sí. (Otras salas son no-objetivo de esta entrega.)

- [ ] **Step 6: Registrar el resultado**
  Si todo lo anterior se observa, la entrega del cliente está completa. Si no, depurar con `superpowers:systematic-debugging` (revisar la consola del navegador: URL de `/space-ws`, mensajes recibidos; y los logs del `space-server`).

---

## Resumen de comandos (referencia rápida)

- Tests de un fichero: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/multiplayer-math.test.ts`
- Suite completa: `pnpm --filter @plataforma/shell test`
- Type-check: `pnpm --filter @plataforma/shell lint`
- Build: `pnpm --filter @plataforma/shell build`
- (Usuario) Stack: `docker compose -f deploy/docker-compose.yml up -d --build`

> **Pure-logic (TDD, Tasks 1–4):** `multiplayer-math.ts` cubre throttle, interpolación, conversión `worldOffset` y sector de rueda — THREE-free, entorno node.
> **Integración (Tasks 5–11):** WebSocket, modelo/gestor de naves remotas, rueda DOM, hilo de identidad y cableado del motor — validadas por `tsc`/`build` (el WebSocket en sí no se prueba en unidad).
> **End-to-end (Task 12):** verificación manual del usuario con 2+ navegadores + el stack del plan 01.
