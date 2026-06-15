---
# Control de vuelo (nave + cámara de persecución) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Reemplazar el control de vuelo actual (cámara que vuela con la nave atornillada a ella) por una nave-entidad en el mundo controlada por ratón con pointer lock fiable, con empuje progresivo sin tope, alabeo visual en los giros, y una cámara de persecución con resorte y FOV dinámico.

**Architecture:** La lógica de vuelo pura y testeable vive en `flight-math.ts` (sin Three.js, entorno node). `ship-controller.ts` posee el estado/física de la nave: un `THREE.Group` raíz que recibe posición + yaw/pitch (marco de la velocidad) y un pivote interno que recibe solo el roll (alabeo visual), de modo que la cámara nunca rota en roll. `chase-camera.ts` sigue al raíz de la nave con un lerp de resorte y un kick de FOV según la velocidad. `space-engine.ts` se reconfigura para añadir la nave a la escena (no como hija de la cámara) y orquestar `ShipController` + `ChaseCamera` por frame.

**Tech Stack:** TypeScript, Three.js 0.170, Lit 3, Vitest. Package @plataforma/shell.

**Depends on:** none.

---
---

## File structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `shell/src/space/flight-math.ts` | Crear | Lógica pura: `bankFromYawRate` (alabeo desde la tasa de giro, con clamp) y `approachBrakeFactor` (curva de frenado de aproximación 1→minFactor). Sin Three.js. |
| `shell/src/space/flight-math.test.ts` | Crear | Tests Vitest de `flight-math.ts` (signos, clamp, monotonía, continuidad). |
| `shell/src/space/ship-controller.ts` | Crear | `class ShipController`: estado/física de la nave-entidad. Pointer-lock-first mouse-look con suavizado, empuje progresivo sin tope, freno, strafe, nitro, alabeo en pivote visual, `setApproachBrake`, `rebase`, `requestControl`, `attachVisual`. Produce `ShipState`. |
| `shell/src/space/chase-camera.ts` | Crear | `class ChaseCamera`: sigue al raíz de la nave con resorte, FOV kick por velocidad/nitro, `lookAt` con adelanto por velocidad. La cámara nunca rota en roll. |
| `shell/src/space/space-engine.ts` | Modificar | Cablear `ShipController` + `ChaseCamera`; quitar `FlightController` y el hack `camera.add(playerShip)`; añadir la nave a la escena; rebase sobre la posición de la nave; prompt "Clic para tomar control". |
| `shell/src/space/flight.ts` | Eliminar | Reemplazado por `ship-controller.ts`. |

> **Nota sobre `ShipState`:** `ship-controller.ts` exporta la interfaz `ShipState` (contrato compartido). Otros planes (radar, hud, player-ship, solar-system) la importan desde `./ship-controller`.

> **Nota sobre `player-ship.ts`, `hud.ts`, `radar.ts`, `constellations.ts`:** este plan es la base; mantiene el `playerShip`, `hud`, `radar` y `constellations` existentes funcionando con adaptadores mínimos para que el dev server siga compilando y renderizando. Los planes siguientes los reescriben. NO se tocan las apps de `apps/`, el registry, ni el iframe de la cabina.

---

### Task 1: `flight-math.ts` — `bankFromYawRate` (alabeo puro)

**Files:**
- Test: `shell/src/space/flight-math.test.ts` (crear)
- Create: `shell/src/space/flight-math.ts` (crear)

- [ ] **Step 1: Write the failing test**

Crear `shell/src/space/flight-math.test.ts` con:

```ts
import { describe, it, expect } from 'vitest';
import { bankFromYawRate } from './flight-math';

describe('bankFromYawRate', () => {
  it('sin giro → sin alabeo', () => {
    expect(bankFromYawRate(0, 6, 0.6)).toBe(0);
  });

  it('girar a la izquierda (yawRate > 0) inclina al lado contrario del giro de yaw', () => {
    // Convención: targetRoll = -yawRate * kRoll. yawRate>0 → roll negativo.
    expect(bankFromYawRate(0.1, 6, 0.6)).toBeLessThan(0);
  });

  it('girar a la derecha (yawRate < 0) → roll positivo', () => {
    expect(bankFromYawRate(-0.1, 6, 0.6)).toBeGreaterThan(0);
  });

  it('es antisimétrico respecto al signo de yawRate', () => {
    expect(bankFromYawRate(0.2, 6, 0.6)).toBeCloseTo(-bankFromYawRate(-0.2, 6, 0.6), 10);
  });

  it('crece (en magnitud) monótonamente con |yawRate| antes del clamp', () => {
    const a = Math.abs(bankFromYawRate(0.02, 6, 5));
    const b = Math.abs(bankFromYawRate(0.05, 6, 5));
    expect(b).toBeGreaterThan(a);
  });

  it('hace clamp al máximo positivo', () => {
    // yawRate muy negativo, k grande → tiende a +∞, se limita a +maxRoll.
    expect(bankFromYawRate(-100, 6, 0.6)).toBe(0.6);
  });

  it('hace clamp al máximo negativo', () => {
    expect(bankFromYawRate(100, 6, 0.6)).toBe(-0.6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/flight-math.test.ts`
  Expected: FAIL — el módulo `./flight-math` no existe / `bankFromYawRate` no está definido.

- [ ] **Step 3: Write minimal implementation**

Crear `shell/src/space/flight-math.ts` con:

```ts
/**
 * Lógica pura de vuelo (sin Three.js, testeable con Vitest en entorno node),
 * siguiendo el patrón de layout.ts. Estas funciones se consumen desde
 * ship-controller.ts y solar-system.ts.
 */

/**
 * Alabeo (roll) objetivo a partir de la tasa de giro de yaw.
 * targetRoll = clamp(-yawRate * kRoll, ±maxRoll).
 * yawRate en rad/s; kRoll factor de inclinación; maxRoll límite en rad.
 */
export function bankFromYawRate(yawRate: number, kRoll: number, maxRoll: number): number {
  const target = -yawRate * kRoll;
  return Math.max(-maxRoll, Math.min(maxRoll, target));
}
```

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/flight-math.test.ts`
  Expected: PASS — los 7 casos de `bankFromYawRate` pasan.

- [ ] **Step 5: Commit**
  Run:
  ```
  git add shell/src/space/flight-math.ts shell/src/space/flight-math.test.ts
  git commit -m "feat(space): bankFromYawRate puro (alabeo desde la tasa de giro)"
  ```

---

### Task 2: `flight-math.ts` — `approachBrakeFactor` (curva de frenado)

**Files:**
- Test: `shell/src/space/flight-math.test.ts` (modificar — añadir bloque `describe`)
- Modify: `shell/src/space/flight-math.ts` (añadir función)

- [ ] **Step 1: Write the failing test**

Añadir al final de `shell/src/space/flight-math.test.ts`:

```ts
import { approachBrakeFactor } from './flight-math';

describe('approachBrakeFactor', () => {
  const R = 1000;
  const MIN = 0.2;

  it('vale 1 en el borde de la esfera de influencia', () => {
    expect(approachBrakeFactor(R, R, MIN)).toBeCloseTo(1, 10);
  });

  it('vale 1 más allá del borde (sin frenar lejos)', () => {
    expect(approachBrakeFactor(R * 2, R, MIN)).toBe(1);
    expect(approachBrakeFactor(R + 1, R, MIN)).toBe(1);
  });

  it('vale minFactor en el núcleo (distancia 0)', () => {
    expect(approachBrakeFactor(0, R, MIN)).toBeCloseTo(MIN, 10);
  });

  it('es monótona creciente del núcleo al borde', () => {
    const a = approachBrakeFactor(100, R, MIN);
    const b = approachBrakeFactor(500, R, MIN);
    const c = approachBrakeFactor(900, R, MIN);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('es continua en el borde (no salta al pasar de fuera a dentro)', () => {
    const inside = approachBrakeFactor(R - 0.001, R, MIN);
    const outside = approachBrakeFactor(R + 0.001, R, MIN);
    expect(Math.abs(inside - outside)).toBeLessThan(0.01);
  });

  it('nunca baja de minFactor', () => {
    expect(approachBrakeFactor(0, R, MIN)).toBeGreaterThanOrEqual(MIN);
    expect(approachBrakeFactor(-50, R, MIN)).toBeGreaterThanOrEqual(MIN);
  });

  it('radio de influencia <= 0 no frena (devuelve 1)', () => {
    expect(approachBrakeFactor(0, 0, MIN)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/flight-math.test.ts`
  Expected: FAIL — `approachBrakeFactor` no está exportada.

- [ ] **Step 3: Write minimal implementation**

Añadir a `shell/src/space/flight-math.ts`:

```ts
/**
 * Factor de frenado de aproximación a un planeta.
 * 1 en (o más allá de) el borde de influenceRadius → minFactor en el núcleo (distancia 0).
 * Interpolación lineal en la fracción de profundidad dentro de la esfera.
 * Continua en el borde y acotada por minFactor.
 */
export function approachBrakeFactor(distance: number, influenceRadius: number, minFactor: number): number {
  if (influenceRadius <= 0) return 1;
  if (distance >= influenceRadius) return 1;
  const depth = Math.max(0, Math.min(1, distance / influenceRadius)); // 0 en núcleo, 1 en borde
  return minFactor + (1 - minFactor) * depth;
}
```

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/flight-math.test.ts`
  Expected: PASS — todos los casos de `bankFromYawRate` y `approachBrakeFactor` pasan.

- [ ] **Step 5: Commit**
  Run:
  ```
  git add shell/src/space/flight-math.ts shell/src/space/flight-math.test.ts
  git commit -m "feat(space): approachBrakeFactor puro (curva de frenado de aproximación)"
  ```

---

### Task 3: `ship-controller.ts` — clase `ShipController`

**Files:**
- Create: `shell/src/space/ship-controller.ts` (crear)

> Esta tarea es de integración con Three.js (event listeners de pointer lock, transformaciones de `THREE.Group`). No es unit-testeable en el entorno node; la verificación es manual en el dev server al final de la Task 5. La lógica de alabeo usa `bankFromYawRate` (ya testeada). Escribe el código completo.

- [ ] **Step 1: Write the complete `ShipState` interface + `ShipController` class**

Crear `shell/src/space/ship-controller.ts` con:

```ts
import * as THREE from 'three';
import { bankFromYawRate } from './flight-math';

/**
 * Estado de la nave que consumen HUD, radar, cámara de persecución y player-ship.
 * Contrato compartido del subsistema espacial.
 */
export interface ShipState {
  position: THREE.Vector3; // espacio de escena; suma worldOffset para HUD/altitud
  velocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  isNitro: boolean;
  isBraking: boolean;
}

/**
 * Control de vuelo: la nave es una ENTIDAD en el mundo. El raíz (`object`)
 * recibe posición + yaw/pitch (marco que orienta la velocidad). Un pivote interno
 * recibe SOLO el roll → el visual de la nave se inclina en los giros pero la cámara,
 * que sigue al raíz, nunca rota en roll (no marea).
 *
 * Ratón: SOLO con pointer lock (movementX/Y), acumulado en targetYaw/targetPitch
 * y suavizado (damp) → sin tirones ni bloqueo en el borde de la ventana.
 * Teclado: W empuje continuo (sin tope), S/Shift freno, A/D strafe, Space nitro.
 */
export class ShipController {
  /** Raíz: posición + yaw/pitch. La cámara de persecución lo sigue. */
  readonly object = new THREE.Group();
  /** Pivote interno que recibe el roll; el visual de la nave cuelga de aquí. */
  private readonly rollPivot = new THREE.Group();

  private enabled = true;
  private locked = false;
  private keys: Record<string, boolean> = {};

  // Mirada: target acumula el ratón; yaw/pitch siguen con damp.
  private targetYaw = 0;
  private targetPitch = 0;
  yaw = 0;
  pitch = 0;
  private roll = 0;
  private prevYaw = 0;

  private readonly velocity = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly tmp = new THREE.Vector3();

  // Sintonía
  sensitivity = 0.0022;
  pitchLimit = 1.48; // ~85°
  lookDamp = 12; // mayor = mirada más directa
  rollDamp = 6;
  kRoll = 5.5;
  maxRoll = 0.55;
  acceleration = 140; // empuje continuo (u/s²); SIN maxSpeed
  strafeAccel = 90;
  damping = 0.985; // inercia: cerca de 1 = conserva velocidad
  brakeDamping = 0.92; // damping extra al frenar (S/Shift)
  nitroMultiplier = 6;

  /** Frenado de aproximación: 1 normal; <1 amortigua la velocidad cerca de un planeta. */
  private approachBrake = 1;

  onLockChange?: (locked: boolean) => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.object.add(this.rollPivot);
  }

  /** Adjunta el visual de la nave bajo el pivote de roll. */
  attachVisual(g: THREE.Object3D) {
    this.rollPivot.add(g);
  }

  attach() {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('pointerlockchange', this.onPLChange);
    document.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('blur', this.onBlur);
  }

  detach() {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('pointerlockchange', this.onPLChange);
    document.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('blur', this.onBlur);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  setEnabled(on: boolean) {
    if (this.enabled === on) return;
    this.enabled = on;
    if (!on) this.keys = {};
  }

  /** Solicita el pointer lock sobre el canvas (botón "Tomar control" o clic). */
  requestControl() {
    if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock();
  }

  get isLocked() {
    return this.locked;
  }

  /** Factor de frenado de aproximación (1 normal; <1 amortigua cerca de planeta). */
  setApproachBrake(factor: number) {
    this.approachBrake = Math.max(0, Math.min(1, factor));
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onPLChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    this.onLockChange?.(this.locked);
  };

  // Solo con pointer lock: acumula el delta del ratón en el target de la mirada.
  private onMouseMove = (e: MouseEvent) => {
    if (!this.enabled || !this.locked) return;
    this.targetYaw -= e.movementX * this.sensitivity;
    this.targetPitch -= e.movementY * this.sensitivity;
    this.targetPitch = Math.max(-this.pitchLimit, Math.min(this.pitchLimit, this.targetPitch));
  };

  // Al perder foco (alt-tab, foco al iframe de la cabina): soltar teclas.
  private onBlur = () => {
    this.keys = {};
  };

  update(delta: number): ShipState {
    if (this.enabled) {
      // Mirada suavizada hacia el target (sin tirones). Si no hay lock, target no
      // cambia → la mirada se congela pero la nave conserva inercia.
      const t = 1 - Math.exp(-this.lookDamp * delta);
      this.yaw += (this.targetYaw - this.yaw) * t;
      this.pitch += (this.targetPitch - this.pitch) * t;
    }

    // Tasa de giro de yaw → alabeo objetivo (clamp). El roll lerp hacia el target.
    const yawRate = delta > 0 ? (this.yaw - this.prevYaw) / delta : 0;
    this.prevYaw = this.yaw;
    const targetRoll = bankFromYawRate(yawRate, this.kRoll, this.maxRoll);
    const rt = 1 - Math.exp(-this.rollDamp * delta);
    this.roll += (targetRoll - this.roll) * rt;

    // Raíz: yaw/pitch. Pivote: solo roll (la cámara no rota en roll).
    this.euler.set(this.pitch, this.yaw, 0);
    this.object.quaternion.setFromEuler(this.euler);
    this.rollPivot.rotation.set(0, 0, this.roll);

    // Ejes en el marco del raíz.
    this.forward.set(0, 0, -1).applyQuaternion(this.object.quaternion);
    this.right.crossVectors(this.forward, this.up).normalize();

    const isNitro = !!this.keys['Space'];
    const isBraking = !!this.keys['KeyS'] || !!this.keys['ShiftLeft'] || !!this.keys['ShiftRight'];

    if (this.enabled) {
      const mult = isNitro ? this.nitroMultiplier : 1;
      // Empuje continuo SIN tope: mientras se mantiene W, la velocidad crece.
      if (this.keys['KeyW'] || this.keys['ArrowUp']) {
        this.velocity.add(this.tmp.copy(this.forward).multiplyScalar(this.acceleration * mult * delta));
      }
      // Strafe.
      if (this.keys['KeyD'] || this.keys['ArrowRight']) {
        this.velocity.add(this.tmp.copy(this.right).multiplyScalar(this.strafeAccel * delta));
      }
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
        this.velocity.sub(this.tmp.copy(this.right).multiplyScalar(this.strafeAccel * delta));
      }
    }

    // Damping: inercia normal, extra al frenar, y frenado de aproximación.
    let damp = isBraking ? this.brakeDamping : this.damping;
    damp *= this.approachBrake; // <1 amortigua cerca de un planeta
    this.velocity.multiplyScalar(damp);

    // Integración de la posición del raíz.
    this.object.position.add(this.tmp.copy(this.velocity).multiplyScalar(delta));

    return {
      position: this.object.position,
      velocity: this.velocity,
      quaternion: this.object.quaternion,
      yaw: this.yaw,
      pitch: this.pitch,
      roll: this.roll,
      speed: this.velocity.length(),
      isNitro,
      isBraking,
    };
  }

  /** Rebase de origen: traslada la nave junto con el mundo (preserva worldOffset fuera). */
  rebase(delta: THREE.Vector3) {
    this.object.position.sub(delta);
  }
}
```

- [ ] **Step 2: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS — sin errores de tipos en `ship-controller.ts`. (Errores preexistentes en otros archivos por `FlightController`/`flight` se resuelven en la Task 5; si `lint` falla solo por archivos no tocados aún, continúa — la Task 5 los limpia.)

- [ ] **Step 3: Commit**
  Run:
  ```
  git add shell/src/space/ship-controller.ts
  git commit -m "feat(space): ShipController (nave-entidad, pointer-lock-first, empuje sin tope, alabeo en pivote)"
  ```

---

### Task 4: `chase-camera.ts` — clase `ChaseCamera`

**Files:**
- Create: `shell/src/space/chase-camera.ts` (crear)

> Tarea de integración con Three.js; verificación manual en la Task 5. Escribe el código completo.

- [ ] **Step 1: Write the complete `ChaseCamera` class**

Crear `shell/src/space/chase-camera.ts` con:

```ts
import * as THREE from 'three';
import type { ShipState } from './ship-controller';

/**
 * Cámara de persecución: sigue al raíz de la nave con un resorte (lerp) y aplica
 * un kick de FOV según la velocidad/nitro (sensación de velocidad). Mira a la nave
 * con un adelanto en la dirección de la velocidad. La cámara NO rota en roll
 * (el alabeo lo lleva el visual de la nave en su pivote) → no marea.
 */
export class ChaseCamera {
  private readonly offset: THREE.Vector3;
  private readonly stiffness: number;
  private readonly fovBase: number;
  private readonly fovMax: number;

  private readonly desiredPos = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(
    private camera: THREE.PerspectiveCamera,
    opts?: { offset?: THREE.Vector3; stiffness?: number; fovBase?: number; fovMax?: number },
  ) {
    this.offset = opts?.offset?.clone() ?? new THREE.Vector3(0, 9, 34);
    this.stiffness = opts?.stiffness ?? 8;
    this.fovBase = opts?.fovBase ?? 65;
    this.fovMax = opts?.fovMax ?? 86;
    this.camera.fov = this.fovBase;
    this.camera.updateProjectionMatrix();
  }

  update(shipRoot: THREE.Object3D, state: ShipState, delta: number) {
    // Posición deseada: detrás y arriba de la nave, en el marco de su orientación.
    this.desiredPos.copy(this.offset).applyQuaternion(shipRoot.quaternion).add(shipRoot.position);

    // Lerp de resorte (estable con delta variable).
    const t = 1 - Math.exp(-this.stiffness * delta);
    this.camera.position.lerp(this.desiredPos, t);

    // Mira a la nave con un pequeño adelanto en la dirección de la velocidad.
    this.lookTarget.copy(shipRoot.position).add(this.tmp.copy(state.velocity).multiplyScalar(0.15));
    this.camera.up.set(0, 1, 0); // nunca rueda
    this.camera.lookAt(this.lookTarget);

    // Kick de FOV: satura suave con la velocidad; nitro lo empuja más rápido.
    const speedNorm = Math.min(1, state.speed / 600) * (state.isNitro ? 1.15 : 1);
    const targetFov = this.fovBase + (this.fovMax - this.fovBase) * Math.min(1, speedNorm);
    this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-4 * delta));
    this.camera.updateProjectionMatrix();
  }
}
```

- [ ] **Step 2: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS para `chase-camera.ts` (mismo caveat que la Task 3 sobre archivos aún no tocados).

- [ ] **Step 3: Commit**
  Run:
  ```
  git add shell/src/space/chase-camera.ts
  git commit -m "feat(space): ChaseCamera (resorte + FOV kick, sin roll de cámara)"
  ```

---

### Task 5: Cablear en `space-engine.ts` + eliminar `flight.ts`

**Files:**
- Modify: `shell/src/space/space-engine.ts`
  - imports (líneas 5–6)
  - campos (líneas 54–55)
  - `mount` bloque de vuelo/HUD (líneas 117–143)
  - `loop` actualización de subsistemas (líneas 175–202)
  - `onCanvasClick` (líneas 235–250)
  - `pause` (línea 363)
  - `dispose` (línea 374)
- Modify: `shell/src/space/hud.ts` (línea 60 — firma de `update`, para que compile con `ShipState`)
- Delete: `shell/src/space/flight.ts`

> Tarea de integración. La verificación es manual en el dev server. Sustituye `FlightController` por `ShipController` + `ChaseCamera`, añade la nave a la escena (no como hija de la cámara), rebasa sobre la nave, y añade el prompt "Clic para tomar control". Mantiene `constellations`/`radar`/`hud`/`playerShip` existentes funcionando con adaptadores mínimos (los reescriben planes posteriores).

- [ ] **Step 1: Reemplazar el import de `flight` por `ship-controller` y `chase-camera`**

En `shell/src/space/space-engine.ts`, reemplaza la línea 5:

```ts
import { FlightController, type FlightState } from './flight';
```

por:

```ts
import { ShipController, type ShipState } from './ship-controller';
import { ChaseCamera } from './chase-camera';
```

- [ ] **Step 2: Reemplazar los campos `flight`/`lastFlight`**

Reemplaza las líneas 54–55:

```ts
  private flight!: FlightController;
  private lastFlight?: FlightState;
```

por:

```ts
  private ship!: ShipController;
  private chaseCamera!: ChaseCamera;
  private lastShip?: ShipState;
  private controlPrompt!: HTMLElement;
```

- [ ] **Step 3: Reemplazar el bloque de creación de vuelo/HUD y el hack de cámara**

Reemplaza las líneas 117–143 (desde el comentario `// Control de vuelo...` hasta `this.camera.add(this.playerShip.object);` inclusive):

```ts
    // Control de vuelo (ratón libre + WASD + nitro)
    this.flight = new FlightController(this.camera, this.canvas);
    this.flight.attach();

    // HUD (reticula, velocidad, nitro, coords, vignette)
    this.hud = new Hud(host);
    this.flight.onFirstInput = () => this.hud.hideStartMessage();

    // ── Mundo ──
    this.galaxy = createGalaxy(this.renderer);
    this.scene.add(this.galaxy.object);

    this.ramatzoSun = createRamatzoSun();
    this.scene.add(this.ramatzoSun.object);

    this.chunks = new ChunkManager(this.scene, this.renderer);
    this.constellations = new ConstellationManager(this.scene, opts.apps, this.renderer);
    this.radar = new Radar(host);
    this.ships = placeShips(this.scene);

    // Nave del jugador visible (vista de persecución): adjunta a la cámara.
    // La cámara debe estar en la escena para que sus hijos se rendericen.
    this.scene.add(this.camera);
    this.playerShip = createPlayerShip();
    this.playerShip.object.position.set(0, -2.0, -9);
    this.playerShip.object.scale.setScalar(0.85);
    this.camera.add(this.playerShip.object);
```

por:

```ts
    // Control de vuelo: la nave es una entidad en el mundo; la cámara la sigue.
    this.ship = new ShipController(this.canvas);
    this.ship.attach();
    this.ship.object.position.set(0, 120, 2600); // spawn mirando al sistema
    this.scene.add(this.ship.object);
    this.chaseCamera = new ChaseCamera(this.camera);

    // HUD (reticula, velocidad, nitro, coords, vignette)
    this.hud = new Hud(host);
    this.ship.onLockChange = (locked) => {
      this.controlPrompt.classList.toggle('visible', !locked);
      if (locked) this.hud.hideStartMessage();
    };

    // ── Mundo ──
    this.galaxy = createGalaxy(this.renderer);
    this.scene.add(this.galaxy.object);

    this.ramatzoSun = createRamatzoSun();
    this.scene.add(this.ramatzoSun.object);

    this.chunks = new ChunkManager(this.scene, this.renderer);
    this.constellations = new ConstellationManager(this.scene, opts.apps, this.renderer);
    this.radar = new Radar(host);
    this.ships = placeShips(this.scene);

    // Nave del jugador visible: cuelga del pivote de roll del ShipController
    // (se inclina en los giros); el raíz lleva posición + yaw/pitch.
    this.playerShip = createPlayerShip();
    this.playerShip.object.scale.setScalar(0.85);
    this.ship.attachVisual(this.playerShip.object);

    // Prompt "Clic para tomar control" (visible cuando no hay pointer lock).
    this.controlPrompt = document.createElement('div');
    this.controlPrompt.id = 'controlPrompt';
    this.controlPrompt.className = 'visible';
    this.controlPrompt.textContent = 'Clic para tomar control';
    host.appendChild(this.controlPrompt);
```

- [ ] **Step 4: Reescribir la sección de actualización del `loop`**

Reemplaza las líneas 175–202 (desde el comentario `// Congela el vuelo...` hasta `this.playerShip.update(this.elapsed);` inclusive):

```ts
    // Congela el vuelo (mirar + WASD) mientras hay overlay de proyecto o menú ESC.
    this.flight.setEnabled(!this.overlay.visible && !this.escMenu.classList.contains('visible'));
    // Frontera blanda: dentro de la esfera poblada (≈ los proyectos) vuelo normal;
    // al alejarse del origen, freno progresivo hasta un mínimo, con aviso de rumbo.
    const fromOrigin = this.camera.position.clone().add(this.worldOffset).length();
    const SOFT = 70000;
    const HARD = 100000;
    this.flight.setSpeedScale(fromOrigin <= SOFT ? 1 : Math.max(0.05, 1 - (fromOrigin - SOFT) / (HARD - SOFT)));
    const flight = this.flight.update(delta);
    this.lastFlight = flight;
    this.maybeRebase();
    this.hud.update(
      flight,
      this.camera.position.x + this.worldOffset.x,
      this.camera.position.z + this.worldOffset.z,
      this.flight.maxSpeed * this.flight.nitroMultiplier,
    );
    this.hud.setStray(fromOrigin > SOFT, fromOrigin > HARD * 0.85);

    this.galaxy.update(this.elapsed, delta, this.camera.position);
    this.ramatzoSun.update(this.elapsed);

    setStarGasTime(this.elapsed);
    this.chunks.update(this.camera.position.clone().add(this.worldOffset));
    this.constellations.update(this.elapsed, delta);
    this.radar.draw(this.camera.position, flight.yaw, this.constellations.getRadarBlips(), this.ramatzoSun.position);
    floatShips(this.ships, this.elapsed, delta);
    this.playerShip.update(this.elapsed);
```

por:

```ts
    // Congela el vuelo (mirar + WASD) mientras hay overlay de proyecto o menú ESC.
    this.ship.setEnabled(!this.overlay.visible && !this.escMenu.classList.contains('visible'));

    // Vuelo: la nave se mueve; la cámara la sigue.
    const ship = this.ship.update(delta);
    this.lastShip = ship;
    this.chaseCamera.update(this.ship.object, ship, delta);

    this.maybeRebase();

    const worldX = ship.position.x + this.worldOffset.x;
    const worldZ = ship.position.z + this.worldOffset.z;
    this.hud.update(ship, worldX, worldZ, 600);

    const fromOrigin = ship.position.clone().add(this.worldOffset).length();
    const SOFT = 70000;
    const HARD = 100000;
    this.hud.setStray(fromOrigin > SOFT, fromOrigin > HARD * 0.85);

    this.galaxy.update(this.elapsed, delta, this.camera.position);
    this.ramatzoSun.update(this.elapsed);

    setStarGasTime(this.elapsed);
    this.chunks.update(ship.position.clone().add(this.worldOffset));
    this.constellations.update(this.elapsed, delta);
    this.radar.draw(ship.position, ship.yaw, this.constellations.getRadarBlips(), this.ramatzoSun.position);
    floatShips(this.ships, this.elapsed, delta);
    this.playerShip.update(this.elapsed);
```

> Nota: `this.hud.update(ship, ...)` requiere que `hud.ts` acepte `ShipState`. Se ajusta su firma en el Step 7. El cuarto argumento `600` es el `maxNitroSpeed` usado por la barra de nitro (sin tope real; solo para escalar la barra).

- [ ] **Step 5: Reescribir `onCanvasClick` (pointer-lock-first)**

Reemplaza las líneas 235–250 (desde el comentario `// Clic en el canvas...` hasta el cierre del método `onCanvasClick`):

```ts
  // Clic en el canvas: abre el proyecto de la constelación bajo el cursor
  // (raycast desde la posición del ratón). Sin pointer lock.
  // Clic: si el puntero no está bloqueado, FlightController lo bloquea (mirar).
  // Si ya está bloqueado, selecciona el proyecto bajo la reticula (centro) y suelta
  // el puntero para poder usar el overlay.
  private onCanvasClick = () => {
    if (this.overlay.visible) return;
    this.scene.updateMatrixWorld(); // posiciones de planetas en órbita al día para el raycast
    const app = this.constellations.pickApp(this.camera, this.centerNDC);
    if (app) {
      document.exitPointerLock();
      this.overlay.show(app);
    } else if (!this.flight.isPointerLocked) {
      this.canvas.requestPointerLock(); // clic en vacío: bloquear puntero (giro ilimitado)
    }
  };
```

por:

```ts
  // Clic en el canvas: si no hay pointer lock, tomar control (bloquear el puntero
  // para mirar con el ratón). Si ya está bloqueado, seleccionar el proyecto bajo la
  // reticula central y soltar el puntero para usar el overlay.
  private onCanvasClick = () => {
    if (this.overlay.visible) return;
    if (!this.ship.isLocked) {
      this.ship.requestControl();
      return;
    }
    this.scene.updateMatrixWorld(); // posiciones de planetas en órbita al día para el raycast
    const app = this.constellations.pickApp(this.camera, this.centerNDC);
    if (app) {
      document.exitPointerLock();
      this.overlay.show(app);
    }
  };
```

- [ ] **Step 6: Actualizar `pause`, `dispose` y `maybeRebase` para usar la nave**

En `pause` reemplaza la línea 363:

```ts
    this.flight?.setEnabled(false); // suelta teclas: evita nave acelerando al volver de la cabina
```

por:

```ts
    this.ship?.setEnabled(false); // suelta teclas: evita nave acelerando al volver de la cabina
```

En `dispose` reemplaza la línea 374:

```ts
    this.flight?.detach();
```

por:

```ts
    this.ship?.detach();
```

Y, también en `dispose`, tras `this.escMenu?.remove();` añade:

```ts
    this.controlPrompt?.remove();
```

En `maybeRebase` (líneas 337–350), reemplaza el cuerpo para rebasar sobre la posición de la NAVE y trasladar también la cámara y la nave:

```ts
  private maybeRebase() {
    if (this.camera.position.length() <= this.rebaseThreshold) return;
    const delta = new THREE.Vector3(
      Math.round(this.camera.position.x / 100) * 100,
      Math.round(this.camera.position.y / 100) * 100,
      Math.round(this.camera.position.z / 50) * 50,
    );
    this.camera.position.sub(delta);
    this.worldOffset.add(delta);
    this.chunks.rebase(delta);
    this.constellations.rebase(delta);
    this.ramatzoSun.object.position.sub(delta);
    for (const s of this.ships) s.position.sub(delta);
  }
```

por:

```ts
  private maybeRebase() {
    if (this.ship.object.position.length() <= this.rebaseThreshold) return;
    const delta = new THREE.Vector3(
      Math.round(this.ship.object.position.x / 100) * 100,
      Math.round(this.ship.object.position.y / 100) * 100,
      Math.round(this.ship.object.position.z / 50) * 50,
    );
    this.ship.rebase(delta);
    this.camera.position.sub(delta);
    this.worldOffset.add(delta);
    this.chunks.rebase(delta);
    this.constellations.rebase(delta);
    this.ramatzoSun.object.position.sub(delta);
    for (const s of this.ships) s.position.sub(delta);
  }
```

> Nota: ya NO se hace `this.scene.add(this.camera)` (la nave no cuelga de la cámara). La cámara se posiciona vía `ChaseCamera`. La línea `this.scene.add(this.camera)` fue eliminada en el Step 3.

- [ ] **Step 7: Ajustar la firma de `hud.ts` para aceptar `ShipState`**

En `shell/src/space/hud.ts`, reemplaza la línea 1:

```ts
import type { FlightState } from './flight';
```

por:

```ts
import type { ShipState } from './ship-controller';
```

Y reemplaza la línea 60 (firma de `update`):

```ts
  update(state: FlightState, worldX: number, worldZ: number, maxNitroSpeed: number) {
```

por:

```ts
  update(state: ShipState, worldX: number, worldZ: number, maxNitroSpeed: number) {
```

> `ShipState` incluye `speed`, `isNitro`, `yaw`, `pitch` además de los nuevos campos, por lo que el cuerpo actual de `update` (que usa `state.speed` y `state.isNitro`) compila sin más cambios. El HUD se reescribe en un plan posterior.

- [ ] **Step 8: Eliminar `flight.ts`**
  Run:
  ```
  git rm shell/src/space/flight.ts
  ```

- [ ] **Step 9: Type-check (todo el paquete)**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS — sin referencias colgantes a `FlightController`/`FlightState`/`./flight`. Si `tsc` reporta un error, corrígelo (búsqueda de usos residuales de `this.flight`, `FlightState`, o el import de `./flight`) y repite hasta PASS.

- [ ] **Step 10: Build**
  Run: `pnpm --filter @plataforma/shell build`
  Expected: PASS — `tsc && vite build` completa sin errores.

- [ ] **Step 11: Manual dev-server verification**
  Run: `pnpm --filter @plataforma/shell dev`
  Open: `http://localhost:5173`; inicia sesión para llegar a la experiencia espacial.
  Expected (observa cada punto):
  - Al entrar aparece el prompt "Clic para tomar control" sobre el canvas.
  - Al hacer clic, el cursor desaparece (pointer lock activo) y el prompt se oculta.
  - Mover el ratón gira la mirada de forma suave (sin tirones); al llegar al borde de la ventana la mirada NO se bloquea (el lock evita el límite del borde).
  - `W` acelera de forma progresiva y la velocidad sigue creciendo mientras se mantiene `W` (sin tope); `S`/`Shift` frena; `A`/`D` desplazan lateralmente; `Space` da un empujón de nitro y el FOV se abre (sensación de velocidad).
  - La nave visible se ve por delante/debajo de la cámara y se INCLINA (alabeo) al girar a izquierda/derecha; la cámara en sí NO rueda (el horizonte no gira).
  - Al pulsar ESC (o el menú actual) y reanudar, la nave no sale acelerando sola.

- [ ] **Step 12: Commit**
  Run:
  ```
  git add shell/src/space/space-engine.ts shell/src/space/hud.ts
  git rm shell/src/space/flight.ts
  git commit -m "refactor(space): cablear ShipController + ChaseCamera; nave-entidad en escena; eliminar FlightController"
  ```

---

### Task 6: Verificación final del subsistema

**Files:** ninguno (solo comandos de verificación).

- [ ] **Step 1: Ejecutar toda la batería de tests del shell**
  Run: `pnpm --filter @plataforma/shell test`
  Expected: PASS — incluye `flight-math.test.ts` (bankFromYawRate + approachBrakeFactor) y `layout.test.ts` sin regresiones.

- [ ] **Step 2: Type-check final**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS.

- [ ] **Step 3: Confirmar que `flight.ts` ya no existe y no quedan referencias**
  Run: `git grep -n "FlightController\|FlightState\|from './flight'" shell/src` (desde la raíz del repo)
  Expected: sin coincidencias (salida vacía).

> Con esto, el subsistema de control de vuelo queda en su lugar: la nave es una entidad del mundo con pointer-lock-first mouse-look suavizado, empuje sin tope, freno/strafe/nitro, alabeo en pivote visual y `setApproachBrake`/`rebase` listos para que los planes de solar-system, radar, hud y player-ship se construyan encima usando el contrato `ShipState`.
