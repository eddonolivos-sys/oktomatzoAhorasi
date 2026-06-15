---
# Sistema solar y entrada por permanencia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Reemplazar las constelaciones + raycast central + ProjectOverlay por un sistema solar heliocéntrico donde cada app es un planeta en órbita inclinada, con frenado de aproximación y entrada por permanencia (dwell ~1s) que invoca el mismo contrato `onEnterApp(app)` existente.

**Architecture:** Toda la geometría orbital y la máquina de permanencia viven en lógica pura sin Three.js (`orbits.ts`, `dwell.ts`) testeada con Vitest en entorno node, siguiendo el patrón de `layout.ts`/`layout.test.ts`. La clase `SolarSystem` (con Three.js, verificada manualmente) construye N planetas reutilizando `createPlanet` de `planet.ts`, los orbita alrededor del sol Ramatzo, calcula aproximación/permanencia por frame y devuelve un `SolarUpdate`. `space-engine.ts` orquesta: aplica el frenado a la nave vía `ShipController.setApproachBrake` y llama `onEnterApp` cuando una entrada se confirma.

**Tech Stack:** TypeScript, Three.js 0.170, Lit 3, Vitest. Package @plataforma/shell.

**Depends on:** plan 01 (`ship-controller.ts` con `setApproachBrake(factor)`, `ShipState`; `flight-math.ts` con `approachBrakeFactor`; `chase-camera.ts`). Este plan asume que `space-engine.ts` ya instancia `ShipController`/`ChaseCamera` (no `FlightController`). Donde el wiring concreto difiera del estado de plan 01, adapta los nombres de campo respetando el contrato `ShipController` compartido.

---
---

## File structure

**Created**

- `shell/src/space/orbits.ts` — Lógica pura del layout orbital: `planetLayout(index, total)` (radio/inclinación/fase/velocidad deterministas y variados) y `orbitPosition(radius, inclination, phase, speed, t)` (posición 3D en el instante `t`).
- `shell/src/space/orbits.test.ts` — Tests Vitest de `orbits.ts`.
- `shell/src/space/dwell.ts` — Lógica pura de la permanencia: `DwellState` y `dwellStep(state, inside, dt, threshold)` (acumula tiempo dentro, emite `entered` una sola vez al cruzar el umbral, reinicia al salir).
- `shell/src/space/dwell.test.ts` — Tests Vitest de `dwell.ts`.
- `shell/src/space/solar-system.ts` — Clase `SolarSystem` (Three.js): construye un planeta por app orbitando el sol, calcula aproximación/frenado/permanencia y expone blips para el radar; `rebase`/`dispose`.

**Modified**

- `shell/src/space/space-engine.ts` — Reemplaza `ConstellationManager` por `SolarSystem`; cada frame aplica `setApproachBrake` a la nave y llama `onEnterApp` en `entered`; elimina `onCanvasClick` (pick de proyecto) y `ProjectOverlay`; `rebase` incluye `SolarSystem`.

**Deleted (al final, tras verificar)**

- `shell/src/space/constellations.ts`, `shell/src/space/constellation.ts`, `shell/src/space/project-overlay.ts` — sustituidos por `SolarSystem` + dwell. Se borran en la última tarea para no romper imports a mitad de camino.

---

## Task 1: `orbits.ts` — layout orbital puro (TDD)

**Files:**
- Test: `shell/src/space/orbits.test.ts` (create)
- Create: `shell/src/space/orbits.ts`

Contrato compartido (verbatim):
```ts
planetLayout(index: number, total: number): { radius: number; inclination: number; phase: number; speed: number };
orbitPosition(radius: number, inclination: number, phase: number, speed: number, t: number): { x: number; y: number; z: number };
```

- [ ] **Step 1: Write the failing test**

Create `shell/src/space/orbits.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { planetLayout, orbitPosition } from './orbits';

describe('planetLayout', () => {
  it('es determinista para el mismo índice/total', () => {
    expect(planetLayout(2, 6)).toEqual(planetLayout(2, 6));
  });

  it('reparte los radios entre ~600 y ~3000 u, crecientes por índice', () => {
    const total = 6;
    const a = planetLayout(0, total);
    const b = planetLayout(total - 1, total);
    expect(a.radius).toBeGreaterThanOrEqual(600);
    expect(b.radius).toBeLessThanOrEqual(3000);
    expect(b.radius).toBeGreaterThan(a.radius);
  });

  it('inclina las órbitas y varía la inclinación entre planetas (usa la 3a dimensión)', () => {
    const incs = Array.from({ length: 6 }, (_, i) => planetLayout(i, 6).inclination);
    // Al menos una inclinación claramente no nula.
    expect(incs.some((v) => Math.abs(v) > 0.05)).toBe(true);
    // No todas iguales: hay variación real entre planetas.
    expect(new Set(incs.map((v) => v.toFixed(4))).size).toBeGreaterThan(1);
    // Acotadas a un rango razonable (|inc| <= ~35°).
    expect(incs.every((v) => Math.abs(v) <= 0.62)).toBe(true);
  });

  it('da fases distintas y velocidades positivas y lentas', () => {
    const a = planetLayout(0, 6);
    const b = planetLayout(1, 6);
    expect(a.phase).not.toBe(b.phase);
    expect(a.speed).toBeGreaterThan(0);
    expect(a.speed).toBeLessThan(0.2);
  });
});

describe('orbitPosition', () => {
  it('en t=0 con fase 0 y sin inclinación queda sobre +X', () => {
    const p = orbitPosition(1000, 0, 0, 0.05, 0);
    expect(p.x).toBeCloseTo(1000, 6);
    expect(p.y).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });

  it('mantiene el radio horizontal constante a lo largo del tiempo', () => {
    const r = 1500;
    const at = (t: number) => orbitPosition(r, 0, 0.3, 0.04, t);
    const p0 = at(0);
    const p1 = at(12.5);
    const horiz = (p: { x: number; z: number }) => Math.hypot(p.x, p.z);
    expect(horiz(p1)).toBeCloseTo(horiz(p0), 4);
  });

  it('con inclinación no nula introduce componente Y al avanzar', () => {
    const p = orbitPosition(1000, 0.5, 0, 0.05, 5);
    expect(Math.abs(p.y)).toBeGreaterThan(0.0001);
  });

  it('avanza con el tiempo según la velocidad (la posición cambia)', () => {
    const a = orbitPosition(1000, 0.2, 0, 0.05, 0);
    const b = orbitPosition(1000, 0.2, 0, 0.05, 3);
    expect(a.x === b.x && a.z === b.z).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/orbits.test.ts`
  Expected: FAIL — `Failed to resolve import './orbits'` / `planetLayout is not a function` (el módulo aún no existe).

- [ ] **Step 3: Write minimal implementation**

Create `shell/src/space/orbits.ts`:
```ts
/**
 * Lógica pura del layout orbital del sistema solar (sin Three.js, testeable).
 * Cada app del registry ocupa una órbita heliocéntrica inclinada y de escala
 * compacta. `planetLayout` es determinista; `orbitPosition` evalúa la posición
 * 3D en un instante `t` (segundos transcurridos).
 */

const MIN_RADIUS = 600;
const MAX_RADIUS = 3000;
const GOLDEN = 2.399963267; // ángulo áureo (rad), para fases sin alineación

/** Parámetros orbitales deterministas del planeta `index` de `total`. */
export function planetLayout(
  index: number,
  total: number,
): { radius: number; inclination: number; phase: number; speed: number } {
  const n = Math.max(1, total);
  // Radio creciente, repartido linealmente en [MIN, MAX]; con un solo planeta,
  // se coloca a un radio medio cómodo.
  const f = n === 1 ? 0.5 : index / (n - 1);
  const radius = MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * f;
  // Inclinación alternada y variada (|inc| <= ~32°) → uso real de las 3 dimensiones.
  const inclination = Math.sin(index * 1.7 + 0.5) * 0.56 * (index % 2 === 0 ? 1 : -1);
  // Fase por ángulo áureo, normalizada a [0, 2π).
  const phase = (index * GOLDEN) % (Math.PI * 2);
  // Velocidad angular lenta y decreciente con el radio (interiores más rápidos).
  const speed = 0.05 - 0.03 * f;
  return { radius, inclination, phase, speed };
}

/**
 * Posición 3D del planeta en el instante `t`: círculo en el plano XZ de radio
 * `radius`, rotado por `inclination` alrededor del eje X (introduce Y), avanzando
 * con `phase + speed * t`.
 */
export function orbitPosition(
  radius: number,
  inclination: number,
  phase: number,
  speed: number,
  t: number,
): { x: number; y: number; z: number } {
  const a = phase + speed * t;
  const x = Math.cos(a) * radius;
  const zFlat = Math.sin(a) * radius;
  const cosI = Math.cos(inclination);
  const sinI = Math.sin(inclination);
  // Rotación alrededor de X: el plano de la órbita se inclina, generando Y.
  return { x, y: zFlat * sinI, z: zFlat * cosI };
}
```

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/orbits.test.ts`
  Expected: PASS — los 8 tests en verde.

- [ ] **Step 5: Commit**
```
git add shell/src/space/orbits.ts shell/src/space/orbits.test.ts
git commit -m "feat(space): orbits.ts (layout orbital puro heliocentrico) con tests"
```

---

## Task 2: `dwell.ts` — máquina de permanencia pura (TDD)

**Files:**
- Test: `shell/src/space/dwell.test.ts` (create)
- Create: `shell/src/space/dwell.ts`

Contrato compartido (verbatim):
```ts
interface DwellState { inside: boolean; elapsed: number };
dwellStep(state: DwellState, inside: boolean, dt: number, threshold: number): { state: DwellState; progress: number; entered: boolean };
```

- [ ] **Step 1: Write the failing test**

Create `shell/src/space/dwell.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { dwellStep, type DwellState } from './dwell';

const fresh = (): DwellState => ({ inside: false, elapsed: 0 });

describe('dwellStep', () => {
  it('acumula tiempo mientras se está dentro', () => {
    let s = fresh();
    let r = dwellStep(s, true, 0.3, 1);
    expect(r.state.inside).toBe(true);
    expect(r.state.elapsed).toBeCloseTo(0.3, 6);
    expect(r.entered).toBe(false);

    r = dwellStep(r.state, true, 0.3, 1);
    expect(r.state.elapsed).toBeCloseTo(0.6, 6);
    expect(r.entered).toBe(false);
  });

  it('progress es elapsed/threshold acotado a [0,1]', () => {
    let r = dwellStep(fresh(), true, 0.5, 1);
    expect(r.progress).toBeCloseTo(0.5, 6);
    r = dwellStep(r.state, true, 0.9, 1); // 1.4s sobre umbral 1 → progress clamp 1
    expect(r.progress).toBe(1);
  });

  it('emite entered una sola vez al cruzar el umbral', () => {
    let r = dwellStep(fresh(), true, 0.6, 1);
    expect(r.entered).toBe(false);
    r = dwellStep(r.state, true, 0.6, 1); // 1.2s → cruza umbral
    expect(r.entered).toBe(true);
    // Siguiendo dentro: NO vuelve a emitir entered (latch hasta salir).
    r = dwellStep(r.state, true, 0.6, 1);
    expect(r.entered).toBe(false);
  });

  it('reinicia el timer al salir de la esfera', () => {
    let r = dwellStep(fresh(), true, 0.7, 1);
    expect(r.state.elapsed).toBeCloseTo(0.7, 6);
    r = dwellStep(r.state, false, 0.5, 1); // sale
    expect(r.state.inside).toBe(false);
    expect(r.state.elapsed).toBe(0);
    expect(r.progress).toBe(0);
    expect(r.entered).toBe(false);
  });

  it('cancela una entrada en curso si sale antes del umbral', () => {
    let r = dwellStep(fresh(), true, 0.9, 1);
    r = dwellStep(r.state, false, 0.1, 1); // sale a 0.9s → cancela
    expect(r.entered).toBe(false);
    expect(r.state.elapsed).toBe(0);
    // Vuelve a entrar: empieza de cero, debe re-armar y poder entrar de nuevo.
    r = dwellStep(r.state, true, 0.6, 1);
    r = dwellStep(r.state, true, 0.6, 1);
    expect(r.entered).toBe(true);
  });

  it('no entra si nunca se acumula tiempo dentro', () => {
    const r = dwellStep(fresh(), false, 0.3, 1);
    expect(r.entered).toBe(false);
    expect(r.progress).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/dwell.test.ts`
  Expected: FAIL — `Failed to resolve import './dwell'` / `dwellStep is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `shell/src/space/dwell.ts`:
```ts
/**
 * Máquina de estados de permanencia (dwell), lógica pura sin Three.js.
 * Acumula tiempo mientras la nave está dentro de la esfera de influencia de un
 * planeta; al cruzar `threshold` emite `entered` una sola vez (latch) y, al
 * salir, reinicia el contador para poder volver a entrar.
 *
 * `state` es inmutable de entrada: cada paso devuelve un nuevo `state`.
 */
export interface DwellState {
  inside: boolean;
  elapsed: number;
}

/** Marca interna: ya se emitió `entered` en este periodo dentro de la esfera. */
interface InternalDwellState extends DwellState {
  fired?: boolean;
}

export function dwellStep(
  state: DwellState,
  inside: boolean,
  dt: number,
  threshold: number,
): { state: DwellState; progress: number; entered: boolean } {
  const prev = state as InternalDwellState;

  if (!inside) {
    // Fuera de la esfera: reinicia el periodo.
    return { state: { inside: false, elapsed: 0 }, progress: 0, entered: false };
  }

  const elapsed = prev.elapsed + Math.max(0, dt);
  const reached = elapsed >= threshold;
  const entered = reached && !prev.fired;
  const next: InternalDwellState = { inside: true, elapsed, fired: prev.fired || reached };
  const progress = threshold > 0 ? Math.min(1, elapsed / threshold) : 1;
  return { state: next, progress, entered };
}
```

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/dwell.test.ts`
  Expected: PASS — los 6 tests en verde.

- [ ] **Step 5: Commit**
```
git add shell/src/space/dwell.ts shell/src/space/dwell.test.ts
git commit -m "feat(space): dwell.ts (maquina de permanencia pura) con tests"
```

---

## Task 3: `solar-system.ts` — clase del sistema solar (visual/integración)

**Files:**
- Create: `shell/src/space/solar-system.ts`

Contrato compartido (verbatim):
```ts
class SolarSystem {
  constructor(scene: THREE.Scene, apps: AppInfo[], renderer: THREE.WebGLRenderer);
  update(elapsed: number, delta: number, shipPos: THREE.Vector3): SolarUpdate;
  getRadarBlips(): RadarBlip[];
  rebase(delta: THREE.Vector3): void; dispose(): void;
}
interface RadarBlip { name: string; position: THREE.Vector3; app: AppInfo; }
interface ApproachInfo { app: AppInfo; distance: number; influenceRadius: number; }
interface SolarUpdate { approaching: ApproachInfo | null; dwellProgress: number; entered: AppInfo | null; }
```

Notas de diseño:
- Reutiliza `createPlanet(radius, seed, baseColor)` de `planet.ts` (su firma actual; `baseColor` es ignorado dentro pero se pasa por compatibilidad). `seed` se deriva del `id` de la app para variar continentes de forma estable.
- Radio de planeta ~120–260 u (escala compacta del spec); `influenceRadius = planetRadius * 2.5`.
- El sol Ramatzo lo construye/posee `space-engine.ts`; aquí asumimos el sol en el origen (0,0,0) en espacio de escena post-rebase, así que las posiciones orbitales son relativas al origen y se desplazan en `rebase`.
- Frenado de aproximación: calcula el factor con `approachBrakeFactor(distance, influenceRadius, minFactor)` de `flight-math.ts` (plan 01) para el planeta más cercano dentro de su esfera; `space-engine.ts` lo aplica con `ship.setApproachBrake(factor)`.
- Permanencia: una sola máquina `DwellState` para el planeta actualmente "dentro" (el más cercano con `distance <= influenceRadius`). Si cambia de planeta o sale, se reinicia.

- [ ] **Step 1: Write the complete file**

Create `shell/src/space/solar-system.ts`:
```ts
import * as THREE from 'three';
import type { AppInfo } from '../services/protocol';
import { createPlanet } from './planet';
import { colorForCategory } from './layout';
import { planetLayout, orbitPosition } from './orbits';
import { dwellStep, type DwellState } from './dwell';
import { approachBrakeFactor } from './flight-math';

export interface RadarBlip {
  name: string;
  position: THREE.Vector3;
  app: AppInfo;
}

export interface ApproachInfo {
  app: AppInfo;
  distance: number;
  influenceRadius: number;
}

export interface SolarUpdate {
  approaching: ApproachInfo | null;
  dwellProgress: number;
  entered: AppInfo | null;
}

interface SolarPlanet {
  app: AppInfo;
  mesh: THREE.Mesh;
  /** Tamaño físico del planeta (radio de la esfera). */
  planetRadius: number;
  /** Radio de la esfera de influencia (gatillo de aproximación/dwell). */
  influenceRadius: number;
  radius: number;
  inclination: number;
  phase: number;
  speed: number;
  /** Material shader del planeta (para animar uTime). */
  mat: THREE.ShaderMaterial;
}

const PLANET_MIN = 120;
const PLANET_MAX = 260;
const INFLUENCE_FACTOR = 2.5;
const DWELL_THRESHOLD = 1.0; // segundos dentro de la esfera para entrar
const BRAKE_MIN_FACTOR = 0.25; // damping fuerte en el núcleo de la esfera

function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h || 1;
}

/**
 * Sistema solar heliocéntrico: un planeta por app del registry orbitando el sol
 * Ramatzo (origen de escena). Calcula aproximación + frenado + permanencia por
 * frame y expone blips 3D para el radar. Reemplaza ConstellationManager, el
 * raycast a la reticula y el ProjectOverlay por mecánica de proximidad.
 */
export class SolarSystem {
  private planets: SolarPlanet[] = [];
  /** Estado de permanencia del planeta actualmente "dentro", o null. */
  private dwell: DwellState = { inside: false, elapsed: 0 };
  /** App sobre la que se acumula la permanencia (para reiniciar al cambiar). */
  private dwellApp: AppInfo | null = null;

  constructor(
    private scene: THREE.Scene,
    apps: AppInfo[],
    _renderer: THREE.WebGLRenderer,
  ) {
    const total = apps.length;
    apps.forEach((app, i) => {
      const layout = planetLayout(i, total);
      // Tamaño compacto, determinista por índice (interiores algo menores).
      const planetRadius = PLANET_MIN + ((PLANET_MAX - PLANET_MIN) * (i % 4)) / 3;
      const seed = seedFromId(app.id);
      const mesh = createPlanet(planetRadius, seed, colorForCategory(app.category));
      this.scene.add(mesh);
      this.planets.push({
        app,
        mesh,
        planetRadius,
        influenceRadius: planetRadius * INFLUENCE_FACTOR,
        radius: layout.radius,
        inclination: layout.inclination,
        phase: layout.phase,
        speed: layout.speed,
        mat: mesh.material as THREE.ShaderMaterial,
      });
    });
  }

  update(elapsed: number, delta: number, shipPos: THREE.Vector3): SolarUpdate {
    // 1) Avanza órbitas y rotación; encuentra el planeta más cercano dentro de su esfera.
    let nearest: SolarPlanet | null = null;
    let nearestDist = Infinity;

    for (const p of this.planets) {
      const pos = orbitPosition(p.radius, p.inclination, p.phase, p.speed, elapsed);
      p.mesh.position.set(pos.x, pos.y, pos.z);
      p.mesh.rotation.y += 0.05 * delta;
      const t = p.mat.uniforms['uTime'];
      if (t) t.value = elapsed;

      const dist = p.mesh.position.distanceTo(shipPos);
      if (dist <= p.influenceRadius && dist < nearestDist) {
        nearest = p;
        nearestDist = dist;
      }
    }

    // 2) Aproximación + frenado.
    const approaching: ApproachInfo | null = nearest
      ? { app: nearest.app, distance: nearestDist, influenceRadius: nearest.influenceRadius }
      : null;

    // 3) Permanencia: si cambió el planeta objetivo, reinicia el contador.
    const inside = nearest !== null;
    if (nearest && nearest.app !== this.dwellApp) {
      this.dwell = { inside: false, elapsed: 0 };
      this.dwellApp = nearest.app;
    }
    if (!inside) this.dwellApp = null;

    const step = dwellStep(this.dwell, inside, delta, DWELL_THRESHOLD);
    this.dwell = step.state;

    return {
      approaching,
      dwellProgress: step.progress,
      entered: step.entered ? (nearest as SolarPlanet).app : null,
    };
  }

  /**
   * Factor de frenado [BRAKE_MIN_FACTOR..1] para `ship.setApproachBrake`.
   * 1 si no hay aproximación; <1 proporcional a la cercanía al núcleo.
   */
  brakeFactor(approaching: ApproachInfo | null): number {
    if (!approaching) return 1;
    return approachBrakeFactor(approaching.distance, approaching.influenceRadius, BRAKE_MIN_FACTOR);
  }

  getRadarBlips(): RadarBlip[] {
    return this.planets.map((p) => ({
      name: p.app.name,
      position: p.mesh.position.clone(), // posición completa, incluida Y
      app: p.app,
    }));
  }

  rebase(delta: THREE.Vector3): void {
    for (const p of this.planets) p.mesh.position.sub(delta);
  }

  dispose(): void {
    for (const p of this.planets) {
      this.scene.remove(p.mesh);
      p.mesh.geometry?.dispose?.();
      const mat = p.mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
      else mat?.dispose?.();
    }
    this.planets = [];
    this.dwell = { inside: false, elapsed: 0 };
    this.dwellApp = null;
  }
}
```

- [ ] **Step 2: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS — sin errores de tipos. (Si `approachBrakeFactor`/`flight-math.ts` aún no existen por orden de planes, primero completa plan 01.)

- [ ] **Step 3: Commit**
```
git add shell/src/space/solar-system.ts
git commit -m "feat(space): solar-system.ts (planetas heliocentricos + frenado + permanencia)"
```

---

## Task 4: Wire en `space-engine.ts` — reemplazar constelaciones por sistema solar

**Files:**
- Modify: `shell/src/space/space-engine.ts`
  - Imports (lines ~11, ~15): cambiar `ConstellationManager`/`ProjectOverlay`.
  - Campos (lines ~60, ~64): cambiar `constellations`/`overlay`.
  - `mount` (lines ~133, ~145–153): instanciar `SolarSystem`, eliminar `ProjectOverlay` + `onCanvasClick`.
  - `loop` (lines ~176, ~199–200): aplicar frenado + `onEnterApp`, gate del menú, `radar.draw`.
  - `onCanvasClick` (lines ~235–250): eliminar el pick de proyecto (mantener solo solicitar control si procede).
  - `maybeRebase` (line ~347): `solarSystem.rebase`.
  - `dispose` (lines ~381–384): `solarSystem.dispose`, quitar `overlay`.
  - `updateLabels` (lines ~307–322): retirar la etiqueta de constelación apuntada (sin raycast).

> Nota de dependencia: el wiring de abajo usa los nombres del contrato `ShipController` (`this.ship`) y `ChaseCamera` (`this.chaseCamera`) introducidos por plan 01. Si en tu árbol siguen como `this.flight`/`FlightController`, sustituye los nombres conservando la semántica (el cambio sustantivo de ESTA tarea es: solar system + brake + dwell-enter, no el modelo de vuelo).

- [ ] **Step 1: Reemplazar imports**

En `shell/src/space/space-engine.ts`, cambia la línea:
```ts
import { ConstellationManager } from './constellations';
```
por:
```ts
import { SolarSystem } from './solar-system';
```
y elimina la línea:
```ts
import { ProjectOverlay } from './project-overlay';
```

- [ ] **Step 2: Reemplazar campos de clase**

Cambia:
```ts
  private constellations!: ConstellationManager;
```
por:
```ts
  private solarSystem!: SolarSystem;
```
y elimina el campo:
```ts
  private overlay!: ProjectOverlay;
```

- [ ] **Step 3: Instanciar SolarSystem en `mount`**

Cambia:
```ts
    this.constellations = new ConstellationManager(this.scene, opts.apps, this.renderer);
```
por:
```ts
    this.solarSystem = new SolarSystem(this.scene, opts.apps, this.renderer);
```

- [ ] **Step 4: Eliminar ProjectOverlay y el listener de clic en `mount`**

Elimina el bloque completo:
```ts
    // Selección de proyecto (reticula + click)
    this.overlay = new ProjectOverlay(host, {
      onEnter: (app) => {
        this.overlay.hide();
        this.opts.onEnterApp(app);
      },
      onCancel: () => {},
    });
    this.canvas.addEventListener('click', this.onCanvasClick);
```
y déjalo como:
```ts
    // La entrada a proyectos es por permanencia (dwell) dentro de la esfera de
    // influencia del planeta; no hay pick por clic ni overlay de proyecto.
    this.canvas.addEventListener('click', this.onCanvasClick);
```
(El `onCanvasClick` se conserva pero se reduce en el Step 8 para que solo solicite control de la nave.)

- [ ] **Step 5: Actualizar el gate de pausa en `loop`**

Cambia:
```ts
    this.flight.setEnabled(!this.overlay.visible && !this.escMenu.classList.contains('visible'));
```
por:
```ts
    this.flight.setEnabled(!this.escMenu.classList.contains('visible'));
```
(Ya no existe overlay de proyecto; el único gate es el menú de pausa.)

- [ ] **Step 6: Sustituir el update de constelaciones por el del sistema solar (frenado + dwell-enter)**

Cambia el bloque:
```ts
    this.constellations.update(this.elapsed, delta);
    this.radar.draw(this.camera.position, flight.yaw, this.constellations.getRadarBlips(), this.ramatzoSun.position);
```
por:
```ts
    // Sistema solar: órbitas + aproximación + permanencia. La posición de la nave
    // en espacio de escena es la de la cámara (la nave sigue a la cámara hasta que
    // plan 01 invierta la relación; entonces usar this.ship.object.position).
    const solar = this.solarSystem.update(this.elapsed, delta, this.camera.position);
    // Frenado de aproximación aplicado a la nave (1 = normal, <1 cerca del núcleo).
    this.flight.setApproachBrake(this.solarSystem.brakeFactor(solar.approaching));
    // Entrada confirmada por permanencia: mismo contrato existente, app sin cambios.
    if (solar.entered) this.opts.onEnterApp(solar.entered);
    this.radar.draw(
      this.camera.position,
      flight.yaw,
      flight.pitch,
      this.solarSystem.getRadarBlips(),
      null,
      this.ramatzoSun.position,
    );
```

> Si en tu árbol `FlightController` aún no expone `setApproachBrake`/no devuelve `pitch`, y el contrato `radar.draw` con `pitch`+`lockedApp` aún no existe (plan 03/01), deja temporalmente la llamada de radar como estaba (`this.radar.draw(this.camera.position, flight.yaw, this.solarSystem.getRadarBlips(), this.ramatzoSun.position)`) y conserva `this.flight.setApproachBrake(...)` solo si el método existe. El cambio NO-negociable de esta tarea es: `const solar = this.solarSystem.update(...)` + `if (solar.entered) this.opts.onEnterApp(solar.entered)`.

- [ ] **Step 7: Pasar `dwellProgress`/aproximación al HUD (si el HUD lo acepta)**

Si el `Hud.update` de plan 03 ya acepta `{ altitude, heading, approaching, dwellProgress }`, sustituye la llamada actual al HUD por una que pase `solar`. Si el HUD aún es el antiguo (firma `update(flight, x, z, maxSpeed)`), NO lo cambies aquí: déjalo como está y plan 03 lo conecta. Esta tarea solo garantiza que `solar` está disponible en el frame.

- [ ] **Step 8: Reducir `onCanvasClick` (sin pick de proyecto)**

Reemplaza el método completo:
```ts
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
  // Clic en el canvas: solicita el control de la nave (pointer lock). La entrada
  // a proyectos ya no es por clic, sino por permanencia dentro de la esfera.
  private onCanvasClick = () => {
    if (this.escMenu.classList.contains('visible')) return;
    if (!this.flight.isPointerLocked) this.canvas.requestPointerLock();
  };
```

> Si plan 01 ya migró a `ShipController`, este método pasa a `this.ship.requestControl()` guardado por `this.pauseMenu.visible`. Mantén la intención: clic = pedir control, nunca abrir overlay de proyecto.

- [ ] **Step 9: Actualizar `maybeRebase`**

Cambia:
```ts
    this.constellations.rebase(delta);
```
por:
```ts
    this.solarSystem.rebase(delta);
```

- [ ] **Step 10: Retirar la etiqueta de constelación apuntada en `updateLabels`**

En `updateLabels`, elimina el bloque del raycast de constelación:
```ts
    // Apuntado desde la reticula central (la vista se controla con el ratón bloqueado).
    const aimed = this.constellations.pickAimed(this.camera, this.centerNDC);
    if (aimed) {
      const p = this.project(aimed.center);
      if (p.visible) {
        this.aimLabel.textContent = aimed.app.name;
        this.aimLabel.style.left = `${p.x}px`;
        this.aimLabel.style.top = `${p.y}px`;
        this.aimLabel.classList.add('visible');
      } else {
        this.aimLabel.classList.remove('visible');
      }
    } else {
      this.aimLabel.classList.remove('visible');
    }

```
dejando `updateLabels` con solo la etiqueta del sol Ramatzo (el bloque `const rp = this.project(this.ramatzoSun.position); ...` se conserva intacto). El campo `this.aimLabel` y su creación en `buildLabels` pueden permanecer sin uso por ahora; plan 03 reasigna o retira `aimLabel`.

- [ ] **Step 11: Actualizar `dispose`**

Cambia:
```ts
    this.constellations?.dispose();
    this.radar?.dispose();
    this.overlay?.dispose();
```
por:
```ts
    this.solarSystem?.dispose();
    this.radar?.dispose();
```

- [ ] **Step 12: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS — sin errores. (Resuelve cualquier referencia residual a `this.constellations`/`this.overlay`/`ConstellationManager`/`ProjectOverlay`; no deben quedar.)

- [ ] **Step 13: Verificación manual**
  Run: `pnpm --filter @plataforma/shell dev`; abre `http://localhost:5173`; inicia sesión.
  Expected:
  - Se ven varios planetas orbitando lentamente alrededor del sol Ramatzo central, en planos ligeramente inclinados (no todos en el mismo plano).
  - Al volar hacia un planeta y cruzar su esfera de influencia, la nave **frena** notablemente (frenado de aproximación) en lugar de pasarlo de largo a toda velocidad.
  - Permaneciendo ~1s dentro de la esfera, se dispara la entrada y se carga **el proyecto existente sin cambios** en la cabina (iframe `shell-app-container`), exactamente como antes (mismo contrato `onEnterApp`).
  - Salir antes de 1s **no** entra (la permanencia se cancela y reinicia).
  - Ya no aparece el overlay "Cancelar / Ingresar" ni se entra por clic en el centro.

- [ ] **Step 14: Commit**
```
git add shell/src/space/space-engine.ts
git commit -m "refactor(space): space-engine usa SolarSystem (frenado + entrada por permanencia)"
```

---

## Task 5: Eliminar módulos obsoletos

**Files:**
- Delete: `shell/src/space/constellations.ts`
- Delete: `shell/src/space/constellation.ts`
- Delete: `shell/src/space/project-overlay.ts`

> Solo tras confirmar en Task 4 (Step 12 lint + Step 13 manual) que nada los importa.

- [ ] **Step 1: Confirmar que no hay imports residuales**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS antes de borrar (línea base limpia).
  Verifica además con búsqueda que no se importan: busca `from './constellations'`, `from './constellation'`, `from './project-overlay'` en `shell/src/**`. Expected: 0 coincidencias (las únicas referencias estaban en `space-engine.ts`, ya eliminadas).

- [ ] **Step 2: Borrar los archivos**
```
git rm shell/src/space/constellations.ts shell/src/space/constellation.ts shell/src/space/project-overlay.ts
```

- [ ] **Step 3: Type-check tras el borrado**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS — sin imports rotos.

- [ ] **Step 4: Suite completa de tests**
  Run: `pnpm --filter @plataforma/shell test`
  Expected: PASS — incluye `orbits.test.ts` y `dwell.test.ts` en verde; el resto de tests sin regresiones.

- [ ] **Step 5: Build de comprobación**
  Run: `pnpm --filter @plataforma/shell build`
  Expected: SUCCESS — compila sin referencias a los módulos eliminados.

- [ ] **Step 6: Commit**
```
git add -A
git commit -m "refactor(space): eliminar constellations/constellation/project-overlay (sustituidos por SolarSystem)"
```

---

## Verification checklist (subsistema completo)

- [ ] `pnpm --filter @plataforma/shell exec vitest run shell/src/space/orbits.test.ts` → PASS
- [ ] `pnpm --filter @plataforma/shell exec vitest run shell/src/space/dwell.test.ts` → PASS
- [ ] `pnpm --filter @plataforma/shell test` → PASS (sin regresiones)
- [ ] `pnpm --filter @plataforma/shell lint` → PASS
- [ ] `pnpm --filter @plataforma/shell build` → SUCCESS
- [ ] Manual (`dev`): planetas orbitan el sol en planos inclinados; cruzar una esfera frena la nave; ~1s dentro → carga el proyecto **existente sin modificar** en la cabina; salir antes cancela; sin overlay ni pick por clic.
