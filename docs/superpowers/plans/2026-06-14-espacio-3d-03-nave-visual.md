---
# Nave: modelo futurista luminoso y animación reactiva — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Reemplazar la nave del jugador por un modelo radicalmente futurista, elegante/agresivo y auto-iluminado (luces propias + emisivos, paleta fría + ámbar) que destaca en la oscuridad sin iluminar el entorno, y que reacciona en tiempo real a `ShipState` (toberas que se estiran/brillan con la velocidad, warp de nitro, bob en reposo, estrobos de navegación, pulso de costura emisiva y estela aditiva que crece con la velocidad).

**Architecture:** `createPlayerShip()` se reescribe para devolver `{ object, update(elapsed, state, delta), dispose() }`. El modelo se construye por capas (casco/cabina, alas+luces nav, toberas, auto-iluminación) y la animación lee `state.speed`, `state.isNitro` y `state.isBraking` para escalar toberas, estela y estrobos. Una función pura `thrustGlow(speed, isNitro)` (en `thrust-visual.ts`, sin Three.js) concentra la matemática del brillo/longitud de tobera y se testea con Vitest. El alabeo (roll) NO se aplica aquí: lo hace el pivote visual de `ShipController` (plan 01) al que esta nave se adjunta vía `attachVisual`. El bloom se afina en `space-engine.ts`.

**Tech Stack:** TypeScript, Three.js 0.170, Lit 3, Vitest. Package @plataforma/shell.

**Depends on:** plan 01 (`ship-controller.ts`: `ShipState`, `attachVisual`). El método `update` de esta nave consume el `ShipState` que produce `ShipController.update(delta)`. La integración en `space-engine.ts` (sustituir `camera.add(playerShip.object)` por `ship.attachVisual(playerShip.object)` y la llamada `playerShip.update(elapsed, shipState, delta)`) puede pertenecer al plan de orquestación; este plan deja la nave lista para ese contrato y afina el bloom.

---
---

## File structure

| File | Created/Modified | Responsibility |
|---|---|---|
| `shell/src/space/thrust-visual.ts` | Created | Lógica PURA (sin Three.js): `thrustGlow(speed, isNitro)` devuelve factores normalizados de longitud, brillo y opacidad de estela según la velocidad. |
| `shell/src/space/thrust-visual.test.ts` | Created | Tests Vitest (entorno node) de `thrustGlow`: monotonía, clamps, salto de nitro. |
| `shell/src/space/player-ship.ts` | Modified (reescritura completa) | Construye el modelo de nave luminoso por capas y lo anima reactivamente con `update(elapsed, state, delta)`. Sin aplicar roll. |
| `shell/src/space/space-engine.ts` | Modified (líneas 113-115) | Afinado del `UnrealBloomPass` para que los acentos emisivos de la nave destaquen sin emborronar el sistema. |

Nota de contrato: la firma final exportada es

```ts
createPlayerShip(): { object: THREE.Group; update(elapsed: number, state: ShipState, delta: number): void; dispose(): void };
```

`ShipState` se importa de `./ship-controller` (plan 01).

---

## Task 1: Helper PURO `thrustGlow(speed, isNitro)` (TDD)

**Files:**
- Create: `shell/src/space/thrust-visual.ts`
- Test: `shell/src/space/thrust-visual.test.ts`

Esta función concentra toda la matemática de la animación de empuje para que sea testeable sin Three.js. Devuelve factores normalizados que el `update` visual aplica a geometría/materiales. La velocidad de referencia (`speed` en unidades/seg) se normaliza por una constante `SPEED_REF` para que el resultado sature de forma suave; nitro añade un empujón extra acotado.

- [ ] **Step 1: Write the failing test**

Create `shell/src/space/thrust-visual.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { thrustGlow } from './thrust-visual';

describe('thrustGlow', () => {
  it('en reposo da un mínimo de ralentí, no cero', () => {
    const g = thrustGlow(0, false);
    expect(g.length).toBeGreaterThan(0);
    expect(g.glow).toBeGreaterThan(0);
    expect(g.trailOpacity).toBeGreaterThanOrEqual(0);
    expect(g.length).toBeLessThan(0.5); // ralentí discreto
  });

  it('length y glow crecen de forma monótona con la velocidad', () => {
    const slow = thrustGlow(50, false);
    const fast = thrustGlow(400, false);
    expect(fast.length).toBeGreaterThan(slow.length);
    expect(fast.glow).toBeGreaterThan(slow.glow);
    expect(fast.trailOpacity).toBeGreaterThan(slow.trailOpacity);
  });

  it('satura: a velocidad enorme los factores quedan acotados (<= máximos)', () => {
    const huge = thrustGlow(100000, false);
    expect(huge.length).toBeLessThanOrEqual(1.0001);
    expect(huge.glow).toBeLessThanOrEqual(1.0001);
    expect(huge.trailOpacity).toBeLessThanOrEqual(1.0001);
  });

  it('nitro empuja por encima del mismo speed sin nitro', () => {
    const normal = thrustGlow(200, false);
    const nitro = thrustGlow(200, true);
    expect(nitro.length).toBeGreaterThan(normal.length);
    expect(nitro.glow).toBeGreaterThan(normal.glow);
  });

  it('clamp de velocidad negativa: no produce NaN ni valores < mínimo', () => {
    const g = thrustGlow(-100, false);
    expect(Number.isFinite(g.length)).toBe(true);
    expect(g.length).toBeGreaterThan(0);
    expect(g.glow).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/thrust-visual.test.ts`
  Expected: FAIL — el módulo `./thrust-visual` no existe todavía (error de import/resolución).

- [ ] **Step 3: Write minimal implementation**

Create `shell/src/space/thrust-visual.ts`:

```ts
/**
 * Lógica PURA (sin Three.js) de la animación de empuje de la nave.
 * Convierte la velocidad real (unidades/seg) en factores normalizados que el
 * modelo 3D aplica a la longitud/brillo de las toberas y a la opacidad de la
 * estela. Testeable en el entorno node de Vitest (patrón de layout.ts).
 */

/** Velocidad (u/s) a la que el empuje normal está prácticamente saturado. */
const SPEED_REF = 600;
/** Brillo/longitud mínimos en ralentí (la nave nunca está "apagada"). */
const IDLE_LENGTH = 0.18;
const IDLE_GLOW = 0.22;
/** Empujón adicional del nitro (sumado antes del clamp). */
const NITRO_BOOST = 0.3;

export interface ThrustFactors {
  /** 0..1 — longitud relativa de la llama/tobera. */
  length: number;
  /** 0..1 — intensidad emisiva relativa del núcleo. */
  glow: number;
  /** 0..1 — opacidad de la estela aditiva. */
  trailOpacity: number;
}

/**
 * Curva suave (saturante) de la velocidad a factores de empuje.
 * @param speed  velocidad real en unidades/seg (se acota a >= 0).
 * @param isNitro si el nitro está activo, añade un empujón acotado.
 */
export function thrustGlow(speed: number, isNitro: boolean): ThrustFactors {
  const v = Math.max(0, speed);
  // Saturación suave: 0 -> 0, infinito -> 1.
  const norm = v / (v + SPEED_REF);
  const boost = isNitro ? NITRO_BOOST : 0;

  const length = clamp01(IDLE_LENGTH + norm * (1 - IDLE_LENGTH) + boost);
  const glow = clamp01(IDLE_GLOW + norm * (1 - IDLE_GLOW) + boost);
  // La estela arranca en 0 (en reposo no hay estela visible) y crece con la velocidad.
  const trailOpacity = clamp01(norm + boost);

  return { length, glow, trailOpacity };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
```

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/thrust-visual.test.ts`
  Expected: PASS — los 5 casos verdes.

- [ ] **Step 5: Commit**
  Run:
  ```
  git add shell/src/space/thrust-visual.ts shell/src/space/thrust-visual.test.ts
  git commit -m "test(space): thrustGlow puro para animacion de empuje de la nave"
  ```

---

## Task 2: Reescritura de `player-ship.ts` — casco + cabina (capa base)

**Files:**
- Modify: `shell/src/space/player-ship.ts` (reescritura completa del archivo; en esta tarea queda el modelo base del casco/cabina y un `update` provisional que solo lee `state` sin animar todavía).

En esta tarea se establece la nueva firma del módulo (`update(elapsed, state, delta)`), el patrón de tracking de disposables y la geometría del casco principal (fuselaje aerodinámico en flecha) y la cabina de cristal frío. Todavía SIN toberas, SIN luces nav, SIN auto-iluminación ni estela: esas capas se añaden en tareas posteriores para mantener pasos pequeños. El eje sigue la convención existente: nariz hacia `-Z`, motores hacia `+Z`. El `update` no aplica roll (lo hace el pivote de `ShipController`).

Paleta (sci-fi luminoso sobrio, NO neón Tron): casco metálico frío grafito-azulado, cabina cian translúcida muy oscura, acentos ámbar. Sin verdes/magentas chillones.

- [ ] **Step 1: Reescribir el archivo completo con la capa de casco + cabina**

Replace the ENTIRE contents of `shell/src/space/player-ship.ts` with:

```ts
import * as THREE from 'three';
import type { ShipState } from './ship-controller';
import { thrustGlow } from './thrust-visual';

export interface PlayerShip {
  object: THREE.Group;
  update(elapsed: number, state: ShipState, delta: number): void;
  dispose(): void;
}

/**
 * Nave del jugador "Constellation OS v3": casco aerodinámico en flecha,
 * cabina de cristal frío, alas con luces de navegación, toberas reactivas y
 * estela aditiva. AUTO-ILUMINADA (luces propias acotadas + materiales emisivos)
 * para destacar en la oscuridad SIN iluminar el entorno (rangos de luz cortos).
 * Estética sci-fi luminosa y sobria (Star Citizen / No Man's Sky), nunca neón
 * chillón. Eje: nariz hacia -Z, motores hacia +Z. Vista de persecución.
 *
 * IMPORTANTE: el alabeo (roll) lo aplica el pivote visual de ShipController
 * (plan 01) sobre el contenedor al que se adjunta esta nave. Este update SOLO
 * anima toberas, estela, luces y bob; NUNCA toca la rotación del objeto raíz.
 */
export function createPlayerShip(): PlayerShip {
  const ship = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => {
    disposables.push(o);
    return o;
  };

  // ── Paleta (fría + ámbar) ──
  const hull = track(
    new THREE.MeshStandardMaterial({ color: 0x2a3340, metalness: 0.9, roughness: 0.32, emissive: 0x070b12, emissiveIntensity: 1 }),
  );
  const hullLight = track(
    new THREE.MeshStandardMaterial({ color: 0x3d4a5c, metalness: 0.85, roughness: 0.4 }),
  );
  const dark = track(new THREE.MeshStandardMaterial({ color: 0x10151c, metalness: 0.7, roughness: 0.6 }));
  const glass = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x0a1820,
      metalness: 0,
      roughness: 0.05,
      transparent: true,
      opacity: 0.55,
      emissive: 0x0c3a4a,
      emissiveIntensity: 0.6,
    }),
  );
  const trim = track(new THREE.MeshStandardMaterial({ color: 0x8aa0b8, metalness: 0.95, roughness: 0.2 }));

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, cfg: (m: THREE.Mesh) => void): THREE.Mesh => {
    track(geo);
    const m = new THREE.Mesh(geo, mat);
    cfg(m);
    ship.add(m);
    return m;
  };

  // ── Casco: fuselaje aerodinámico en flecha ──
  // Cuerpo central (cápsula alargada hacia -Z).
  add(new THREE.CapsuleGeometry(0.5, 2.6, 10, 20), hull, (m) => {
    m.rotation.x = Math.PI / 2;
    m.position.z = 0.1;
  });
  // Nariz cónica afilada.
  add(new THREE.ConeGeometry(0.5, 1.8, 20), hullLight, (m) => {
    m.rotation.x = -Math.PI / 2;
    m.position.z = -2.5;
  });
  // Bloque trasero de motores (donde irán las toberas).
  add(new THREE.CylinderGeometry(0.62, 0.5, 0.7, 20), dark, (m) => {
    m.rotation.x = Math.PI / 2;
    m.position.z = 1.7;
  });
  // Espina dorsal (acento metálico claro a lo largo del lomo).
  add(new THREE.BoxGeometry(0.06, 0.12, 3.0), trim, (m) => {
    m.position.set(0, 0.42, 0.0);
  });

  // ── Cabina de cristal frío + marco ──
  add(new THREE.SphereGeometry(0.4, 22, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass, (m) => {
    m.position.set(0, 0.34, -0.95);
    m.scale.set(1, 0.8, 1.8);
  });
  add(new THREE.TorusGeometry(0.4, 0.035, 8, 28), trim, (m) => {
    m.position.set(0, 0.34, -0.95);
    m.rotation.x = Math.PI / 2;
    m.scale.set(1, 1.8, 1);
  });

  return {
    object: ship,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    update(_elapsed, _state, _delta) {
      // Las capas reactivas (toberas, estela, luces, bob) se añaden en tareas
      // posteriores. Nunca aplicar roll aquí.
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
```

- [ ] **Step 2: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS (sin errores de tipo). Nota: si `ship-controller.ts` aún no exporta `ShipState` porque el plan 01 no se ha ejecutado en este worktree, el import fallará; en ese caso ejecuta el plan 01 primero (este plan declara esa dependencia).

- [ ] **Step 3: Manual verification**
  Run: `pnpm --filter @plataforma/shell dev`; abre http://localhost:5173; inicia sesión.
  Expected: la nave de persecución aparece con un casco aerodinámico gris azulado frío con nariz afilada y una cabina de cristal cian oscuro. Aún no hay llamas de motor ni luces de navegación (es esperado). La nave no se ve negra/plana: el casco capta la luz de escena. No hay errores en consola.

- [ ] **Step 4: Commit**
  Run:
  ```
  git add shell/src/space/player-ship.ts
  git commit -m "feat(space): nuevo casco y cabina de la nave del jugador (capa base)"
  ```

---

## Task 3: Alas en flecha + luces de navegación (estrobo babor/estribor)

**Files:**
- Modify: `shell/src/space/player-ship.ts` (añadir alas y luces de navegación tras la cabina; declarar el array `navLights` para animar el estrobo en una tarea posterior).

Añade dos alas en flecha con pods en la punta y una luz de navegación por punta: rojo a babor (lado `-1`) y verde-cian frío a estribor (lado `+1`), convención aeronáutica. Las luces se guardan en `navLights` con su material emisivo y fase para estrobar después. Acentos ámbar en los bordes de fuga.

- [ ] **Step 1: Añadir materiales de luces nav y acento**

In `shell/src/space/player-ship.ts`, after the `trim` material declaration (the line `const trim = track(new THREE.MeshStandardMaterial({ color: 0x8aa0b8, metalness: 0.95, roughness: 0.2 }));`), add:

```ts
  // Acento ámbar (costuras de energía) y luces de navegación.
  const amber = track(new THREE.MeshStandardMaterial({ color: 0xffb24d, emissive: 0xff8c2a, emissiveIntensity: 2.0 }));
  const navPort = track(new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 3 }));
  const navStarboard = track(new THREE.MeshStandardMaterial({ color: 0x33e0c0, emissive: 0x33e0c0, emissiveIntensity: 3 }));
```

- [ ] **Step 2: Declarar el registro de luces de navegación**

In `shell/src/space/player-ship.ts`, after the `add` helper closure (the block ending with `return m; };`), add:

```ts
  // Registro de luces de navegación: material emisivo + desfase de estrobo.
  const navLights: { mat: THREE.MeshStandardMaterial; phase: number }[] = [];
```

- [ ] **Step 3: Añadir alas + pods + luces de navegación**

In `shell/src/space/player-ship.ts`, immediately before the final `return {` of `createPlayerShip`, add:

```ts
  // ── Alas en flecha + pods + luces de navegación ──
  const wingGeo = new THREE.BoxGeometry(2.2, 0.07, 0.9);
  for (const side of [-1, 1] as const) {
    add(wingGeo, hull, (m) => {
      m.position.set(side * 1.35, -0.05, 0.45);
      m.rotation.y = side * -0.32;
      m.rotation.z = side * 0.08;
    });
    // Pod en la punta.
    add(new THREE.CapsuleGeometry(0.09, 0.5, 6, 10), hullLight, (m) => {
      m.rotation.x = Math.PI / 2;
      m.position.set(side * 2.5, -0.05, 0.55);
    });
    // Borde de fuga ámbar.
    add(new THREE.BoxGeometry(1.6, 0.03, 0.05), amber, (m) => {
      m.position.set(side * 1.4, -0.04, 0.92);
      m.rotation.y = side * -0.32;
    });
    // Luz de navegación: roja a babor (-1), cian a estribor (+1).
    const navMat = side < 0 ? navPort : navStarboard;
    add(new THREE.SphereGeometry(0.07, 10, 10), navMat, (m) => {
      m.position.set(side * 2.78, -0.05, 0.3);
    });
    navLights.push({ mat: navMat, phase: side < 0 ? 0 : Math.PI });
  }
```

- [ ] **Step 4: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS. (Habrá un aviso de variable sin usar `navLights` solo si el linter es estricto con declaraciones; si `lint` falla por ello, no lo silencies — la siguiente tarea la usa; reordena las tareas o marca `navLights` con un uso trivial. En la práctica el array está declarado con `const` y se rellena, así que el linter lo considera usado.)

- [ ] **Step 5: Manual verification**
  Run: `pnpm --filter @plataforma/shell dev`; abre http://localhost:5173; inicia sesión.
  Expected: la nave muestra dos alas en flecha con un punto de luz rojo en la punta izquierda (babor) y cian en la derecha (estribor), y un fino borde ámbar en la cola de cada ala. Las luces aún no parpadean (estrobo en tarea siguiente). Sin errores en consola.

- [ ] **Step 6: Commit**
  Run:
  ```
  git add shell/src/space/player-ship.ts
  git commit -m "feat(space): alas en flecha y luces de navegacion de la nave"
  ```

---

## Task 4: Toberas (núcleos emisivos + conos de llama estirables)

**Files:**
- Modify: `shell/src/space/player-ship.ts` (añadir dos toberas con núcleo emisivo y cono de llama; registrar `cores`, `flames`, `flameBaseLen` para animarlos con `thrustGlow`).

Cada motor tiene una boquilla oscura, un núcleo emisivo ámbar (disco) y un cono de llama que se estira en `+Z` con la velocidad. Las llamas usan material emisivo con `AdditiveBlending` para integrarse con el bloom. Se registran para animar longitud/brillo en la tarea de `update`.

- [ ] **Step 1: Añadir registros de toberas y la textura de la estela**

In `shell/src/space/player-ship.ts`, right after the `navLights` array declaration (`const navLights: ... = [];`), add:

```ts
  // Registros para la animación reactiva.
  const cores: THREE.Mesh[] = [];
  const flames: THREE.Mesh[] = [];
  const FLAME_BASE_LEN = 1.4; // longitud del cono de llama a empuje máximo (z+).
```

- [ ] **Step 2: Añadir las toberas (boquilla + núcleo + llama)**

In `shell/src/space/player-ship.ts`, immediately before the final `return {`, add:

```ts
  // ── Toberas: boquilla oscura + núcleo emisivo + cono de llama estirable ──
  const flameMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xffb24d,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  for (const ex of [-0.3, 0.3] as const) {
    // Boquilla.
    add(new THREE.CylinderGeometry(0.24, 0.3, 0.5, 18), dark, (m) => {
      m.rotation.x = Math.PI / 2;
      m.position.set(ex, 0, 2.0);
    });
    // Anillo de boquilla ámbar.
    add(new THREE.TorusGeometry(0.24, 0.03, 8, 20), amber, (m) => {
      m.rotation.x = Math.PI / 2;
      m.position.set(ex, 0, 2.22);
    });
    // Núcleo emisivo.
    const core = add(
      new THREE.CircleGeometry(0.2, 18),
      track(new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb24d, emissiveIntensity: 2.5, side: THREE.DoubleSide })),
      (m) => {
        m.position.set(ex, 0, 2.24);
        m.rotation.y = Math.PI; // mira hacia +Z (atrás).
      },
    );
    cores.push(core);
    // Cono de llama (vértice hacia +Z). El pivote queda en la base (z=2.24);
    // escalando en Z la llama crece hacia atrás. ConeGeometry apunta +Y por
    // defecto, lo rotamos para que apunte +Z y desplazamos para que la base
    // quede en la boquilla.
    const flameGeo = track(new THREE.ConeGeometry(0.18, FLAME_BASE_LEN, 16, 1, true));
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.rotation.x = -Math.PI / 2; // eje del cono ahora a lo largo de +Z.
    flame.position.set(ex, 0, 2.24 + FLAME_BASE_LEN / 2);
    ship.add(flame);
    flames.push(flame);
  }
```

- [ ] **Step 3: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS.

- [ ] **Step 4: Manual verification**
  Run: `pnpm --filter @plataforma/shell dev`; abre http://localhost:5173; inicia sesión.
  Expected: la nave muestra dos toberas traseras con un núcleo ámbar brillante y un cono de llama ámbar translúcido detrás de cada motor. Las llamas son visibles pero todavía de longitud fija (no reaccionan a la velocidad: eso llega en la tarea de `update`). Sin errores en consola.

- [ ] **Step 5: Commit**
  Run:
  ```
  git add shell/src/space/player-ship.ts
  git commit -m "feat(space): toberas con nucleo emisivo y conos de llama de la nave"
  ```

---

## Task 5: Auto-iluminación (luces propias acotadas, sin iluminar el entorno)

**Files:**
- Modify: `shell/src/space/player-ship.ts` (añadir 2-3 `PointLight` de rango corto y baja distancia para revelar el casco sin teñir el mundo).

La nave debe destacar en la oscuridad por luz propia, pero NO iluminar planetas/asteroides. Se usan `PointLight` con `distance` corta (decaen mucho antes de llegar al mundo lejano) y `decay` físico. Tonos fríos para el relleno + un toque ámbar de cola. No se registran para animación (intensidad estable); el pulso de costura se hace por emisivo en la tarea de `update`.

- [ ] **Step 1: Añadir las luces propias**

In `shell/src/space/player-ship.ts`, immediately before the final `return {`, add:

```ts
  // ── Auto-iluminación: revela el casco SIN iluminar el entorno ──
  // distance corta + decay 2 => la luz cae a ~0 mucho antes de alcanzar el
  // mundo (planetas/sol/asteroides están a cientos/miles de unidades).
  const keyLight = new THREE.PointLight(0xbcd4ff, 6, 14, 2); // frío, cenital
  keyLight.position.set(0.6, 2.4, -1.2);
  ship.add(keyLight);
  const rimLight = new THREE.PointLight(0x7fb0ff, 4, 12, 2); // azul de contorno
  rimLight.position.set(-1.6, -1.4, 2.2);
  ship.add(rimLight);
  const tailGlow = new THREE.PointLight(0xff9a3a, 5, 8, 2); // ámbar de cola
  tailGlow.position.set(0, 0, 3.0);
  ship.add(tailGlow);
```

- [ ] **Step 2: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS.

- [ ] **Step 3: Manual verification**
  Run: `pnpm --filter @plataforma/shell dev`; abre http://localhost:5173; inicia sesión.
  Expected: el casco de la nave se ve nítido y con relieve gracias a una luz fría cenital y un contorno azulado; la cola tiene un halo ámbar tenue. Aleja la nave de cualquier planeta y comprueba que los planetas/asteroides NO se iluminan por la nave (la luz de la nave no proyecta sobre el mundo). Sin errores en consola.

- [ ] **Step 4: Commit**
  Run:
  ```
  git add shell/src/space/player-ship.ts
  git commit -m "feat(space): auto-iluminacion acotada de la nave (no tine el entorno)"
  ```

---

## Task 6: Animación reactiva `update(elapsed, state, delta)` (toberas, estrobos, bob, costura)

**Files:**
- Modify: `shell/src/space/player-ship.ts` (reemplazar el cuerpo provisional de `update` por la animación reactiva completa, usando `thrustGlow`).

Implementa el contrato de animación leyendo `state.speed`, `state.isNitro`, `state.isBraking`:
- **Toberas:** longitud (escala Z del cono) y brillo (emisivo del núcleo) escalan con `thrustGlow`; un parpadeo de alta frecuencia da vida; al frenar, las llamas se acortan visiblemente.
- **Estrobos de navegación:** las luces nav pulsan (rojo/cian) con desfase babor/estribor.
- **Costura ámbar emisiva:** pulso lento del acento `amber`.
- **Bob en reposo:** un leve cabeceo/levitación cuando `speed` es muy baja, que se desvanece al acelerar.
- **NUNCA aplica roll** (lo hace `ShipController`).

- [ ] **Step 1: Capturar la posición base de la nave para el bob**

In `shell/src/space/player-ship.ts`, immediately before the final `return {`, add:

```ts
  // Posición base del grupo para el bob en reposo (no toca rotación).
  const baseY = ship.position.y;
```

- [ ] **Step 2: Reemplazar el cuerpo de `update`**

In `shell/src/space/player-ship.ts`, replace the provisional `update` method:

```ts
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    update(_elapsed, _state, _delta) {
      // Las capas reactivas (toberas, estela, luces, bob) se añaden en tareas
      // posteriores. Nunca aplicar roll aquí.
    },
```

with:

```ts
    update(elapsed, state, _delta) {
      const t = thrustGlow(state.speed, state.isNitro);
      // Parpadeo de alta frecuencia (turbulencia de plasma).
      const flick = 0.85 + 0.12 * Math.sin(elapsed * 17) + 0.06 * Math.sin(elapsed * 41.3);
      // Al frenar, recorta las llamas a un mínimo.
      const brakeCut = state.isBraking ? 0.4 : 1;

      // Toberas: longitud (escala Z del cono) + brillo del núcleo.
      const lenScale = t.length * brakeCut * flick;
      for (const f of flames) {
        f.scale.z = lenScale;
        // Recoloca la base en la boquilla (z=2.24) al cambiar la longitud.
        f.position.z = 2.24 + (FLAME_BASE_LEN * lenScale) / 2;
        (f.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.55 * t.glow * brakeCut;
      }
      for (const c of cores) {
        (c.material as THREE.MeshStandardMaterial).emissiveIntensity = (1.5 + 2.5 * t.glow) * flick * brakeCut;
      }

      // Estrobos de navegación (rojo babor / cian estribor, desfasados).
      for (const n of navLights) {
        const s = 0.5 + 0.5 * Math.sin(elapsed * 4 + n.phase);
        n.mat.emissiveIntensity = 1.2 + 3.0 * s * s;
      }

      // Costura ámbar emisiva: pulso lento "respiración" de energía.
      amber.emissiveIntensity = 1.4 + 0.8 * (0.5 + 0.5 * Math.sin(elapsed * 1.6));

      // Bob en reposo: leve levitación que se desvanece al acelerar.
      const idle = 1 - Math.min(1, state.speed / 60);
      ship.position.y = baseY + idle * 0.06 * Math.sin(elapsed * 1.3);
    },
```

- [ ] **Step 3: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS.

- [ ] **Step 4: Run unit tests (asegura que el helper sigue verde)**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/thrust-visual.test.ts`
  Expected: PASS.

- [ ] **Step 5: Manual verification**
  Run: `pnpm --filter @plataforma/shell dev`; abre http://localhost:5173; inicia sesión.
  Expected: con la nave parada las llamas son cortas y la nave levita levemente; al mantener `W` las toberas se alargan y brillan claramente, y con `Space` (nitro) crecen aún más; al frenar (`S`/`Shift`) las llamas se acortan de golpe. Las luces de navegación (roja/cian) parpadean con ritmos desfasados y la costura ámbar "respira". La nave NO gira en roll por sí misma (el banking lo aporta el pivote de `ShipController`). Sin errores en consola.
  Nota: si `state` aún no varía porque el plan 01/orquestación no está integrado, verifica al menos el ralentí (llamas cortas + bob + estrobos + respiración ámbar); la reacción a la velocidad se confirma tras integrar la llamada `playerShip.update(elapsed, shipState, delta)` en `space-engine.ts`.

- [ ] **Step 6: Commit**
  Run:
  ```
  git add shell/src/space/player-ship.ts
  git commit -m "feat(space): animacion reactiva de la nave (toberas/estrobos/bob/costura)"
  ```

---

## Task 7: Estela de motor (quads aditivos estirados que crecen con la velocidad)

**Files:**
- Modify: `shell/src/space/player-ship.ts` (añadir una estela por tobera: un plano aditivo estirado en `+Z` cuya longitud y opacidad escalan con `thrustGlow.trailOpacity`/`length`; animarla en `update`).

La estela es un quad (plano) con textura de degradado radial-longitudinal, `AdditiveBlending`, `depthWrite:false`, anclado en cada tobera y orientado a lo largo de `+Z`. En reposo es invisible (`trailOpacity ≈ 0`); a alta velocidad se alarga y brilla. No es un sistema de partículas para respetar el presupuesto (spec §8): dos quads bastan y se integran con el bloom.

- [ ] **Step 1: Añadir la textura de estela (helper local)**

In `shell/src/space/player-ship.ts`, immediately after the `import { thrustGlow } from './thrust-visual';` line, add:

```ts

/** Textura de estela: degradado longitudinal (brillante en la base, se apaga). */
function trailTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255, 210, 140, 0.95)'); // base (boquilla)
  g.addColorStop(0.35, 'rgba(255, 150, 70, 0.5)');
  g.addColorStop(1, 'rgba(255, 110, 50, 0)'); // cola desvanecida
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 128);
  return new THREE.CanvasTexture(c);
}
```

- [ ] **Step 2: Añadir los registros de estela y construirla**

In `shell/src/space/player-ship.ts`, after the `flames` array declaration (`const flames: THREE.Mesh[] = [];`), add:

```ts
  const trails: THREE.Mesh[] = [];
  const TRAIL_BASE_LEN = 4.5; // longitud del quad de estela a empuje máximo.
```

Then, immediately before the `const baseY = ship.position.y;` line added in Task 6, add:

```ts
  // ── Estela aditiva: un quad por tobera, anclado en +Z ──
  const trailTex = track(trailTexture());
  const trailMat = track(
    new THREE.MeshBasicMaterial({
      map: trailTex,
      color: 0xffb46a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  for (const ex of [-0.3, 0.3] as const) {
    const geo = track(new THREE.PlaneGeometry(0.5, TRAIL_BASE_LEN));
    const trail = new THREE.Mesh(geo, trailMat);
    // El plano (alto en Y) se tumba para extenderse a lo largo de +Z; la base
    // (parte brillante de la textura, v=0) queda en la boquilla.
    trail.rotation.x = -Math.PI / 2;
    trail.position.set(ex, 0, 2.24 + TRAIL_BASE_LEN / 2);
    ship.add(trail);
    trails.push(trail);
  }
```

- [ ] **Step 3: Animar la estela dentro de `update`**

In `shell/src/space/player-ship.ts`, inside the `update` method, immediately after the `for (const c of cores) { ... }` loop (and before the nav-light strobe loop), add:

```ts
      // Estela: longitud (escala Y del plano, que apunta a +Z) + opacidad.
      const trailLen = t.length * brakeCut;
      for (const tr of trails) {
        tr.scale.y = trailLen;
        tr.position.z = 2.24 + (TRAIL_BASE_LEN * trailLen) / 2;
        (tr.material as THREE.MeshBasicMaterial).opacity = t.trailOpacity * brakeCut;
      }
```

- [ ] **Step 4: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS.

- [ ] **Step 5: Manual verification**
  Run: `pnpm --filter @plataforma/shell dev`; abre http://localhost:5173; inicia sesión.
  Expected: con la nave parada NO hay estela visible; al mantener `W` aparece y se alarga una estela ámbar aditiva detrás de cada tobera, más larga e intensa con nitro (`Space`), y se corta al frenar. La estela se integra con el resplandor (bloom) sin tapar la nave. Sin errores en consola.

- [ ] **Step 6: Commit**
  Run:
  ```
  git add shell/src/space/player-ship.ts
  git commit -m "feat(space): estela de motor aditiva reactiva a la velocidad"
  ```

---

## Task 8: Afinado del bloom en `space-engine.ts`

**Files:**
- Modify: `shell/src/space/space-engine.ts` (líneas 113-115, parámetros del `UnrealBloomPass`).

El nuevo casco frío + acentos ámbar emisivos necesitan un bloom algo más marcado y con umbral más bajo para que los emisivos de la nave (núcleos, llamas, costura, luces nav) destaquen, sin emborronar el conjunto del sistema. Spec §3 pide "bloom marcado" pero sobrio. Se sube `strength` y se baja `threshold`; `radius` se mantiene contenido.

- [ ] **Step 1: Ajustar los parámetros del bloom**

In `shell/src/space/space-engine.ts`, replace:

```ts
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.5, 0.15),
    );
```

with:

```ts
    // Bloom sobrio pero marcado: realza los emisivos de la nave (núcleos,
    // llamas, costura ámbar, luces nav) sin emborronar el sistema.
    // (strength, radius, threshold)
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.45, 0.08),
    );
```

- [ ] **Step 2: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS.

- [ ] **Step 3: Manual verification**
  Run: `pnpm --filter @plataforma/shell dev`; abre http://localhost:5173; inicia sesión.
  Expected: los núcleos de las toberas, las luces de navegación y la costura ámbar tienen un halo limpio y elegante; al acelerar la estela resplandece. El resto del sistema (sol, planetas, estrellas) NO queda lavado/sobreexpuesto. Si se ve demasiado fuerte, baja `strength` a 0.45; si demasiado tenue, súbelo a 0.65 — calibración iterativa (spec §8).

- [ ] **Step 4: Commit**
  Run:
  ```
  git add shell/src/space/space-engine.ts
  git commit -m "feat(space): afinar bloom para realzar los emisivos de la nave"
  ```

---

## Task 9: Verificación final del subsistema

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Suite completa de tests del shell**
  Run: `pnpm --filter @plataforma/shell test`
  Expected: PASS — incluido `thrust-visual.test.ts`. (Los archivos de escena Three.js no se testean unitariamente, por diseño.)

- [ ] **Step 2: Type-check + build**
  Run: `pnpm --filter @plataforma/shell lint` y luego `pnpm --filter @plataforma/shell build`
  Expected: PASS ambos, sin errores de tipo ni de empaquetado.

- [ ] **Step 3: Repaso visual integral**
  Run: `pnpm --filter @plataforma/shell dev`; abre http://localhost:5173; inicia sesión y vuela.
  Expected (checklist de aceptación de la sección 5.4 del spec):
  - Nave radicalmente futurista, elegante/agresiva, paleta fría + ámbar.
  - Auto-iluminada: destaca en la oscuridad y NO ilumina el entorno.
  - Toberas que se estiran/brillan con `state.speed`; warp extra con nitro.
  - Bob de reposo perceptible solo a baja velocidad.
  - Estrobos de navegación (rojo babor / cian estribor) desfasados.
  - Pulso de costura emisiva ámbar.
  - Estela aditiva que crece con la velocidad y se corta al frenar.
  - El roll/banking lo aporta el pivote de `ShipController` (la nave no gira por sí sola); `player-ship.update` no toca la rotación del objeto raíz.
  - Estética luminoso-elegante (Star Citizen / No Man's Sky sobrio), sin neón chillón.

- [ ] **Step 4: (sin commit)** Esta tarea no introduce cambios; si algún punto del checklist falla, vuelve a la tarea correspondiente, corrige y recommit en esa tarea.
