# Hito 5 — Pista de carreras espacial (single-player) — Plan de implementación

> **Para agentes constructores:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development`. **ANULACIÓN de la plantilla de commits del skill:** UN SOLO COMMIT para todo el hito (Tarea 5, al final) — nada de commits por tarea.

**Goal:** implementar la pista de carreras espacial descrita en `docs/superpowers/specs/2026-07-05-pista-de-carreras-espacial-design.md` — circuito procedural, checkpoints con respawn, colisión con asteroides sin tunneling, minimapa en HUD, puerta de rendimiento.

**Arquitectura:** módulos puros TDD (`race-track.ts`, `race-math.ts` — reutiliza `vec3-math.ts` del Hito 1 —, `race-state.ts`, mismo patrón que `orbit.ts`), cableado Three.js separado (`race-render.ts`, `race-hud.ts` — reutiliza `bearingToDisc` de `radar-projection.ts`), e integración puntual en `space-engine.ts`/`ship-controller.ts`/`space-config.ts`/`space.css`.

**Tech Stack:** TypeScript, Vitest, Three.js (solo en el cableado).

---

## Task 1: `race-track.ts` (lógica pura, TDD)

**Files:** Create `shell/src/space/race-track.ts`, Test `shell/src/space/race-track.test.ts`.

- [ ] **Step 1: Escribe el test**
```ts
import { describe, it, expect } from 'vitest';
import { generateTrack } from './race-track';

const PARAMS = { checkpointCount: 10, baseRadius: 2200, radiusJitter: 0.4, heightJitter: 600 };

describe('generateTrack (Hito 5 — circuito determinista por semilla)', () => {
  it('la misma semilla produce siempre el mismo circuito', () => {
    expect(generateTrack(42, PARAMS)).toEqual(generateTrack(42, PARAMS));
  });

  it('semillas distintas producen circuitos distintos', () => {
    expect(generateTrack(1, PARAMS)).not.toEqual(generateTrack(2, PARAMS));
  });

  it('genera exactamente checkpointCount waypoints', () => {
    expect(generateTrack(7, PARAMS).waypoints).toHaveLength(10);
  });

  it('todos los waypoints quedan dentro de baseRadius*(1+radiusJitter) en XZ', () => {
    const track = generateTrack(7, PARAMS);
    const maxRadius = PARAMS.baseRadius * (1 + PARAMS.radiusJitter);
    for (const wp of track.waypoints) {
      expect(Math.hypot(wp.x, wp.z)).toBeLessThanOrEqual(maxRadius + 1e-6);
    }
  });

  it('todas las alturas quedan dentro de ±heightJitter/2', () => {
    const track = generateTrack(7, PARAMS);
    for (const wp of track.waypoints) {
      expect(Math.abs(wp.y)).toBeLessThanOrEqual(PARAMS.heightJitter / 2 + 1e-6);
    }
  });

  it('con checkpointCount=1 no revienta (caso degenerado)', () => {
    expect(generateTrack(1, { ...PARAMS, checkpointCount: 1 }).waypoints).toHaveLength(1);
  });
});
```

- [ ] **Step 2:** Run `pnpm --filter @plataforma/shell exec vitest run src/space/race-track.test.ts` (o `npx vitest run src/space/race-track.test.ts` desde `shell/` si falla `pnpm exec`). Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementa**
```ts
/**
 * Generación determinista del circuito de la pista de carreras (Hito 5).
 * Sin Three.js. PRNG sembrado (mulberry32): misma semilla → mismo circuito.
 */
import type { V3 } from './vec3-math';

export type { V3 };

export interface TrackParams {
  checkpointCount: number;
  baseRadius: number;
  /** Fracción de baseRadius que puede variar el radio de cada checkpoint (0..1). */
  radiusJitter: number;
  /** Variación máxima de altura por checkpoint (unidades, ± la mitad). */
  heightJitter: number;
}

export interface RaceTrack {
  /** Waypoints LOCALES al centro de la zona (el motor suma RACE_CONFIG.center). */
  waypoints: V3[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Circuito cerrado: `checkpointCount` waypoints repartidos en ángulo uniforme
 * alrededor del origen local, con radio y altura perturbados de forma
 * determinista por la semilla. El circuito se cierra implícitamente de
 * waypoints[n-1] a waypoints[0] (lo consume race-math.ts).
 */
export function generateTrack(seed: number, params: TrackParams): RaceTrack {
  const rand = mulberry32(seed);
  const waypoints: V3[] = [];
  for (let i = 0; i < params.checkpointCount; i++) {
    const angle = (i / params.checkpointCount) * Math.PI * 2;
    const radius = params.baseRadius * (1 + (rand() - 0.5) * params.radiusJitter);
    const height = (rand() - 0.5) * params.heightJitter;
    waypoints.push({
      x: Math.cos(angle) * radius,
      y: height,
      z: Math.sin(angle) * radius,
    });
  }
  return { waypoints };
}
```

- [ ] **Step 4:** Run el mismo comando. Expected: PASS (6 tests).

---

## Task 2: `race-math.ts` (lógica pura, TDD, reutiliza `vec3-math.ts`)

**Files:** Create `shell/src/space/race-math.ts`, Test `shell/src/space/race-math.test.ts`.
**Contexto:** `shell/src/space/vec3-math.ts` (Hito 1) ya exporta `type V3`, `sub`, `add`, `scale`, `dot`, `length`, `normalize` — reutilízalos, no los reimplementes.

- [ ] **Step 1: Escribe el test**
```ts
import { describe, it, expect } from 'vitest';
import { distanceToSegment, nearestSegmentDistance, sweptSphereHitsSphere } from './race-math';

describe('distanceToSegment', () => {
  it('punto perpendicular al segmento', () => {
    expect(distanceToSegment({ x: 5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })).toBeCloseTo(0, 10);
    expect(distanceToSegment({ x: 5, y: 3, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })).toBeCloseTo(3, 10);
  });

  it('proyección acotada: punto más allá del extremo B usa la distancia a B', () => {
    expect(distanceToSegment({ x: 15, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })).toBeCloseTo(5, 10);
  });

  it('proyección acotada: punto antes del extremo A usa la distancia a A', () => {
    expect(distanceToSegment({ x: -5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })).toBeCloseTo(5, 10);
  });

  it('segmento degenerado (a===b) no revienta', () => {
    expect(distanceToSegment({ x: 3, y: 4, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBeCloseTo(5, 10);
  });
});

describe('nearestSegmentDistance', () => {
  const square = [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
    { x: 10, y: 0, z: 10 },
    { x: 0, y: 0, z: 10 },
  ];

  it('encuentra el segmento más cercano de un circuito cerrado', () => {
    expect(nearestSegmentDistance({ x: 5, y: 0, z: -1 }, square)).toBeCloseTo(1, 10);
  });

  it('incluye la vuelta de cierre (último → primero)', () => {
    expect(nearestSegmentDistance({ x: 5, y: 0, z: 11 }, square)).toBeCloseTo(1, 10);
  });

  it('circuito de un solo punto: distancia directa', () => {
    expect(nearestSegmentDistance({ x: 3, y: 4, z: 0 }, [{ x: 0, y: 0, z: 0 }])).toBeCloseTo(5, 10);
  });

  it('circuito vacío: Infinity', () => {
    expect(nearestSegmentDistance({ x: 0, y: 0, z: 0 }, [])).toBe(Infinity);
  });
});

describe('sweptSphereHitsSphere (evita tunneling)', () => {
  it('detecta colisión cuando el punto final está dentro del radio', () => {
    expect(
      sweptSphereHitsSphere({ x: -10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 5, 1),
    ).toBe(true);
  });

  it('detecta colisión con un obstáculo que el segmento ATRAVIESA sin que ningún extremo quede dentro (tunneling)', () => {
    // El objeto viaja de x=-10 a x=10 en un frame; el obstáculo está en x=0.
    // Ni el extremo inicial ni el final están a menos de 5 unidades de (0,0,0),
    // pero el TRAMO sí pasa a distancia 0 del obstáculo.
    const hit = sweptSphereHitsSphere({ x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 5, 1);
    expect(hit).toBe(true);
    expect(Math.hypot(-10, 0, 0)).toBeGreaterThan(6); // confirma que un chequeo puntual NO lo habría visto
    expect(Math.hypot(10, 0, 0)).toBeGreaterThan(6);
  });

  it('no detecta colisión si el tramo pasa lejos del obstáculo', () => {
    expect(
      sweptSphereHitsSphere({ x: -10, y: 100, z: 0 }, { x: 10, y: 100, z: 0 }, { x: 0, y: 0, z: 0 }, 5, 1),
    ).toBe(false);
  });
});
```

- [ ] **Step 2:** Run `pnpm --filter @plataforma/shell exec vitest run src/space/race-math.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementa**
```ts
/**
 * Distancia a segmento y colisión (Hito 5). Reutiliza vec3-math.ts (Hito 1).
 * Sin Three.js.
 */
import { type V3, sub, add, scale, dot, length } from './vec3-math';

export type { V3 };

/** Distancia del punto `p` al segmento [a,b] (proyección acotada al segmento). */
export function distanceToSegment(p: V3, a: V3, b: V3): number {
  const ab = sub(b, a);
  const abLenSq = dot(ab, ab);
  const t = abLenSq > 1e-9 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / abLenSq)) : 0;
  const closest = add(a, scale(ab, t));
  return length(sub(p, closest));
}

/**
 * Distancia de `p` al segmento MÁS CERCANO de un circuito cerrado (recorre
 * todos los pares consecutivos, incluida la vuelta de cierre waypoints[n-1]→[0]).
 */
export function nearestSegmentDistance(p: V3, waypoints: V3[]): number {
  if (waypoints.length === 0) return Infinity;
  if (waypoints.length === 1) {
    const only = waypoints[0];
    return only ? length(sub(p, only)) : Infinity;
  }
  let min = Infinity;
  for (let i = 0; i < waypoints.length; i++) {
    const a = waypoints[i];
    const b = waypoints[(i + 1) % waypoints.length];
    if (!a || !b) continue;
    const d = distanceToSegment(p, a, b);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Colisión esfera-esfera POR EL TRAMO recorrido en el frame (segStart→segEnd),
 * no por la posición puntual — evita el "tunneling" de un objeto rápido que
 * atraviesa un obstáculo pequeño entre dos frames sin que su posición final
 * quede nunca dentro del radio de colisión (la nave no tiene maxSpeed).
 */
export function sweptSphereHitsSphere(
  segStart: V3,
  segEnd: V3,
  obstacleCenter: V3,
  obstacleRadius: number,
  shipRadius: number,
): boolean {
  return distanceToSegment(obstacleCenter, segStart, segEnd) <= obstacleRadius + shipRadius;
}
```

- [ ] **Step 4:** Run el mismo comando. Expected: PASS (11 tests).

---

## Task 3: `race-state.ts` (lógica pura, TDD, mismo patrón que `orbit.ts`)

**Files:** Create `shell/src/space/race-state.ts`, Test `shell/src/space/race-state.test.ts`.

- [ ] **Step 1: Escribe el test**
```ts
import { describe, it, expect } from 'vitest';
import { startRace, stepRace, type RaceState } from './race-state';

const PARAMS = { totalCheckpoints: 4, totalLaps: 2, offTrackToleranceDistance: 450, offTrackRespawnSeconds: 4 };
const baseInput = { distanceToNearestSegment: 0, reachedCheckpoint: false, dt: 0.1 };

describe('startRace', () => {
  it('produce el estado inicial de carrera', () => {
    expect(startRace()).toEqual({ phase: 'racing', currentCheckpoint: 0, lap: 0, offTrackSeconds: 0 });
  });
});

describe('stepRace', () => {
  it('fuera de fase racing no hace nada', () => {
    const idle: RaceState = { phase: 'idle', currentCheckpoint: 0, lap: 0, offTrackSeconds: 0 };
    const r = stepRace(idle, { ...baseInput, reachedCheckpoint: true }, PARAMS);
    expect(r.action).toBe('none');
    expect(r.state).toEqual(idle);
  });

  it('alcanzar un checkpoint intermedio avanza currentCheckpoint y resetea offTrackSeconds', () => {
    const state = startRace();
    const r = stepRace({ ...state, offTrackSeconds: 1 }, { ...baseInput, reachedCheckpoint: true }, PARAMS);
    expect(r.action).toBe('checkpoint');
    expect(r.state.currentCheckpoint).toBe(1);
    expect(r.state.offTrackSeconds).toBe(0);
  });

  it('completar el último checkpoint de una vuelta (no la última) avanza de vuelta y reinicia currentCheckpoint', () => {
    const state: RaceState = { phase: 'racing', currentCheckpoint: 3, lap: 0, offTrackSeconds: 0 };
    const r = stepRace(state, { ...baseInput, reachedCheckpoint: true }, PARAMS);
    expect(r.action).toBe('lap');
    expect(r.state).toEqual({ phase: 'racing', currentCheckpoint: 0, lap: 1, offTrackSeconds: 0 });
  });

  it('completar la última vuelta termina la carrera', () => {
    const state: RaceState = { phase: 'racing', currentCheckpoint: 3, lap: 1, offTrackSeconds: 0 };
    const r = stepRace(state, { ...baseInput, reachedCheckpoint: true }, PARAMS);
    expect(r.action).toBe('finish');
    expect(r.state.phase).toBe('finished');
  });

  it('fuera de tolerancia acumula offTrackSeconds', () => {
    const state = startRace();
    const r = stepRace(state, { ...baseInput, distanceToNearestSegment: 500, dt: 0.5 }, PARAMS);
    expect(r.action).toBe('none');
    expect(r.state.offTrackSeconds).toBeCloseTo(0.5, 10);
  });

  it('dentro de tolerancia NO acumula (se resetea)', () => {
    const state: RaceState = { phase: 'racing', currentCheckpoint: 0, lap: 0, offTrackSeconds: 2 };
    const r = stepRace(state, { ...baseInput, distanceToNearestSegment: 100 }, PARAMS);
    expect(r.state.offTrackSeconds).toBe(0);
  });

  it('superar offTrackRespawnSeconds dispara respawn, resetea el contador y CONSERVA currentCheckpoint', () => {
    const state: RaceState = { phase: 'racing', currentCheckpoint: 2, lap: 0, offTrackSeconds: 3.95 };
    const r = stepRace(state, { ...baseInput, distanceToNearestSegment: 500, dt: 0.1 }, PARAMS);
    expect(r.action).toBe('respawn');
    expect(r.state.offTrackSeconds).toBe(0);
    expect(r.state.currentCheckpoint).toBe(2);
  });

  it('reachedCheckpoint tiene prioridad sobre el respawn por fuera-de-pista en el mismo frame', () => {
    const state: RaceState = { phase: 'racing', currentCheckpoint: 0, lap: 0, offTrackSeconds: 3.99 };
    const r = stepRace(
      state,
      { ...baseInput, distanceToNearestSegment: 500, reachedCheckpoint: true, dt: 0.1 },
      PARAMS,
    );
    expect(r.action).toBe('checkpoint');
  });
});
```

- [ ] **Step 2:** Run `pnpm --filter @plataforma/shell exec vitest run src/space/race-state.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementa** (IMPORTANTE: el chequeo de `reachedCheckpoint` va ANTES del chequeo de fuera-de-pista/respawn — así lo exige el último test de arriba; si lo inviertes, ese test falla)
```ts
/**
 * Máquina de estados pura de la carrera (Hito 5): checkpoint/vuelta/respawn.
 * Mismo patrón que orbit.ts. Sin Three.js.
 */

export type RacePhase = 'idle' | 'racing' | 'finished';

export interface RaceState {
  phase: RacePhase;
  currentCheckpoint: number;
  lap: number;
  offTrackSeconds: number;
}

export interface RaceInput {
  /** Distancia de la nave al segmento de circuito más cercano (race-math.ts). */
  distanceToNearestSegment: number;
  /** true si la nave entró en el radio del checkpoint actual este frame. */
  reachedCheckpoint: boolean;
  dt: number;
}

export interface RaceParams {
  totalCheckpoints: number;
  totalLaps: number;
  offTrackToleranceDistance: number;
  offTrackRespawnSeconds: number;
}

export type RaceAction = 'none' | 'checkpoint' | 'lap' | 'finish' | 'respawn';

export interface RaceStepResult {
  state: RaceState;
  action: RaceAction;
}

export function startRace(): RaceState {
  return { phase: 'racing', currentCheckpoint: 0, lap: 0, offTrackSeconds: 0 };
}

/**
 * Avanza un frame:
 * - `reachedCheckpoint` SIEMPRE se procesa primero (si alcanzaste un
 *   checkpoint, por definición estás sobre la pista en ese instante —
 *   resetea offTrackSeconds sin importar el valor previo).
 * - Si no, se evalúa fuera-de-pista: acumula `offTrackSeconds`; al superar
 *   `offTrackRespawnSeconds`, dispara `respawn` (conserva `currentCheckpoint`:
 *   vuelves al ÚLTIMO checkpoint validado, no al inicio del circuito).
 */
export function stepRace(prev: RaceState, input: RaceInput, params: RaceParams): RaceStepResult {
  if (prev.phase !== 'racing') return { state: prev, action: 'none' };

  if (input.reachedCheckpoint) {
    const nextCheckpoint = prev.currentCheckpoint + 1;
    if (nextCheckpoint >= params.totalCheckpoints) {
      const nextLap = prev.lap + 1;
      if (nextLap >= params.totalLaps) {
        return { state: { ...prev, phase: 'finished', offTrackSeconds: 0 }, action: 'finish' };
      }
      return { state: { phase: 'racing', currentCheckpoint: 0, lap: nextLap, offTrackSeconds: 0 }, action: 'lap' };
    }
    return { state: { ...prev, currentCheckpoint: nextCheckpoint, offTrackSeconds: 0 }, action: 'checkpoint' };
  }

  const offTrack = input.distanceToNearestSegment > params.offTrackToleranceDistance;
  const offTrackSeconds = offTrack ? prev.offTrackSeconds + input.dt : 0;
  if (offTrackSeconds >= params.offTrackRespawnSeconds) {
    return { state: { ...prev, offTrackSeconds: 0 }, action: 'respawn' };
  }

  return { state: { ...prev, offTrackSeconds }, action: 'none' };
}
```

- [ ] **Step 4:** Run el mismo comando. Expected: PASS (9 tests).

- [ ] **Checkpoint de verificación combinada (Tareas 1-3):** desde la raíz, `pnpm --filter @plataforma/shell test` y `pnpm --filter @plataforma/shell lint` en verde.

---

## Task 4: `space-config.ts` (`RACE_CONFIG`) + `ship-controller.ts` (`dampVelocity`)

**Files:** Modify `shell/src/space/space-config.ts`, Modify `shell/src/space/ship-controller.ts`.

- [ ] **Step 1: Añade `RACE_CONFIG` al final de `space-config.ts`**
```ts

/** Pista de carreras espacial (Hito 5). Landmark nativo, fuera del app-registry. */
export const RACE_CONFIG = {
  enabled: true, // [UNIFORME] kill-switch: apaga la zona sin revertir código
  trackSeed: 1337, // [PERSONALIZABLE] semilla del circuito
  center: { x: 0, y: 4000, z: 70000 }, // [UNIFORME] lejos del clúster de planetas y del cinturón
  zoneRadius: 3000, // [UNIFORME] radio de detección para el prompt "Pulsa E"
  checkpointCount: 10, // [PERSONALIZABLE] nº de waypoints del circuito
  baseRadius: 2200, // [PERSONALIZABLE] radio medio del circuito
  radiusJitter: 0.4, // [PERSONALIZABLE] variación de radio por checkpoint (fracción de baseRadius)
  heightJitter: 600, // [PERSONALIZABLE] variación de altura por checkpoint (unidades)
  checkpointRadius: 220, // [UNIFORME] distancia para considerar "alcanzado" un checkpoint
  offTrackToleranceDistance: 450, // [PERSONALIZABLE] distancia al segmento más cercano antes de "fuera de pista"
  offTrackRespawnSeconds: 4, // [PERSONALIZABLE] segundos fuera de pista antes de respawnear
  totalLaps: 2, // [PERSONALIZABLE] vueltas para terminar la carrera
  asteroidCount: 14, // [PERSONALIZABLE] obstáculos móviles con colisión (bajar si falla la puerta de rendimiento)
  asteroidRadius: 90, // [UNIFORME] radio de colisión de cada asteroide
  shipCollisionRadius: 2.5, // [UNIFORME] radio de colisión de la nave
  gateRadius: 900, // [UNIFORME] radio de las 2 esferas "planetas masivos" decorativas
  collisionBrakeFactor: 0.15, // [UNIFORME] multiplicador de velocidad al colisionar con un asteroide
};
```

- [ ] **Step 2: Añade `dampVelocity` a `ship-controller.ts`**

Junto al método `applyImpulse` (añade DESPUÉS de él):
```ts
  /** Añade un impulso a la velocidad (p. ej. expulsión radial al salir de la órbita). */
  applyImpulse(v: THREE.Vector3) {
    this.velocity.add(v);
  }

  /** Amortigua la velocidad por un factor (Hito 5: frenado brusco al colisionar con un obstáculo). */
  dampVelocity(factor: number) {
    this.velocity.multiplyScalar(factor);
  }
```

- [ ] **Step 3: Verifica** `pnpm --filter @plataforma/shell lint` (tsc --noEmit) → sin errores (no hay tests nuevos en este paso, son constantes/un método trivial).

---

## Task 5: `race-render.ts` + `race-hud.ts` + `space.css` (cableado Three.js/DOM, sin tests unitarios)

**Files:** Create `shell/src/space/race-render.ts`, Create `shell/src/space/race-hud.ts`, Modify `shell/src/space/space.css`.

- [ ] **Step 1: `race-render.ts`**
```ts
import * as THREE from 'three';
import type { RaceTrack, V3 } from './race-track';

export interface RaceRenderOpts {
  track: RaceTrack;
  checkpointRadius: number;
  gateRadius: number;
  asteroidCount: number;
  asteroidRadius: number;
  seed: number;
}

export interface RaceRender {
  object: THREE.Group;
  update(elapsed: number, delta: number, currentCheckpoint: number): void;
  /** Posiciones LOCALES (mismo marco que los waypoints) de los asteroides, para colisión. */
  obstaclePositions(): V3[];
  rebase(delta: THREE.Vector3): void;
  dispose(): void;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Cableado Three.js de la pista (Hito 5): esferas guía translúcidas por
 * checkpoint (la actual más brillante), 2 esferas "planetas masivos"
 * decorativas sin colisión a los lados de un tramo, y asteroides móviles
 * (con colisión real, resuelta fuera de este módulo vía `obstaclePositions()`
 * + `race-math.ts`). `object` se posiciona UNA vez en `RACE_CONFIG.center`
 * desde `space-engine.ts`; `rebase()` sigue el mismo patrón que
 * `solar-system.ts`/`asteroids.ts` para no desincronizarse del marco de mundo.
 */
export function createRaceRender(opts: RaceRenderOpts): RaceRender {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => {
    disposables.push(o);
    return o;
  };

  // ── Aros guía (checkpoints): TORUS, no esfera rellena ──
  // CORRECCIÓN post-medición (puerta de rendimiento): una esfera translúcida
  // rellena de radio ~220 con depthWrite:false produce overdraw severo cuando
  // la cámara está cerca/dentro (p95 medido: 41.5 ms, muy por encima del
  // presupuesto). Un aro delgado con el MISMO radio exterior cubre una
  // fracción mucho menor de pantalla, y de paso es el patrón real de "gate"
  // de F1/Mario Kart (un anillo que atraviesas) en vez de una bola que hay
  // que esquivar.
  const guideGeo = track(new THREE.TorusGeometry(1, 0.07, 12, 28));
  const guideMats: THREE.MeshBasicMaterial[] = [];
  const lookTarget = new THREE.Vector3();
  opts.track.waypoints.forEach((wp, i) => {
    const mat = track(
      new THREE.MeshBasicMaterial({ color: 0xe6a817, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    const mesh = new THREE.Mesh(guideGeo, mat);
    mesh.scale.setScalar(opts.checkpointRadius);
    mesh.position.set(wp.x, wp.y, wp.z);
    // Orienta el aro perpendicular a la dirección de viaje (hacia el
    // siguiente checkpoint), como una puerta que se atraviesa.
    const next = opts.track.waypoints[(i + 1) % opts.track.waypoints.length] ?? wp;
    lookTarget.set(next.x, next.y, next.z);
    mesh.lookAt(lookTarget);
    group.add(mesh);
    guideMats.push(mat);
  });

  // ── Gates (2 esferas "planetas masivos" decorativas, sin colisión) ──
  const gateGeo = track(new THREE.SphereGeometry(1, 24, 16));
  const gateMat = track(
    new THREE.MeshStandardMaterial({ color: 0x3a2a20, metalness: 0.3, roughness: 0.8, emissive: 0x1a0e08 }),
  );
  const midIndex = Math.floor(opts.track.waypoints.length / 2);
  const midpoint = opts.track.waypoints[midIndex] ?? { x: 0, y: 0, z: 0 };
  for (const side of [-1, 1] as const) {
    const gate = new THREE.Mesh(gateGeo, gateMat);
    gate.scale.setScalar(opts.gateRadius);
    gate.position.set(midpoint.x + side * opts.gateRadius * 2.6, midpoint.y, midpoint.z);
    group.add(gate);
  }

  // ── Asteroides móviles (obstáculos con colisión real) ──
  const rand = mulberry32(opts.seed + 1);
  const asteroidGeo = track(new THREE.IcosahedronGeometry(1, 0));
  const asteroidMat = track(new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9, metalness: 0.1 }));
  interface Asteroid {
    mesh: THREE.Mesh;
    center: V3;
    orbitRadius: number;
    orbitSpeed: number;
    phase: number;
  }
  const asteroids: Asteroid[] = [];
  for (let i = 0; i < opts.asteroidCount; i++) {
    const wp = opts.track.waypoints[i % opts.track.waypoints.length] ?? { x: 0, y: 0, z: 0 };
    const mesh = new THREE.Mesh(asteroidGeo, asteroidMat);
    mesh.scale.setScalar(opts.asteroidRadius);
    group.add(mesh);
    asteroids.push({
      mesh,
      center: wp,
      orbitRadius: 200 + rand() * 400,
      orbitSpeed: 0.2 + rand() * 0.3,
      phase: rand() * Math.PI * 2,
    });
  }

  return {
    object: group,
    update(elapsed, _delta, currentCheckpoint) {
      guideMats.forEach((mat, i) => {
        mat.opacity = i === currentCheckpoint ? 0.85 : 0.5;
      });
      for (const a of asteroids) {
        const angle = a.phase + elapsed * a.orbitSpeed;
        a.mesh.position.set(
          a.center.x + Math.cos(angle) * a.orbitRadius,
          a.center.y + Math.sin(angle * 0.7) * a.orbitRadius * 0.3,
          a.center.z + Math.sin(angle) * a.orbitRadius,
        );
      }
    },
    obstaclePositions() {
      return asteroids.map((a) => ({ x: a.mesh.position.x, y: a.mesh.position.y, z: a.mesh.position.z }));
    },
    rebase(delta) {
      group.position.sub(delta);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
```

- [ ] **Step 2: `race-hud.ts`**
```ts
import { bearingToDisc } from './radar-projection';
import type { RaceState } from './race-state';
import type { V3 } from './race-track';

/**
 * HUD de la carrera (Hito 5): estado (checkpoint/vuelta/aviso) + minimapa que
 * reutiliza `bearingToDisc` (radar-projection.ts, Hito 1-4) en vez de
 * reinventar la proyección. Oculto por defecto; `showPrompt()` mientras estás
 * en la zona sin correr, `update()` mientras `phase==='racing'`.
 */
export class RaceHud {
  private root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private statusEl: HTMLDivElement;
  private readonly size = 140;
  private readonly cx = 70;
  private readonly cy = 70;
  private readonly r = 58;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'raceHud';
    this.root.innerHTML = `
      <div class="race-status"></div>
      <canvas width="140" height="140"></canvas>
    `;
    host.appendChild(this.root);
    this.statusEl = this.root.querySelector('.race-status') as HTMLDivElement;
    this.canvas = this.root.querySelector('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** En la zona, sin correr todavía: solo el prompt, sin minimapa. */
  showPrompt() {
    this.root.classList.add('visible');
    this.canvas.style.display = 'none';
    this.statusEl.textContent = 'Pulsa E para iniciar la carrera';
    this.statusEl.classList.remove('warning');
  }

  hide() {
    this.root.classList.remove('visible');
  }

  /** `shipPosLocal` en el mismo marco que los waypoints (relativo al centro de la zona). */
  update(
    state: RaceState,
    waypoints: V3[],
    shipPosLocal: V3,
    yaw: number,
    totalLaps: number,
    offTrackWarning: boolean,
  ) {
    this.root.classList.add('visible');
    this.canvas.style.display = 'block';
    const total = waypoints.length;
    this.statusEl.textContent =
      `Checkpoint ${state.currentCheckpoint + 1}/${total} · Vuelta ${state.lap + 1}/${totalLaps}` +
      (offTrackWarning ? ' · FUERA DE PISTA' : '');
    this.statusEl.classList.toggle('warning', offTrackWarning);

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.fillStyle = 'rgba(10, 5, 3, 0.7)';
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.r, 0, Math.PI * 2);
    ctx.fill();

    for (let k = 0; k < Math.min(3, total); k++) {
      const idx = (state.currentCheckpoint + k) % total;
      const wp = waypoints[idx];
      if (!wp) continue;
      const disc = bearingToDisc(wp.x - shipPosLocal.x, wp.z - shipPosLocal.z, yaw, 3000, this.r);
      const px = this.cx + disc.x;
      const py = this.cy + disc.y;
      ctx.fillStyle = k === 0 ? 'rgba(255, 196, 120, 0.95)' : 'rgba(230, 168, 23, 0.4)';
      ctx.beginPath();
      ctx.arc(px, py, k === 0 ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#E6A817';
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  dispose() {
    this.root.remove();
  }
}
```

- [ ] **Step 3: añade a `shell/src/space/space.css`** (al final del archivo):
```css

/* ── Carrera espacial (Hito 5): estado + minimapa ── */
#raceHud {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}
#raceHud.visible {
  display: flex;
}
#raceHud .race-status {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--space-text);
  background: rgba(10, 5, 3, 0.6);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--metal-iron);
}
#raceHud .race-status.warning {
  color: var(--orange-ember);
  border-color: var(--orange-ember);
}
#raceHud canvas {
  border-radius: 50%;
  border: 1px solid var(--metal-iron);
}
```

- [ ] **Step 4: Verifica** `pnpm --filter @plataforma/shell lint` y `pnpm --filter @plataforma/shell build` → sin errores (no hay tests unitarios de estos dos archivos, son cableado Three.js/DOM puro, verificados en runtime en la Tarea 7).

---

## Task 6: Cableado completo en `space-engine.ts`

**Files:** Modify `shell/src/space/space-engine.ts`.

- [ ] **Step 1: Imports.** Añade junto a los imports ya existentes de `./orbit`/`./orbit-frame`/etc.:
```ts
import { generateTrack, type RaceTrack } from './race-track';
import { nearestSegmentDistance, sweptSphereHitsSphere } from './race-math';
import { startRace, stepRace, type RaceState } from './race-state';
import { createRaceRender, type RaceRender } from './race-render';
import { RaceHud } from './race-hud';
```
Y añade `RACE_CONFIG` a la lista ya existente `import { SOLAR_CONFIG, CAMERA_CONFIG, ORBIT_CONFIG, PERF_CONFIG, AUDIO_CONFIG } from './space-config';` (ajusta según el nombre exacto de esa línea en el archivo real — añade `RACE_CONFIG` al final de la lista de nombres importados, NO crees un import nuevo).

- [ ] **Step 2: Campos nuevos.** Añade junto a los campos de la interacción orbital (`private orbitAngle = 0;`):
```ts
  // ── Carrera espacial (Hito 5) ──
  private raceState: RaceState = { phase: 'idle', currentCheckpoint: 0, lap: 0, offTrackSeconds: 0 };
  private raceTrack: RaceTrack | null = null;
  private raceRender: RaceRender | null = null;
  private raceHud: RaceHud | null = null;
  private raceZoneActive = false;
  private readonly racePrevShipPos = new THREE.Vector3();
```

- [ ] **Step 3: Inicialización en `mount()`.** Añade, justo antes de `this.start();` (última línea de `mount()`):
```ts
    // ── Carrera espacial (Hito 5): landmark nativo, fuera del app-registry ──
    if (RACE_CONFIG.enabled) {
      this.raceTrack = generateTrack(RACE_CONFIG.trackSeed, {
        checkpointCount: RACE_CONFIG.checkpointCount,
        baseRadius: RACE_CONFIG.baseRadius,
        radiusJitter: RACE_CONFIG.radiusJitter,
        heightJitter: RACE_CONFIG.heightJitter,
      });
      this.raceRender = createRaceRender({
        track: this.raceTrack,
        checkpointRadius: RACE_CONFIG.checkpointRadius,
        gateRadius: RACE_CONFIG.gateRadius,
        asteroidCount: RACE_CONFIG.asteroidCount,
        asteroidRadius: RACE_CONFIG.asteroidRadius,
        seed: RACE_CONFIG.trackSeed,
      });
      this.raceRender.object.position.set(RACE_CONFIG.center.x, RACE_CONFIG.center.y, RACE_CONFIG.center.z);
      this.scene.add(this.raceRender.object);
      this.raceHud = new RaceHud(host);
      this.racePrevShipPos.copy(this.ship.object.position);
    }
```

- [ ] **Step 4: Rebase.** En `maybeRebase()`, junto a `this.belt.rebase(delta);`, añade:
```ts
    this.raceRender?.rebase(delta);
```

- [ ] **Step 5: Lógica por frame en `loop()`.** Añade justo antes de `this.composer.render();` (después del bloque de multijugador/`this.remoteShips?.update(delta);`):
```ts
    // ── Carrera espacial (Hito 5) ──
    if (RACE_CONFIG.enabled && this.raceRender && this.raceTrack) {
      const raceGroupPos = this.raceRender.object.position;
      const shipLocal = {
        x: ship.position.x - raceGroupPos.x,
        y: ship.position.y - raceGroupPos.y,
        z: ship.position.z - raceGroupPos.z,
      };
      const distToRaceCenter = Math.hypot(shipLocal.x, shipLocal.y, shipLocal.z);
      this.raceZoneActive = distToRaceCenter <= RACE_CONFIG.zoneRadius;

      this.raceRender.update(this.elapsed, delta, this.raceState.currentCheckpoint);

      if (this.raceState.phase === 'racing') {
        const nearestDist = nearestSegmentDistance(shipLocal, this.raceTrack.waypoints);
        const targetWp = this.raceTrack.waypoints[this.raceState.currentCheckpoint];
        const reachedCheckpoint = targetWp
          ? Math.hypot(shipLocal.x - targetWp.x, shipLocal.y - targetWp.y, shipLocal.z - targetWp.z) <=
            RACE_CONFIG.checkpointRadius
          : false;

        const r = stepRace(
          this.raceState,
          { distanceToNearestSegment: nearestDist, reachedCheckpoint, dt: delta },
          {
            totalCheckpoints: RACE_CONFIG.checkpointCount,
            totalLaps: RACE_CONFIG.totalLaps,
            offTrackToleranceDistance: RACE_CONFIG.offTrackToleranceDistance,
            offTrackRespawnSeconds: RACE_CONFIG.offTrackRespawnSeconds,
          },
        );
        this.raceState = r.state;

        if (r.action === 'respawn') {
          // Respawnea en el ÚLTIMO checkpoint VALIDADO (currentCheckpoint es el
          // PRÓXIMO objetivo, aún no alcanzado) — no en currentCheckpoint: eso
          // colocaría la nave exactamente sobre el objetivo pendiente y lo
          // "regalaría" en el frame siguiente (reachedCheckpoint se cumpliría
          // de inmediato). Con currentCheckpoint=0 (inicio de carrera o de
          // vuelta), el último validado envuelve al final del circuito.
          const total = this.raceTrack.waypoints.length;
          const lastValidated = (this.raceState.currentCheckpoint - 1 + total) % total;
          const target = this.raceTrack.waypoints[lastValidated];
          if (target) {
            this.ship.object.position.set(
              raceGroupPos.x + target.x,
              raceGroupPos.y + target.y,
              raceGroupPos.z + target.z,
            );
            this.ship.dampVelocity(0);
          }
        }

        // Colisión con asteroides: tramo recorrido este frame (posición anterior → actual).
        const prevLocal = {
          x: this.racePrevShipPos.x - raceGroupPos.x,
          y: this.racePrevShipPos.y - raceGroupPos.y,
          z: this.racePrevShipPos.z - raceGroupPos.z,
        };
        for (const obstacle of this.raceRender.obstaclePositions()) {
          if (
            sweptSphereHitsSphere(prevLocal, shipLocal, obstacle, RACE_CONFIG.asteroidRadius, RACE_CONFIG.shipCollisionRadius)
          ) {
            this.ship.dampVelocity(RACE_CONFIG.collisionBrakeFactor);
            break;
          }
        }

        this.raceHud?.update(
          this.raceState,
          this.raceTrack.waypoints,
          shipLocal,
          ship.yaw,
          RACE_CONFIG.totalLaps,
          this.raceState.offTrackSeconds > 0,
        );
      } else if (this.raceZoneActive) {
        this.raceHud?.showPrompt();
      } else {
        this.raceHud?.hide();
      }
    }
    this.racePrevShipPos.copy(ship.position);

```
(el bloque queda ANTES de `this.composer.render();`, que sigue igual justo después).

- [ ] **Step 6: Teclas.** En `onKeyDown`, el bloque actual es:
```ts
    if (e.code === 'KeyE' || e.code === 'Space') {
      // Space o E: entrar al proyecto del planeta en aproximación/órbita.
      this.enterCurrentProject();
      return;
    }
```
Cámbialo a:
```ts
    if (e.code === 'KeyE' || e.code === 'Space') {
      // Dentro de la zona de carrera y sin correr todavía: E la inicia (nunca
      // coincide con un planeta real: la zona está a 70 000 u de cualquiera).
      if (this.raceZoneActive && this.raceState.phase !== 'racing') {
        this.raceState = startRace();
        return;
      }
      // Space o E: entrar al proyecto del planeta en aproximación/órbita.
      this.enterCurrentProject();
      return;
    }
    // Q: abandona la carrera en curso (vuelo libre, no se pierde el control).
    if (e.code === 'KeyQ') {
      if (this.raceState.phase === 'racing') {
        this.raceState = { phase: 'idle', currentCheckpoint: 0, lap: 0, offTrackSeconds: 0 };
      }
      return;
    }
```

- [ ] **Step 7: `dispose()`.** Añade junto a `this.belt?.dispose();`:
```ts
    this.raceRender?.dispose();
    this.raceHud?.dispose();
```

- [ ] **Step 8: Verificación** (desde la raíz): `pnpm --filter @plataforma/shell test` (todo en verde, sin regresión), `pnpm --filter @plataforma/shell lint` (sin errores), `pnpm --filter @plataforma/shell build` (OK).

---

## Task 7: Verificación final, puerta de rendimiento, reporte y ÚNICO commit

**Files:** Create `docs/superpowers/notes/2026-07-05-hito-5-reporte.md` (sin más cambios de código).

- [ ] **Step 1:** Suite completa: `pnpm --filter @plataforma/shell test`, `lint`, `build` en verde. Anota el nº total de tests.

- [ ] **Step 2:** Arnés dev (crear `shell/debug.html` + `shell/src/debug-space.ts` como en hitos anteriores — borrar antes del commit) para conducir el motor a mano: teletransporta la nave a `RACE_CONFIG.center` (o cerca, dentro de `zoneRadius`), pulsa `E` para iniciar, verifica:
  - El prompt "Pulsa E para iniciar la carrera" aparece al entrar en la zona.
  - Al iniciar, el HUD de carrera muestra "Checkpoint 1/10 · Vuelta 1/2" y el minimapa.
  - Volar hacia el siguiente checkpoint (usa las posiciones reales de `raceTrack.waypoints` + `RACE_CONFIG.center`) avanza el contador.
  - Alejarse de la pista >4s dispara un respawn (la nave vuelve al último checkpoint).
  - Acercarse a un asteroide (posición de `raceRender.obstaclePositions()`) frena la nave bruscamente.
  - Completar las 10 checkpoints × 2 vueltas termina la carrera («Checkpoint» deja de mostrarse o pasa a estado `finished`).
  - `KeyQ` durante la carrera la abandona (vuelo libre, sin bloquear controles).

- [ ] **Step 3: Puerta de rendimiento.** Con la nave dentro de la zona de carrera (todos los asteroides/gates renderizando), usa la tecla `P` (panel de diagnóstico, Hito 0) o `window.__space.engine.getPerfSnapshot()` para medir p95 de frame time. Compara contra `baseline (docs/superpowers/notes/2026-07-04-baseline-perf.md, ~8.5 ms) × PERF_CONFIG.p95BudgetMultiplierRace (1.2) ≈ 10.2 ms`, y confirma FPS sostenidos ≥ `PERF_CONFIG.minSustainedFps` (30). Si falla, reduce `RACE_CONFIG.asteroidCount` (primera palanca, según el master plan) y vuelve a medir.

- [ ] **Step 4:** Borra el arnés dev (`shell/debug.html`, `shell/src/debug-space.ts`).

- [ ] **Step 5:** Redeploy real: `deploy/ejec-shell.bat`, confirma el hash del bundle cambiado en `http://localhost:8080`.

- [ ] **Step 6:** Escribe `docs/superpowers/notes/2026-07-05-hito-5-reporte.md` con los criterios verificados, nº de tests, hash del bundle, y los números REALES de la puerta de rendimiento (p95 medido, FPS, comparación contra el presupuesto).

- [ ] **Step 7: El ÚNICO commit del hito.**
```bash
git add shell/src/space/race-track.ts shell/src/space/race-track.test.ts \
  shell/src/space/race-math.ts shell/src/space/race-math.test.ts \
  shell/src/space/race-state.ts shell/src/space/race-state.test.ts \
  shell/src/space/race-render.ts shell/src/space/race-hud.ts \
  shell/src/space/space-config.ts shell/src/space/ship-controller.ts \
  shell/src/space/space-engine.ts shell/src/space/space.css \
  docs/superpowers/notes/2026-07-05-hito-5-reporte.md

git commit -m "$(cat <<'EOF'
feat(race): hito 5 — pista de obstaculos espacial con checkpoints, respawn y minimapa

- race-track.ts: circuito cerrado determinista por semilla (mulberry32)
- race-math.ts: distancia a segmento + colision esfera-esfera POR EL TRAMO
  recorrido en el frame (evita tunneling, la nave no tiene maxSpeed);
  reutiliza vec3-math.ts del Hito 1
- race-state.ts: maquina pura checkpoint/vuelta/respawn (mismo patron que
  orbit.ts); reachedCheckpoint tiene prioridad sobre el respawn por fuera-
  de-pista en el mismo frame
- race-render.ts/race-hud.ts: cableado Three.js (esferas guia, gates
  decorativos, asteroides moviles) y HUD (minimapa reutilizando
  bearingToDisc de radar-projection.ts)
- Zona nativa fuera del app-registry (RACE_CONFIG.center), E inicia/Q
  abandona sin capturar la nave; kill-switch RACE_CONFIG.enabled

Spec propio (brainstorm->spec->plan) en
docs/superpowers/specs/2026-07-05-pista-de-carreras-espacial-design.md

Verificado: <N> tests TS en verde, lint/build OK, runtime real (hash
<hash-antes> -> <hash-despues>). Puerta de rendimiento: p95 <valor> ms
(presupuesto baseline*1.2 = ~10.2 ms), FPS sostenidos >= 30.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Referencias

- Spec: `docs/superpowers/specs/2026-07-05-pista-de-carreras-espacial-design.md`.
- Master plan: `docs/superpowers/plans/2026-07-04-master-plan-ramatzo.md` (Hito 5, sección 5 "Estrategia de mitigación de latencia").
- Baseline: `docs/superpowers/notes/2026-07-04-baseline-perf.md`.
