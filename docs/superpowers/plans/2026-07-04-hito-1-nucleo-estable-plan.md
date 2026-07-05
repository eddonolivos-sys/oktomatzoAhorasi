# Hito 1 — Núcleo estable (órbita, marco de mundo, re-entrada, sesión) — Plan de implementación

> **Para agentes constructores:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para seguimiento.

> **ANULACIÓN de la plantilla de commits del skill:** el usuario exige **UN SOLO COMMIT PARA TODO EL HITO** (ver `docs/superpowers/plans/2026-07-04-master-plan-ramatzo.md`, sección 2), no un commit por tarea. Los pasos "Commit" de cada tarea de abajo están sustituidos por un checkpoint de verificación (tests en verde); el ÚNICO `git commit` del hito es la Tarea 14, al final, cuando TODOS los criterios de aceptación estén verificados.

**Goal:** implementar las 8 secciones (S1–S8) del spec `docs/superpowers/specs/2026-07-04-orbita-cinematica-y-navegacion-design.md`, que arreglan los 4 bugs reportados (planetas que desaparecen, no-reentrada tras volver de un proyecto, órbita inestable, re-pide login) y añaden la sensación pedida (captura ceñida, giros suaves, órbita estable con el sol encuadrado, bloqueo parcial de controles con salida explícita).

**Arquitectura:** lógica pura nueva en módulos sin Three.js (`orbit.ts` reescrito, `orbit-frame.ts`, `orbit-camera.ts`, `vec3-math.ts` compartido, `dampedFollow` en `flight-math.ts`, `captureState`/`planetWorldCenter` en `orbits.ts`), cada uno con su test Vitest. El cableado a Three.js vive SOLO en `solar-system.ts`, `space-engine.ts`, `chase-camera.ts`, `ship-controller.ts`, `hud.ts` (sin tests unitarios ahí — se verifica en runtime). `auth-client.ts` (S8) es lógica de servicio, testeada con mocks de `localStorage`/`sessionStorage`/`fetch` en Vitest `environment: node` (sin añadir `jsdom`: `AuthClient` no toca el DOM, solo storage/fetch, mockeables directamente).

**Tech Stack:** TypeScript, Vitest, Three.js 0.170 (solo en el cableado), Lit (sin cambios de plantilla salvo `hud.ts`).

**Orden de ejecución** (S1 → S6 → S3+S5 → S4 → S2 → S7 → S8, con una consolidación justificada): las Tareas 3–4 implementan JUNTAS S6 y la máquina de estados de S5 (ambas reescriben `orbit.ts`/`OrbitState` de forma inseparable; hacerlo en dos pasadas obligaría a escribir y luego borrar el campo `grace` — se hace una sola vez, en el punto del orden donde cae S6). Las Tareas 5–6 cubren la geometría de S3 (plano orbital); el cableado de teclas/HUD de S5 ya quedó resuelto en la Tarea 4.

---

## Task 1: `planetWorldCenter` (S1, lógica pura)

**Files:**
- Modify: `shell/src/space/orbits.ts`
- Test: `shell/src/space/orbits.test.ts` (si no existe, créalo; si existe, añade el `describe` nuevo al final)

- [ ] **Step 1: Comprueba si existe el test file**

Ejecuta: `ls shell/src/space/orbits.test.ts`. Si existe, lee su contenido completo antes de tocarlo (para no pisar tests de `planetLayout`/`orbitPosition`) y añade el bloque del Step 2 al final, con su `import` correspondiente. Si no existe, créalo con el import inicial más el bloque de abajo.

- [ ] **Step 2: Escribe el test (falla: la función no existe aún)**

Añade a `shell/src/space/orbits.test.ts`:

```ts
import { planetWorldCenter } from './orbits';

describe('planetWorldCenter (S1 — arregla Bug C: planetas que desaparecen)', () => {
  it('suma la posición del grupo (mundo) y la posición local del planeta', () => {
    expect(planetWorldCenter({ x: 100, y: 0, z: -50 }, { x: 10, y: 5, z: 0 })).toEqual({
      x: 110,
      y: 5,
      z: -50,
    });
  });

  it('invariante de rebase: mover el grupo en -delta desplaza el worldCenter exactamente en -delta', () => {
    const localPos = { x: 20, y: 3, z: -8 };
    const before = planetWorldCenter({ x: 0, y: 0, z: 0 }, localPos);
    const delta = { x: 100, y: 0, z: 50 };
    const groupAfterRebase = { x: -delta.x, y: -delta.y, z: -delta.z };
    const after = planetWorldCenter(groupAfterRebase, localPos);
    expect(after).toEqual({ x: before.x - delta.x, y: before.y - delta.y, z: before.z - delta.z });
  });

  it('con grupo en el origen, el worldCenter es igual a la posición local', () => {
    expect(planetWorldCenter({ x: 0, y: 0, z: 0 }, { x: 7, y: -3, z: 42 })).toEqual({ x: 7, y: -3, z: 42 });
  });
});
```

- [ ] **Step 2b: Ejecuta el test y confirma que falla**

Run: `pnpm --filter @plataforma/shell exec vitest run src/space/orbits.test.ts`
Expected: FAIL — `planetWorldCenter is not a function` o `is not exported`.

- [ ] **Step 3: Implementa `planetWorldCenter` en `orbits.ts`**

Añade al final de `shell/src/space/orbits.ts` (después de `orbitPosition`):

```ts
interface V3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Centro del planeta en coordenadas de ESCENA (S1 — arregla Bug C: los
 * planetas desaparecían porque `solar-system.ts` los movía en coordenadas
 * absolutas sin restar `worldOffset`, cayendo fuera de niebla/far tras el
 * rebase). `groupPos` es la posición del grupo "sistema" (afectada por
 * rebase); `localPos` es la posición del planeta DENTRO de ese grupo
 * (calculada por `orbitPosition`, sin cambios). worldCenter = groupPos + localPos.
 */
export function planetWorldCenter(groupPos: V3, localPos: V3): V3 {
  return { x: groupPos.x + localPos.x, y: groupPos.y + localPos.y, z: groupPos.z + localPos.z };
}
```

- [ ] **Step 4: Ejecuta el test y confirma que pasa**

Run: `pnpm --filter @plataforma/shell exec vitest run src/space/orbits.test.ts`
Expected: PASS (todos los tests de `orbits.test.ts`, incluidos los preexistentes de `planetLayout`/`orbitPosition`).

- [ ] **Checkpoint (no commit):** deja el working tree como está; el commit único llega en la Tarea 14.

---

## Task 2: Planetas en el marco de mundo (S1, cableado en `solar-system.ts`)

**Files:**
- Modify: `shell/src/space/solar-system.ts`

**Contexto:** hoy `update()` escribe `p.mesh.position` en coordenadas ABSOLUTAS cada frame (`p.mesh.position.set(pos.x,pos.y,pos.z)` con `pos` de `orbitPosition`, sin restar `worldOffset`), y `rebase()` mueve cada mesh individualmente — pero como `update()` los reescribe cada frame en absoluto, el rebase queda anulado. Al alejarse más de `fogFar=110000` (=`camera.far`), los planetas (radio ≤30000 de órbita) caen fuera de vista. La solución: agrupar los planetas bajo un `THREE.Group` "sistema" (hijo de la escena); `update()` sigue escribiendo `orbitPosition` en `p.mesh.position`, pero ahora esas coordenadas son LOCALES al grupo; `rebase()` mueve el GRUPO, no los meshes.

- [ ] **Step 1: Reescribe `solar-system.ts` completo**

Reemplaza el contenido completo de `shell/src/space/solar-system.ts` por:

```ts
import * as THREE from 'three';
import type { AppInfo } from '../services/protocol';
import { createPlanet } from './planet';
import { colorForCategory } from './layout';
import { planetLayout, orbitPosition, planetWorldCenter } from './orbits';
import { approachBrakeFactor } from './flight-math';
import { SOLAR_CONFIG } from './space-config';

export interface RadarBlip {
  name: string;
  position: THREE.Vector3;
  app: AppInfo;
}

export interface ApproachInfo {
  app: AppInfo;
  distance: number;
  influenceRadius: number;
  /** Posición (centro) del planeta en aproximación, en coordenadas de ESCENA (S1). */
  center: THREE.Vector3;
  /** Radio físico del planeta. */
  planetRadius: number;
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

const PLANET_MIN = SOLAR_CONFIG.planetMin;
const PLANET_MAX = SOLAR_CONFIG.planetMax;
const INFLUENCE_FACTOR = SOLAR_CONFIG.influenceFactor;
const BRAKE_MIN_FACTOR = 0.25; // damping fuerte en el núcleo de la esfera

function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h || 1;
}

/**
 * Sistema solar heliocéntrico: un planeta por app del registry orbitando el sol
 * Ramatzo (origen de escena). Calcula aproximación + frenado + permanencia por
 * frame y expone blips 3D para el radar.
 *
 * S1 (arregla Bug C — planetas que desaparecían): los meshes cuelgan de
 * `systemGroup`, un `THREE.Group` hijo de la escena. `update()` sigue
 * escribiendo `orbitPosition` en `mesh.position`, pero ahora son coordenadas
 * LOCALES al grupo. `rebase()` mueve el GRUPO (como `asteroids.ts`), no cada
 * mesh — así el rebase no queda anulado por el siguiente `update()`. El
 * centro entregado a la órbita de la nave (`ApproachInfo.center`) y los blips
 * del radar se calculan en coordenadas de ESCENA vía `planetWorldCenter`.
 */
export class SolarSystem {
  private planets: SolarPlanet[] = [];
  private readonly systemGroup = new THREE.Group();
  /** Vector de escaneo reutilizado por frame por planeta (evita allocs). */
  private readonly tmpWorld = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    apps: AppInfo[],
    _renderer: THREE.WebGLRenderer,
  ) {
    this.scene.add(this.systemGroup);
    const total = apps.length;
    apps.forEach((app, i) => {
      const layout = planetLayout(i, total, SOLAR_CONFIG.scale);
      // Tamaño compacto, determinista por índice (interiores algo menores).
      const planetRadius = PLANET_MIN + ((PLANET_MAX - PLANET_MIN) * (i % 4)) / 3;
      const seed = seedFromId(app.id);
      const mesh = createPlanet(planetRadius, seed, colorForCategory(app.category));
      this.systemGroup.add(mesh);
      this.planets.push({
        app,
        mesh,
        planetRadius,
        influenceRadius: planetRadius * INFLUENCE_FACTOR,
        radius: layout.radius,
        inclination: layout.inclination,
        phase: layout.phase,
        speed: layout.speed * SOLAR_CONFIG.orbitSpeedScale,
        mat: mesh.material as THREE.ShaderMaterial,
      });
    });
  }

  update(elapsed: number, delta: number, shipPos: THREE.Vector3): SolarUpdate {
    let nearest: SolarPlanet | null = null;
    let nearestDist = Infinity;
    let nearestCenter: THREE.Vector3 | null = null;

    for (const p of this.planets) {
      const pos = orbitPosition(p.radius, p.inclination, p.phase, p.speed, elapsed);
      p.mesh.position.set(pos.x, pos.y, pos.z); // LOCAL al systemGroup (S1)
      p.mesh.rotation.y += 0.05 * delta;
      const t = p.mat.uniforms['uTime'];
      if (t) t.value = elapsed;

      const world = planetWorldCenter(this.systemGroup.position, p.mesh.position);
      this.tmpWorld.set(world.x, world.y, world.z);
      const dist = this.tmpWorld.distanceTo(shipPos);
      if (dist <= p.influenceRadius && dist < nearestDist) {
        nearest = p;
        nearestDist = dist;
        nearestCenter = this.tmpWorld.clone();
      }
    }

    const approaching: ApproachInfo | null = nearest
      ? {
          app: nearest.app,
          distance: nearestDist,
          influenceRadius: nearest.influenceRadius,
          center: nearestCenter!,
          planetRadius: nearest.planetRadius,
        }
      : null;

    return { approaching, dwellProgress: 0, entered: null };
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
    return this.planets.map((p) => {
      const world = planetWorldCenter(this.systemGroup.position, p.mesh.position);
      return { name: p.app.name, position: new THREE.Vector3(world.x, world.y, world.z), app: p.app };
    });
  }

  /** S1: rebasa el GRUPO (patrón de `asteroids.ts`), no cada mesh — así no lo anula el próximo `update()`. */
  rebase(delta: THREE.Vector3): void {
    this.systemGroup.position.sub(delta);
  }

  dispose(): void {
    this.scene.remove(this.systemGroup);
    for (const p of this.planets) {
      p.mesh.geometry?.dispose?.();
      const mat = p.mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
      else mat?.dispose?.();
    }
    this.planets = [];
  }
}
```

- [ ] **Step 2: Verifica que compila y no rompe nada**

Run: `pnpm --filter @plataforma/shell lint` (tsc --noEmit)
Expected: sin errores.

Run: `pnpm --filter @plataforma/shell test`
Expected: todos los tests existentes en verde (ninguno testea `SolarSystem` directamente hoy, pero `orbits.test.ts` de la Tarea 1 debe seguir en verde).

- [ ] **Checkpoint (no commit).**

---

## Task 3: `orbit.ts` — nuevo contrato de la máquina de estados (S5 + S6 combinadas)

**Files:**
- Modify: `shell/src/space/orbit.ts` (reemplazo completo)
- Modify: `shell/src/space/orbit.test.ts` (reemplazo completo)

**Contexto (por qué se combinan S5 y S6 aquí):** S6 pide que `freeAfterExit` produzca un estado `'free'` con cooldown que NO recapture; hoy la fase `'free'` de `stepOrbit` IGNORA `cooldown` por completo (solo lo respeta `'ejecting'`). Para que `freeAfterExit` funcione hace falta que `'free'` respete el cooldown — eso es, a la vez, el cambio de contrato que pide S5 (fuera `thrustActive`/`grace`, dentro `exitPressed`). Separarlo en dos pasadas obligaría a escribir el campo `grace` y borrarlo dos tareas después.

- [ ] **Step 1: Reemplaza `shell/src/space/orbit.test.ts` completo (falla: `orbit.ts` aún no tiene el contrato nuevo)**

```ts
import { describe, it, expect } from 'vitest';
import { stepOrbit, freeAfterExit, ejectVelocity, type OrbitState, type OrbitInput } from './orbit';

const PARAMS = { cooldownDuration: 1.0 };
const FREE: OrbitState = { phase: 'free', cooldown: 0 };
const ORBITING: OrbitState = { phase: 'orbiting', cooldown: 0 };
const baseInput: OrbitInput = { insideInfluence: false, enterPressed: false, exitPressed: false, dt: 0.016 };

describe('stepOrbit', () => {
  it('captura: free (sin cooldown) + dentro de influencia → orbiting', () => {
    const r = stepOrbit(FREE, { ...baseInput, insideInfluence: true }, PARAMS);
    expect(r.state.phase).toBe('orbiting');
    expect(r.action).toBe('none');
  });

  it('free + fuera de influencia → sigue free', () => {
    const r = stepOrbit(FREE, baseInput, PARAMS);
    expect(r.state.phase).toBe('free');
    expect(r.action).toBe('none');
  });

  it('free CON cooldown activo (S6) NO recaptura aunque esté dentro de influencia', () => {
    const cooling: OrbitState = { phase: 'free', cooldown: 0.5 };
    const r = stepOrbit(cooling, { ...baseInput, insideInfluence: true, dt: 0.1 }, PARAMS);
    expect(r.state.phase).toBe('free');
    expect(r.state.cooldown).toBeCloseTo(0.4, 6);
    expect(r.action).toBe('none');
  });

  it('free: el cooldown se agota y, dentro de influencia, YA recaptura', () => {
    const cooling: OrbitState = { phase: 'free', cooldown: 0.05 };
    const r = stepOrbit(cooling, { ...baseInput, insideInfluence: true, dt: 0.1 }, PARAMS);
    expect(r.state.phase).toBe('orbiting');
  });

  it('free: el cooldown descuenta aunque NO esté dentro de influencia', () => {
    const cooling: OrbitState = { phase: 'free', cooldown: 0.5 };
    const r = stepOrbit(cooling, { ...baseInput, insideInfluence: false, dt: 0.2 }, PARAMS);
    expect(r.state.phase).toBe('free');
    expect(r.state.cooldown).toBeCloseTo(0.3, 6);
  });

  it('orbiting + enterPressed → acción enter (el estado no cambia, lo decide el llamador)', () => {
    const r = stepOrbit(ORBITING, { ...baseInput, insideInfluence: true, enterPressed: true }, PARAMS);
    expect(r.action).toBe('enter');
    expect(r.state).toEqual(ORBITING);
  });

  it('orbiting + exitPressed → ejecting con el cooldown completo, acción eject', () => {
    const r = stepOrbit(ORBITING, { ...baseInput, insideInfluence: true, exitPressed: true }, PARAMS);
    expect(r.state.phase).toBe('ejecting');
    expect(r.state.cooldown).toBeCloseTo(PARAMS.cooldownDuration, 6);
    expect(r.action).toBe('eject');
  });

  it('orbiting: enter tiene prioridad sobre exit si ambos se pulsan a la vez', () => {
    const r = stepOrbit(
      ORBITING,
      { ...baseInput, insideInfluence: true, enterPressed: true, exitPressed: true },
      PARAMS,
    );
    expect(r.action).toBe('enter');
  });

  it('orbiting: el empuje ya NO expulsa (no existe ese campo) — solo exitPressed saca de órbita', () => {
    const r = stepOrbit(ORBITING, { ...baseInput, insideInfluence: true }, PARAMS);
    expect(r.state.phase).toBe('orbiting');
    expect(r.action).toBe('none');
  });

  it('orbiting + sale de influencia por alejamiento → free', () => {
    const r = stepOrbit(ORBITING, { ...baseInput, insideInfluence: false }, PARAMS);
    expect(r.state.phase).toBe('free');
    expect(r.state.cooldown).toBe(0);
  });

  it('ejecting: descuenta cooldown y NO recaptura dentro de influencia', () => {
    const e: OrbitState = { phase: 'ejecting', cooldown: 1.0 };
    const r = stepOrbit(e, { ...baseInput, insideInfluence: true, dt: 0.4 }, PARAMS);
    expect(r.state.phase).toBe('ejecting');
    expect(r.state.cooldown).toBeCloseTo(0.6, 6);
    expect(r.action).toBe('none');
  });

  it('ejecting: al agotar el cooldown vuelve a free', () => {
    const e: OrbitState = { phase: 'ejecting', cooldown: 0.1 };
    const r = stepOrbit(e, { ...baseInput, insideInfluence: true, dt: 0.2 }, PARAMS);
    expect(r.state.phase).toBe('free');
  });
});

describe('freeAfterExit (S6 — arregla Bug B)', () => {
  it('produce free con el cooldown completo de los params', () => {
    expect(freeAfterExit(PARAMS)).toEqual({ phase: 'free', cooldown: 1.0 });
  });

  it('el estado producido NO recaptura en el frame siguiente aunque insideInfluence sea true', () => {
    const afterExit = freeAfterExit(PARAMS);
    const r = stepOrbit(afterExit, { ...baseInput, insideInfluence: true, dt: 0.016 }, PARAMS);
    expect(r.state.phase).toBe('free');
    expect(r.state.cooldown).toBeGreaterThan(0);
  });
});

describe('ejectVelocity', () => {
  it('empuja radialmente hacia afuera con magnitud = strength', () => {
    const v = ejectVelocity({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 50);
    expect(v.x).toBeCloseTo(50, 6);
    expect(v.y).toBeCloseTo(0, 6);
    expect(v.z).toBeCloseTo(0, 6);
  });

  it('dirección a lo largo del vector centro→nave', () => {
    const v = ejectVelocity({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 9 }, 10);
    expect(v.z).toBeCloseTo(10, 6);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.y).toBeCloseTo(0, 6);
  });

  it('caso degenerado nave≈centro → sin NaN', () => {
    const v = ejectVelocity({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 10);
    expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecuta y confirma que falla**

Run: `pnpm --filter @plataforma/shell exec vitest run src/space/orbit.test.ts`
Expected: FAIL (tipos/propiedades no coinciden con el `orbit.ts` actual: `grace`, `thrustActive`, `captureGrace`, falta `freeAfterExit`).

- [ ] **Step 3: Reemplaza `shell/src/space/orbit.ts` completo**

```ts
/**
 * Lógica pura de la interacción orbital (Hito 1 S5+S6): máquina de estados
 * libre/órbita/expulsión y el impulso de expulsión. Sin Three.js.
 *
 * S5: se elimina la expulsión automática por empuje mantenido (el jugador
 * podía quedar atrapado o ser expulsado sin querer). Ahora solo dos acciones
 * explícitas en órbita: `enter` (E / botón "Entrar") y `exit` (S / botón
 * "Salir"). Se elimina `captureGrace`/`grace`: ya no hace falta ignorar el
 * empuje al capturar, porque el empuje no expulsa nunca.
 *
 * S6 (arregla Bug B — no se podía entrar a otro planeta tras volver de un
 * proyecto): `freeAfterExit` produce un `'free'` con cooldown; la fase
 * `'free'` de `stepOrbit` respeta ese cooldown y NO recaptura mientras dure,
 * aunque la nave siga dentro de la esfera de influencia del mismo planeta.
 */

export type OrbitPhase = 'free' | 'orbiting' | 'ejecting';

export interface OrbitState {
  phase: OrbitPhase;
  /** Segundos restantes de bloqueo de recaptura (en 'ejecting' tras salir, o
   * en 'free' tras volver de un proyecto — ver `freeAfterExit`, S6). */
  cooldown: number;
}

export interface OrbitInput {
  insideInfluence: boolean;
  /** Tecla/botón "Entrar" (E / HUD). */
  enterPressed: boolean;
  /** Tecla/botón "Salir de la órbita" (S5: tecla S / botón "Salir" del HUD). */
  exitPressed: boolean;
  dt: number;
}

export interface OrbitParams {
  /** Tiempo sin recaptura tras expulsar o volver de un proyecto (S6). */
  cooldownDuration: number;
}

export interface OrbitResult {
  state: OrbitState;
  action: 'none' | 'enter' | 'eject';
}

interface V3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Avanza un frame la máquina de estados de la órbita:
 * - `free`: si `cooldown>0` lo descuenta y NO recaptura aunque esté dentro de
 *   la influencia (S6). Con cooldown agotado, entra en órbita al cruzar la esfera.
 * - `orbiting`: `enterPressed` entra (acción `enter`, gana si además hay
 *   `exitPressed`); `exitPressed` sale (acción `eject` → `ejecting`); salir de
 *   la influencia por alejamiento vuelve a `free`. El empuje NUNCA expulsa (S5).
 * - `ejecting`: descuenta el cooldown hasta volver a `free`.
 */
export function stepOrbit(prev: OrbitState, input: OrbitInput, params: OrbitParams): OrbitResult {
  const { insideInfluence, enterPressed, exitPressed, dt } = input;

  if (prev.phase === 'ejecting') {
    const cooldown = prev.cooldown - dt;
    if (cooldown > 0) return { state: { phase: 'ejecting', cooldown }, action: 'none' };
    return { state: { phase: 'free', cooldown: 0 }, action: 'none' };
  }

  if (prev.phase === 'orbiting') {
    if (enterPressed) return { state: prev, action: 'enter' };
    if (exitPressed) {
      return { state: { phase: 'ejecting', cooldown: params.cooldownDuration }, action: 'eject' };
    }
    if (!insideInfluence) return { state: { phase: 'free', cooldown: 0 }, action: 'none' };
    return { state: prev, action: 'none' };
  }

  // free
  if (prev.cooldown > 0) {
    const cooldown = Math.max(0, prev.cooldown - dt);
    // Si el cooldown se agota EN ESTE MISMO frame y ya está dentro de
    // influencia, recaptura de inmediato (sin esperar un frame extra).
    if (cooldown <= 0 && insideInfluence) {
      return { state: { phase: 'orbiting', cooldown: 0 }, action: 'none' };
    }
    return { state: { phase: 'free', cooldown }, action: 'none' };
  }
  if (insideInfluence) {
    return { state: { phase: 'orbiting', cooldown: 0 }, action: 'none' };
  }
  return { state: prev, action: 'none' };
}

/** Estado tras salir de un proyecto o al reanudar (S6, arregla Bug B): vuelo
 * libre con cooldown anti-recaptura del mismo planeta. */
export function freeAfterExit(params: OrbitParams): OrbitState {
  return { phase: 'free', cooldown: params.cooldownDuration };
}

/** Velocidad de expulsión: dirección radial centro→nave, normalizada y escalada por `strength`. */
export function ejectVelocity(center: V3, ship: V3, strength: number): V3 {
  const dx = ship.x - center.x;
  const dy = ship.y - center.y;
  const dz = ship.z - center.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return { x: 0, y: strength, z: 0 };
  const k = strength / len;
  return { x: dx * k, y: dy * k, z: dz * k };
}
```

- [ ] **Step 4: Ejecuta y confirma que pasa**

Run: `pnpm --filter @plataforma/shell exec vitest run src/space/orbit.test.ts`
Expected: PASS (17 tests).

**Nota:** este cambio ROMPE la compilación de `space-engine.ts` y `space-config.ts` (usan `grace`/`thrustActive`/`captureGrace`, que ya no existen). Eso se arregla en la Tarea 4 — es esperado que `pnpm --filter @plataforma/shell lint` falle hasta cerrar esa tarea.

- [ ] **Checkpoint (no commit).**

---

## Task 4: Cableado de S5+S6 en el motor — `space-engine.ts`, `ship-controller.ts`, `space-config.ts`, `hud.ts`

**Files:**
- Modify: `shell/src/space/space-config.ts:88-94` (bloque `ORBIT_CONFIG`)
- Modify: `shell/src/space/ship-controller.ts` (elimina `isThrusting`, añade `exitOrbitPressed`)
- Modify: `shell/src/space/hud.ts` (botón "Salir de la órbita" + nuevo campo `orbiting` en `update()`)
- Modify: `shell/src/space/space.css` (estilo del botón `.pp-exit`)
- Modify: `shell/src/space/space-engine.ts` (import, campo `orbit`, `enterProject`, `updateOrbit`, `mount`, llamada a `hud.update`)

- [ ] **Step 1: `space-config.ts` — quita `captureGraceSeconds`**

En `shell/src/space/space-config.ts`, reemplaza el bloque `ORBIT_CONFIG` (líneas 88-94) por:

```ts
/** Interacción orbital al aproximarse a un planeta (mejora #3, revisada en Hito 1 S5). */
export const ORBIT_CONFIG = {
  angularSpeed: 0.5, // [PERSONALIZABLE] rad/s de la órbita del satélite (~12.6 s por vuelta)
  ejectStrength: 900, // [UNIFORME] velocidad del impulso radial al salir (u/s); afinable
  ejectCooldownSeconds: 1.0, // [UNIFORME] tiempo sin recaptura tras salir de la órbita o volver de un proyecto (S5/S6)
};
```

- [ ] **Step 2: `ship-controller.ts` — elimina `isThrusting`, añade `exitOrbitPressed`**

En `shell/src/space/ship-controller.ts`, reemplaza:

```ts
  /** ¿Hay alguna tecla de empuje/strafe/nitro/freno activa? (rompe la órbita en #3). */
  get isThrusting(): boolean {
    const k = this.keys;
    return !!(
      k['KeyW'] || k['ArrowUp'] || k['KeyS'] || k['ArrowDown'] ||
      k['KeyA'] || k['ArrowLeft'] || k['KeyD'] || k['ArrowRight'] ||
      k['ShiftLeft'] || k['ShiftRight']
    ); // Space ya NO es empuje (pasó a "entrar"); Shift es nitro (sí rompe la órbita)
  }
```

por:

```ts
  /** Tecla "Salir de la órbita" (S5: S). En vuelo libre S sigue siendo freno;
   * en órbita `ShipController.update` no integra empuje/freno (ver rama
   * `orbiting`), así que leer KeyS aquí es seguro y no se pisa con el freno. */
  get exitOrbitPressed(): boolean {
    return !!this.keys['KeyS'];
  }
```

- [ ] **Step 3: `hud.ts` — botón "Salir" + campo `orbiting`**

En `shell/src/space/hud.ts`, dentro del `innerHTML` del constructor, reemplaza la línea del botón `.pp-enter`:

```html
        <button type="button" class="pp-enter" style="pointer-events:auto;cursor:pointer;background:transparent;border:1px solid rgba(230,168,23,0.5);color:#E6A817;font:inherit;padding:6px 14px;border-radius:6px;margin-top:8px;">Entrar al proyecto (Space/E)</button>
```

por (añade el botón `.pp-exit` a continuación):

```html
        <button type="button" class="pp-enter" style="pointer-events:auto;cursor:pointer;background:transparent;border:1px solid rgba(230,168,23,0.5);color:#E6A817;font:inherit;padding:6px 14px;border-radius:6px;margin-top:8px;">Entrar al proyecto (Space/E)</button>
        <button type="button" class="pp-exit" hidden style="pointer-events:auto;cursor:pointer;background:transparent;border:1px solid rgba(200,184,152,0.4);color:#C8B898;font:inherit;padding:6px 14px;border-radius:6px;margin-top:8px;margin-left:8px;">Salir de la órbita (S)</button>
```

Añade el campo privado y el callback público (junto a `private enterBtn: HTMLElement;` y `onEnter?: () => void;`):

```ts
  private enterBtn: HTMLElement;
  private exitBtn: HTMLElement;
  ...
  onEnter?: () => void;
  /** Se invoca al pulsar el botón "Salir de la órbita" (S5). */
  onExit?: () => void;
```

En el constructor, junto a `this.enterBtn = q('#projectPanel .pp-enter'); this.enterBtn.addEventListener(...)`, añade:

```ts
    this.exitBtn = q('#projectPanel .pp-exit');
    this.exitBtn.addEventListener('click', () => this.onExit?.());
```

Reemplaza la firma y el cuerpo de `update()` completos por:

```ts
  update(
    state: ShipState,
    info: {
      altitude: number;
      heading: number;
      approaching: { name: string; description?: string; blurb?: string } | null;
      dwellProgress: number;
      /** S5: true mientras la máquina de órbita esté en fase 'orbiting'. */
      orbiting: boolean;
    },
  ) {
    // Velocidad real, sin tope.
    this.speedValue.textContent = state.speed.toFixed(0);

    if (state.isNitro) {
      this.speedUnit.textContent = 'NITRO';
      this.speedUnit.style.color = 'var(--orange-ember)';
    } else {
      this.speedUnit.textContent = 'U/s';
      this.speedUnit.style.color = '';
    }

    // Altitud real y rumbo (formateadores puros).
    this.altValue.textContent = formatAltitude(info.altitude);
    this.headingValue.textContent = formatHeading(info.heading);

    // Estado de la reticula: idle vs aproximando con anillo de permanencia.
    const approaching = info.approaching != null;
    this.reticle.classList.toggle('approaching', approaching);
    if (approaching) {
      const a = info.approaching!;
      this.reticleLabel.textContent = info.orbiting ? `S · Salir de órbita · ${a.name}` : `Space/E · ${a.name}`;
      // Anillo lleno como marcador estático (la entrada es por tecla E, no por permanencia).
      this.dwellRing.style.strokeDashoffset = '0';
      // Panel de info del proyecto (esquina): nombre + descripción + texto editable.
      this.panelName.textContent = a.name;
      this.panelDesc.textContent = a.description ?? '';
      this.panelBlurb.textContent = a.blurb ?? '';
      this.projectPanel.classList.add('visible');
      this.exitBtn.hidden = !info.orbiting;
    } else {
      this.reticleLabel.textContent = '';
      this.dwellRing.style.strokeDashoffset = String(this.ringCircumference);
      this.projectPanel.classList.remove('visible');
      this.exitBtn.hidden = true;
    }
  }
```

- [ ] **Step 4: `space.css` — nada que añadir todavía**

El botón `.pp-exit` ya lleva estilos inline (igual que `.pp-enter`, patrón existente del archivo). No se necesita CSS nuevo en este paso.

- [ ] **Step 5: `space-engine.ts` — import, campo `orbit`, `mount`, `enterProject`, `updateOrbit`**

En `shell/src/space/space-engine.ts`, cambia el import de `orbit.ts`:

```ts
import { stepOrbit, ejectVelocity, type OrbitState } from './orbit';
```

por:

```ts
import { stepOrbit, ejectVelocity, freeAfterExit, type OrbitState } from './orbit';
```

Cambia el campo:

```ts
  private orbit: OrbitState = { phase: 'free', cooldown: 0, grace: 0 };
```

por:

```ts
  private orbit: OrbitState = { phase: 'free', cooldown: 0 };
  /** One-shot: botón "Salir de la órbita" del HUD (S5); se consume en `updateOrbit`. */
  private exitOrbitRequested = false;
```

**NO elimines todavía** el campo `private readonly orbitTmpVel = new THREE.Vector3();`: `beginOrbit` (sin tocar hasta la Tarea 6) todavía lo usa. Se elimina en la Tarea 6, cuando se reescribe `beginOrbit` y deja de necesitarlo.

En `mount()`, junto a `this.hud.onEnter = this.enterCurrentProject;`, añade:

```ts
    this.hud.onEnter = this.enterCurrentProject; // botón "Entrar" del panel de proyecto (#3)
    this.hud.onExit = this.exitOrbit; // botón "Salir de la órbita" del HUD (S5)
```

Reemplaza `updateOrbit` completo:

```ts
  // ── Interacción orbital (#3): máquina de estados libre/órbita/expulsión ──
  private updateOrbit(approaching: ApproachInfo | null, shipState: ShipState, delta: number) {
    const prevPhase = this.orbit.phase;
    const exitPressed = this.ship.exitOrbitPressed || this.exitOrbitRequested;
    this.exitOrbitRequested = false; // consumido este frame
    const r = stepOrbit(
      this.orbit,
      {
        insideInfluence: !!approaching,
        enterPressed: false, // la entrada al proyecto la dispara onKeyDown(E)/botón de forma síncrona (pestaña nueva)
        exitPressed,
        dt: delta,
      },
      { cooldownDuration: ORBIT_CONFIG.ejectCooldownSeconds },
    );
    this.orbit = r.state;

    if (prevPhase !== 'orbiting' && this.orbit.phase === 'orbiting' && approaching) {
      this.beginOrbit(approaching, shipState);
    }
    if (this.orbit.phase === 'orbiting' && approaching) {
      this.advanceOrbit(approaching, delta);
    }

    if (r.action === 'eject' && approaching) {
      this.ship.setOrbiting(false);
      const v = ejectVelocity(approaching.center, this.ship.object.position, ORBIT_CONFIG.ejectStrength);
      this.ship.applyImpulse(this.orbitImpulse.set(v.x, v.y, v.z));
    }
  }

  /** Botón "Salir de la órbita" del HUD (S5): marca la solicitud para el próximo `updateOrbit`. */
  private exitOrbit = () => {
    this.exitOrbitRequested = true;
  };
```

Reemplaza `enterProject`:

```ts
  /** Entrada al proyecto. COSTURA del circuito (#6): por ahora abre directo; #6 la envolverá. */
  private enterProject(app: AppInfo) {
    if (app.externalUrl) {
      window.open(app.externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    this.opts.onEnterApp(app);
  }
```

por:

```ts
  /** Entrada al proyecto. COSTURA del circuito (#6): por ahora abre directo; #6 la envolverá. */
  private enterProject(app: AppInfo) {
    if (app.externalUrl) {
      window.open(app.externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    // S6 (arregla Bug B): deja el estado orbital en vuelo libre con cooldown
    // anti-recaptura ANTES de pausar. Al volver (resume), WASD integra empuje
    // de inmediato — la nave ya no queda re-anclada al mismo planeta.
    this.orbit = freeAfterExit({ cooldownDuration: ORBIT_CONFIG.ejectCooldownSeconds });
    this.ship.setOrbiting(false);
    this.approachingApp = null;
    this.opts.onEnterApp(app);
  }
```

En la llamada a `this.hud.update(...)` dentro de `loop()`, añade el campo `orbiting`:

```ts
    this.hud.update(ship, {
      altitude,
      heading: ship.yaw,
      approaching: approaching
        ? {
            name: approaching.app.name,
            description: approaching.app.description,
            blurb: approaching.app.blurb,
          }
        : null,
      dwellProgress: solar.dwellProgress,
      orbiting: this.orbit.phase === 'orbiting',
    });
```

- [ ] **Step 6: Verifica que compila y los tests pasan**

Run: `pnpm --filter @plataforma/shell lint`
Expected: sin errores (ya no quedan referencias a `grace`/`thrustActive`/`captureGrace`/`isThrusting`; verifícalo con `grep -rn "thrustActive\|captureGrace\|isThrusting\|\.grace\b" shell/src` → sin resultados).

Run: `pnpm --filter @plataforma/shell test`
Expected: todos los tests en verde.

- [ ] **Checkpoint (no commit).**

---

## Task 5: `vec3-math.ts` + `orbit-frame.ts` (S3, lógica pura)

**Files:**
- Create: `shell/src/space/vec3-math.ts`
- Test: `shell/src/space/vec3-math.test.ts`
- Create: `shell/src/space/orbit-frame.ts`
- Test: `shell/src/space/orbit-frame.test.ts`

- [ ] **Step 1: Escribe `vec3-math.test.ts` (falla: el módulo no existe)**

```ts
import { describe, it, expect } from 'vitest';
import { sub, add, scale, cross, dot, length, normalize } from './vec3-math';

describe('vec3-math (helpers puros compartidos por orbit-frame/orbit-camera)', () => {
  it('sub resta componente a componente', () => {
    expect(sub({ x: 5, y: 3, z: 1 }, { x: 1, y: 1, z: 1 })).toEqual({ x: 4, y: 2, z: 0 });
  });

  it('add suma componente a componente', () => {
    expect(add({ x: 1, y: 2, z: 3 }, { x: 10, y: 20, z: 30 })).toEqual({ x: 11, y: 22, z: 33 });
  });

  it('scale multiplica cada componente por k', () => {
    expect(scale({ x: 1, y: -2, z: 3 }, 2)).toEqual({ x: 2, y: -4, z: 6 });
  });

  it('dot es el producto escalar', () => {
    expect(dot({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })).toBe(32);
  });

  it('cross es perpendicular a ambos operandos', () => {
    const a = { x: 1, y: 0, z: 0 };
    const b = { x: 0, y: 1, z: 0 };
    const c = cross(a, b);
    expect(c).toEqual({ x: 0, y: 0, z: 1 });
    expect(dot(c, a)).toBeCloseTo(0, 10);
    expect(dot(c, b)).toBeCloseTo(0, 10);
  });

  it('length es la norma euclídea', () => {
    expect(length({ x: 3, y: 4, z: 0 })).toBeCloseTo(5, 10);
  });

  it('normalize produce un vector unitario en la misma dirección', () => {
    const n = normalize({ x: 3, y: 4, z: 0 });
    expect(length(n)).toBeCloseTo(1, 10);
    expect(n.x).toBeCloseTo(0.6, 10);
    expect(n.y).toBeCloseTo(0.8, 10);
  });

  it('normalize de un vector ~0 no produce NaN (degenerado → vector nulo)', () => {
    const n = normalize({ x: 0, y: 0, z: 0 });
    expect(n).toEqual({ x: 0, y: 0, z: 0 });
    expect(Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z)).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecuta y confirma que falla**

Run: `pnpm --filter @plataforma/shell exec vitest run src/space/vec3-math.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementa `vec3-math.ts`**

```ts
/**
 * Vectores 3D puros (sin Three.js), compartidos por los módulos de geometría
 * orbital (orbit-frame.ts, orbit-camera.ts). Misma forma que THREE.Vector3
 * (campos x/y/z): un THREE.Vector3 se puede pasar directamente como V3.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export function sub(a: V3, b: V3): V3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function add(a: V3, b: V3): V3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function scale(a: V3, k: number): V3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}

export function cross(a: V3, b: V3): V3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function dot(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function length(a: V3): number {
  return Math.sqrt(dot(a, a));
}

const EPSILON = 1e-6;

/** Vector unitario; degenerado (longitud ~0) → vector nulo (evita NaN). */
export function normalize(a: V3): V3 {
  const len = length(a);
  if (len < EPSILON) return { x: 0, y: 0, z: 0 };
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}
```

- [ ] **Step 4: Ejecuta y confirma que pasa**

Run: `pnpm --filter @plataforma/shell exec vitest run src/space/vec3-math.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Escribe `orbit-frame.test.ts` (falla: el módulo no existe)**

```ts
import { describe, it, expect } from 'vitest';
import { buildOrbitBasis, orbitPlaneNormal } from './orbit-frame';
import { dot, length } from './vec3-math';

describe('buildOrbitBasis (S3 — arregla Bug D: órbita "inestable")', () => {
  const center = { x: 100, y: 0, z: 0 };
  const sun = { x: 0, y: 0, z: 0 };
  const ship = { x: 150, y: 20, z: 10 };

  it('produce una base ortonormal (U,V,N unitarios y mutuamente perpendiculares)', () => {
    const { U, V, N } = buildOrbitBasis({ center, ship, sun });
    expect(length(U)).toBeCloseTo(1, 6);
    expect(length(V)).toBeCloseTo(1, 6);
    expect(length(N)).toBeCloseTo(1, 6);
    expect(dot(U, V)).toBeCloseTo(0, 6);
    expect(dot(U, N)).toBeCloseTo(0, 6);
    expect(dot(V, N)).toBeCloseTo(0, 6);
  });

  it('es determinista: la misma entrada produce siempre el mismo plano', () => {
    const a = buildOrbitBasis({ center, ship, sun });
    const b = buildOrbitBasis({ center, ship, sun });
    expect(a).toEqual(b);
  });

  it('la dirección planeta→sol queda DENTRO del plano (perpendicular a N)', () => {
    const { N } = buildOrbitBasis({ center, ship, sun });
    const sunDir = { x: sun.x - center.x, y: sun.y - center.y, z: sun.z - center.z };
    expect(dot(sunDir, N)).toBeCloseTo(0, 4);
  });

  it('N NO depende de la posición de llegada de la nave (antes dependía de su VELOCIDAD — causa del Bug D)', () => {
    const shipA = { x: 100, y: 50, z: 30 };
    const shipB = { x: 130, y: -40, z: 5 };
    const a = buildOrbitBasis({ center, ship: shipA, sun });
    const b = buildOrbitBasis({ center, ship: shipB, sun });
    expect(a.N).toEqual(b.N);
  });

  it('caso degenerado: la nave está exactamente sobre el eje planeta-sol → sin NaN, sigue ortonormal', () => {
    const shipOnAxis = { x: 100, y: 0, z: 50 }; // mismo x,y que center; difiere solo en z (paralelo a N)
    const { U, V, N } = buildOrbitBasis({ center, ship: shipOnAxis, sun });
    for (const v of [U, V, N]) {
      expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).toBe(true);
      expect(length(v)).toBeCloseTo(1, 6);
    }
  });

  it('caso degenerado: sunDir paralelo al "up" del mundo usa el fallback y sigue siendo válido', () => {
    const centerAxis = { x: 0, y: 0, z: 0 };
    const sunAboveCenter = { x: 0, y: 500, z: 0 }; // sunDir = (0,1,0) = WORLD_UP exacto
    const shipAnywhere = { x: 10, y: 0, z: 0 };
    const { U, V, N } = buildOrbitBasis({ center: centerAxis, ship: shipAnywhere, sun: sunAboveCenter });
    for (const v of [U, V, N]) {
      expect(length(v)).toBeCloseTo(1, 6);
    }
    expect(dot(N, { x: 0, y: 1, z: 0 })).toBeCloseTo(0, 4);
  });
});

describe('orbitPlaneNormal', () => {
  it('es perpendicular a sunDir y unitaria', () => {
    const sunDir = { x: 1, y: 0, z: 0 };
    const n = orbitPlaneNormal(sunDir);
    expect(dot(n, sunDir)).toBeCloseTo(0, 6);
    expect(length(n)).toBeCloseTo(1, 6);
  });
});
```

- [ ] **Step 6: Ejecuta y confirma que falla**

Run: `pnpm --filter @plataforma/shell exec vitest run src/space/orbit-frame.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 7: Implementa `orbit-frame.ts`**

```ts
/**
 * Base ortonormal del plano orbital (S3 — arregla Bug D): el plano se deriva
 * del eje planeta→sol, NO de la velocidad de llegada de la nave, así que es
 * determinista y compone al sol en el encuadre (S4). Sin Three.js.
 */
import { type V3, sub, cross, dot, length, normalize } from './vec3-math';

export type { V3 };

export interface OrbitBasis {
  /** Radial inicial (ángulo 0 de la órbita), dentro del plano. */
  U: V3;
  /** Tangencial (sentido de avance), perpendicular a U y N. */
  V: V3;
  /** Normal del plano orbital. */
  N: V3;
}

const WORLD_UP: V3 = { x: 0, y: 1, z: 0 };
const WORLD_FORWARD: V3 = { x: 0, y: 0, z: -1 };
const EPSILON = 1e-6;

/**
 * Normal del plano orbital a partir de la dirección planeta→sol: perpendicular
 * a `sunDir` (así `sunDir` queda DENTRO del plano). La reutiliza
 * `orbit-camera.ts` para orientar el "up" de la cámara con el mismo plano.
 */
export function orbitPlaneNormal(sunDir: V3): V3 {
  let n = normalize(cross(sunDir, WORLD_UP));
  if (length(n) < EPSILON) {
    n = normalize(cross(sunDir, WORLD_FORWARD));
  }
  return n;
}

/**
 * Base {U,V,N} determinista y orientada al sol (misma entrada → mismo plano;
 * no depende de la velocidad de llegada, que era la causa del Bug D).
 */
export function buildOrbitBasis(args: { center: V3; ship: V3; sun: V3 }): OrbitBasis {
  const sunDir = normalize(sub(args.sun, args.center));
  const n = orbitPlaneNormal(sunDir);

  const radial = sub(args.ship, args.center);
  const radialAlongN = dot(radial, n);
  const radialOnPlane = sub(radial, {
    x: n.x * radialAlongN,
    y: n.y * radialAlongN,
    z: n.z * radialAlongN,
  });
  let u = normalize(radialOnPlane);
  if (length(u) < EPSILON) {
    u = normalize(cross(n, sunDir));
  }

  const v = cross(n, u);
  return { U: u, V: v, N: n };
}
```

- [ ] **Step 8: Ejecuta y confirma que pasa**

Run: `pnpm --filter @plataforma/shell exec vitest run src/space/orbit-frame.test.ts`
Expected: PASS (7 tests).

- [ ] **Checkpoint (no commit).**

---

## Task 6: Cableado de S3 en `space-engine.ts` (`beginOrbit` usa `buildOrbitBasis`)

**Files:**
- Modify: `shell/src/space/space-engine.ts`

- [ ] **Step 1: Añade el import**

Junto a `import { stepOrbit, ejectVelocity, freeAfterExit, type OrbitState } from './orbit';`, añade:

```ts
import { buildOrbitBasis } from './orbit-frame';
```

- [ ] **Step 2: Reemplaza `beginOrbit`**

```ts
  /** Captura: fija centro, radio (distancia de captura acotada) y el plano (radial × velocidad). */
  private beginOrbit(approaching: ApproachInfo, shipState: ShipState) {
    this.orbitCenter.copy(approaching.center);
    this.orbitU.copy(this.ship.object.position).sub(this.orbitCenter);
    const dist = this.orbitU.length() || 1;
    this.orbitRadius = Math.max(
      approaching.planetRadius * 1.5,
      Math.min(dist, approaching.influenceRadius),
    );
    this.orbitU.multiplyScalar(1 / dist); // radial unitario
    // Tangencial: velocidad de llegada sin su componente radial; si ~0, perpendicular cualquiera.
    this.orbitTmpVel.copy(shipState.velocity);
    this.orbitTmpVel.addScaledVector(this.orbitU, -this.orbitTmpVel.dot(this.orbitU));
    if (this.orbitTmpVel.lengthSq() < 1e-4) {
      const upish = Math.abs(this.orbitU.y) > 0.9;
      this.orbitTmpVel.set(upish ? 1 : 0, upish ? 0 : 1, 0);
      this.orbitTmpVel.addScaledVector(this.orbitU, -this.orbitTmpVel.dot(this.orbitU));
    }
    this.orbitV.copy(this.orbitTmpVel).normalize();
    this.orbitAngle = 0;
    this.ship.setOrbiting(true);
    // En órbita no hay control: libera el puntero para que el cursor se vea y pueda
    // clicar el botón "Entrar" del HUD.
    if (document.pointerLockElement) document.exitPointerLock();
  }
```

por:

```ts
  /** Captura: fija centro, radio (distancia acotada) y el plano orbital (S3: determinista, orientado al sol). */
  private beginOrbit(approaching: ApproachInfo) {
    this.orbitCenter.copy(approaching.center);
    const dist = this.ship.object.position.distanceTo(this.orbitCenter) || 1;
    this.orbitRadius = Math.max(
      approaching.planetRadius * 1.5,
      Math.min(dist, approaching.influenceRadius),
    );
    const basis = buildOrbitBasis({
      center: this.orbitCenter,
      ship: this.ship.object.position,
      sun: this.ramatzoSun.position,
    });
    this.orbitU.set(basis.U.x, basis.U.y, basis.U.z);
    this.orbitV.set(basis.V.x, basis.V.y, basis.V.z);
    this.orbitAngle = 0;
    this.ship.setOrbiting(true);
    // En órbita no hay control: libera el puntero para que el cursor se vea y pueda
    // clicar el botón "Entrar"/"Salir" del HUD.
    if (document.pointerLockElement) document.exitPointerLock();
  }
```

Actualiza la llamada en `updateOrbit` (dentro de la misma clase, ya reescrita en la Tarea 4): cambia

```ts
      this.beginOrbit(approaching, shipState);
```

por:

```ts
      this.beginOrbit(approaching);
```

Ahora que `beginOrbit` ya no usa `this.orbitTmpVel`, elimina esa declaración de campo (estaba junto a `orbitU`/`orbitV`/`orbitRadius`/`orbitAngle`):

```ts
  private readonly orbitTmpVel = new THREE.Vector3();
```

**Nota:** tras este cambio, el parámetro `shipState: ShipState` de `updateOrbit` queda sin uso dentro del cuerpo del método (ni `beginOrbit` ni `advanceOrbit` lo necesitan ya). NO cambies la firma de `updateOrbit` ni el call site `this.updateOrbit(approaching, ship, delta)` en `loop()`: `tsconfig.base.json` no activa `noUnusedParameters`, así que un parámetro de método sin usar no rompe `tsc --noEmit`. Déjalo tal cual.

- [ ] **Step 3: Verifica que compila y los tests pasan**

Run: `pnpm --filter @plataforma/shell lint`
Expected: sin errores.

Run: `pnpm --filter @plataforma/shell test`
Expected: todos en verde.

- [ ] **Checkpoint (no commit).**

---

## Task 7: `orbit-camera.ts` (S4, lógica pura)

**Files:**
- Create: `shell/src/space/orbit-camera.ts`
- Test: `shell/src/space/orbit-camera.test.ts`

- [ ] **Step 1: Escribe el test (falla: el módulo no existe)**

```ts
import { describe, it, expect } from 'vitest';
import { orbitCameraPose, type OrbitCameraParams } from './orbit-camera';
import { sub, dot, length } from './vec3-math';

const PARAMS: OrbitCameraParams = { distanceFactor: 5, targetSunBias: 0.4 };

describe('orbitCameraPose (S4 — composición planeta+sol en órbita)', () => {
  const center = { x: 1000, y: 0, z: 0 };
  const sun = { x: 0, y: 0, z: 0 };
  const planetRadius = 200;

  it('el sol queda en el semiespacio del FONDO respecto a la cámara (composición a contraluz)', () => {
    const pose = orbitCameraPose({ center, sun, planetRadius, params: PARAMS });
    const toSun = sub(sun, pose.position);
    const toTarget = sub(pose.target, pose.position);
    expect(dot(toSun, toTarget)).toBeGreaterThan(0);
  });

  it('la distancia cámara↔planeta es proporcional a planetRadius', () => {
    const poseSmall = orbitCameraPose({ center, sun, planetRadius: 100, params: PARAMS });
    const poseBig = orbitCameraPose({ center, sun, planetRadius: 400, params: PARAMS });
    const distSmall = length(sub(poseSmall.position, center));
    const distBig = length(sub(poseBig.position, center));
    expect(distBig).toBeCloseTo(distSmall * 4, 4);
  });

  it('el target está cerca del centro del planeta (a lo sumo unos pocos radios)', () => {
    const pose = orbitCameraPose({ center, sun, planetRadius, params: PARAMS });
    expect(length(sub(pose.target, center))).toBeLessThan(planetRadius * 2);
  });

  it('es determinista: misma entrada, misma salida', () => {
    const a = orbitCameraPose({ center, sun, planetRadius, params: PARAMS });
    const b = orbitCameraPose({ center, sun, planetRadius, params: PARAMS });
    expect(a).toEqual(b);
  });

  it('"up" es unitario y perpendicular a la dirección planeta→sol', () => {
    const pose = orbitCameraPose({ center, sun, planetRadius, params: PARAMS });
    const sunDir = sub(sun, center);
    expect(length(pose.up)).toBeCloseTo(1, 6);
    expect(dot(pose.up, sunDir)).toBeCloseTo(0, 3);
  });

  it('no produce NaN en un caso con el sol muy lejos en otro eje', () => {
    const pose = orbitCameraPose({
      center: { x: 0, y: 0, z: 0 },
      sun: { x: 0, y: 90000, z: 0 },
      planetRadius: 150,
      params: PARAMS,
    });
    for (const v of [pose.position, pose.target, pose.up]) {
      expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Ejecuta y confirma que falla**

Run: `pnpm --filter @plataforma/shell exec vitest run src/space/orbit-camera.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementa `orbit-camera.ts`**

```ts
/**
 * Geometría pura de la cámara en órbita (S4): durante la órbita, la cámara
 * encuadra el PLANETA con el SOL al fondo (composición a contraluz),
 * estable, sin perseguir a la nave. Sin Three.js.
 */
import { type V3, sub, add, scale, normalize } from './vec3-math';
import { orbitPlaneNormal } from './orbit-frame';

export interface OrbitCameraParams {
  /** Distancia cámara↔planeta, como múltiplo de `planetRadius`. */
  distanceFactor: number;
  /** Desplazamiento del target hacia el sol (fracción de `planetRadius`), para dejar aire en el encuadre. */
  targetSunBias: number;
}

export interface CameraPose {
  position: V3;
  target: V3;
  up: V3;
}

/**
 * Pose de cámara en órbita: se posiciona en el lado del planeta OPUESTO al
 * sol (a `planetRadius * distanceFactor` del centro) y mira hacia el planeta
 * con un pequeño desplazamiento del target hacia el sol — así el sol queda
 * "al fondo" del encuadre, detrás/alrededor del planeta (contraluz).
 */
export function orbitCameraPose(args: {
  center: V3;
  sun: V3;
  planetRadius: number;
  params: OrbitCameraParams;
}): CameraPose {
  const { center, sun, planetRadius, params } = args;
  const sunDir = normalize(sub(sun, center)); // planeta → sol
  const back = scale(sunDir, -1); // se aleja del sol: la cámara queda del lado opuesto
  const dist = planetRadius * params.distanceFactor;
  const position = add(center, scale(back, dist));
  const target = add(center, scale(sunDir, planetRadius * params.targetSunBias));
  const up = orbitPlaneNormal(sunDir);
  return { position, target, up };
}
```

- [ ] **Step 4: Ejecuta y confirma que pasa**

Run: `pnpm --filter @plataforma/shell exec vitest run src/space/orbit-camera.test.ts`
Expected: PASS (6 tests).

- [ ] **Checkpoint (no commit).**

---

## Task 8: Cableado de S4 — transición cámara persecución↔órbita en `space-engine.ts`

**Files:**
- Modify: `shell/src/space/chase-camera.ts` (getter `currentLookTarget`)
- Modify: `shell/src/space/space-config.ts` (bloque `CAMERA_CONFIG`)
- Modify: `shell/src/space/space-engine.ts` (import, campos, `loop()`, método nuevo)

- [ ] **Step 1: `chase-camera.ts` — expón el target actual**

En `shell/src/space/chase-camera.ts`, añade este getter después del método `update()`:

```ts
  /** Punto de mira calculado en el último `update()` (S4: base para la transición hacia la pose orbital). */
  get currentLookTarget(): THREE.Vector3 {
    return this.lookTarget;
  }
```

- [ ] **Step 2: `space-config.ts` — añade `CAMERA_CONFIG.orbit`**

Reemplaza:

```ts
/** Cámara de persecución (mejora #4: más cercana). */
export const CAMERA_CONFIG = {
  chaseOffset: { x: 0, y: 7, z: 24 }, // [PERSONALIZABLE] offset detrás/arriba de la nave (antes 0,9,34)
};
```

por:

```ts
/** Cámara de persecución (mejora #4: más cercana) y de composición orbital (S4). */
export const CAMERA_CONFIG = {
  chaseOffset: { x: 0, y: 7, z: 24 }, // [PERSONALIZABLE] offset detrás/arriba de la nave (antes 0,9,34)
  orbit: {
    distanceFactor: 5, // [PERSONALIZABLE] distancia cámara↔planeta, como múltiplo de planetRadius
    targetSunBias: 0.4, // [PERSONALIZABLE] desplaza el target hacia el sol (fracción de planetRadius); deja aire en el encuadre
    easeSeconds: 0.6, // [PERSONALIZABLE] constante de tiempo de la transición persecución↔órbita
  },
};
```

- [ ] **Step 3: `space-engine.ts` — import, campos, wiring en `loop()`**

Añade el import junto a los de `orbit-frame`:

```ts
import { orbitCameraPose } from './orbit-camera';
```

Añade estos campos junto a los de la interacción orbital (`private orbitAngle = 0;`):

```ts
  // ── Transición cámara persecución↔órbita (S4) ──
  private orbitCamBlend = 0; // 0=persecución, 1=pose orbital
  private readonly orbitCamPos = new THREE.Vector3();
  private readonly orbitCamTarget = new THREE.Vector3();
  private readonly orbitCamUp = new THREE.Vector3();
  private readonly blendedLookTarget = new THREE.Vector3();
```

En `loop()`, justo después de la línea `if (!this.pauseMenu.visible) this.updateOrbit(approaching, ship, delta);`, añade:

```ts
    if (!this.pauseMenu.visible) this.updateOrbit(approaching, ship, delta);
    this.updateOrbitCameraBlend(delta, approaching);
```

Añade el método nuevo (por ejemplo, justo debajo de `advanceOrbit`):

```ts
  /** S4: transición suave (lerp) entre la cámara de persecución y la pose orbital (sol+planeta). */
  private updateOrbitCameraBlend(delta: number, approaching: ApproachInfo | null) {
    const wantOrbitCam = this.orbit.phase === 'orbiting' && !!approaching;
    const blendRate = delta / CAMERA_CONFIG.orbit.easeSeconds;
    this.orbitCamBlend = wantOrbitCam
      ? Math.min(1, this.orbitCamBlend + blendRate)
      : Math.max(0, this.orbitCamBlend - blendRate);
    if (this.orbitCamBlend <= 0) return;

    const center = approaching ? approaching.center : this.orbitCenter;
    const planetRadius = approaching ? approaching.planetRadius : 1;
    const pose = orbitCameraPose({
      center: { x: center.x, y: center.y, z: center.z },
      sun: { x: this.ramatzoSun.position.x, y: this.ramatzoSun.position.y, z: this.ramatzoSun.position.z },
      planetRadius,
      params: CAMERA_CONFIG.orbit,
    });
    this.orbitCamPos.set(pose.position.x, pose.position.y, pose.position.z);
    this.orbitCamTarget.set(pose.target.x, pose.target.y, pose.target.z);
    this.orbitCamUp.set(pose.up.x, pose.up.y, pose.up.z);

    this.camera.position.lerp(this.orbitCamPos, this.orbitCamBlend);
    this.blendedLookTarget.copy(this.chaseCamera.currentLookTarget).lerp(this.orbitCamTarget, this.orbitCamBlend);
    this.camera.up.lerp(this.orbitCamUp, this.orbitCamBlend).normalize();
    this.camera.lookAt(this.blendedLookTarget);
  }
```

- [ ] **Step 4: Verifica que compila y los tests pasan**

Run: `pnpm --filter @plataforma/shell lint`
Expected: sin errores.

Run: `pnpm --filter @plataforma/shell test`
Expected: todos en verde.

- [ ] **Checkpoint (no commit).** La verificación de "feel" (encuadre correcto, sin tirones) se hace en runtime, Tarea 14.

---

## Task 9: `captureState` (S2, lógica pura) + recalibración de constantes

**Files:**
- Modify: `shell/src/space/orbits.ts`
- Modify: `shell/src/space/orbits.test.ts`
- Modify: `shell/src/space/space-config.ts` (`SOLAR_CONFIG.influenceFactor`, `ORBIT_CONFIG.approachHintFactor`)

- [ ] **Step 1: Añade el test a `orbits.test.ts` (falla: `captureState` no existe)**

Añade al final de `shell/src/space/orbits.test.ts`:

```ts
import { captureState } from './orbits';

describe('captureState (S2 — recalibra la captura, antes excesiva)', () => {
  const FACTORS = { influenceFactor: 3, approachHintFactor: 6 };
  const planetRadius = 100;

  it('dentro del radio de captura (influenceFactor) → capture', () => {
    expect(captureState(250, planetRadius, FACTORS)).toBe('capture');
    expect(captureState(300, planetRadius, FACTORS)).toBe('capture'); // borde inclusivo
  });

  it('entre captura y aviso → hint', () => {
    expect(captureState(301, planetRadius, FACTORS)).toBe('hint');
    expect(captureState(600, planetRadius, FACTORS)).toBe('hint'); // borde inclusivo
  });

  it('más allá del radio de aviso → far', () => {
    expect(captureState(601, planetRadius, FACTORS)).toBe('far');
    expect(captureState(10000, planetRadius, FACTORS)).toBe('far');
  });

  it('distancia 0 (nave en el centro) → capture', () => {
    expect(captureState(0, planetRadius, FACTORS)).toBe('capture');
  });
});
```

- [ ] **Step 2: Ejecuta y confirma que falla**

Run: `pnpm --filter @plataforma/shell exec vitest run src/space/orbits.test.ts`
Expected: FAIL — `captureState` no exportada.

- [ ] **Step 3: Implementa `captureState` en `orbits.ts`**

Añade al final de `shell/src/space/orbits.ts`:

```ts
export type CaptureState = 'far' | 'hint' | 'capture';

/**
 * Estado de aproximación a un planeta según la distancia (S2 — recalibra la
 * esfera de captura, antes excesiva). `capture` dispara la órbita (#3);
 * `hint` es SOLO aviso en el HUD (no interactúa); `far` no muestra nada.
 */
export function captureState(
  distance: number,
  planetRadius: number,
  factors: { influenceFactor: number; approachHintFactor: number },
): CaptureState {
  if (distance <= planetRadius * factors.influenceFactor) return 'capture';
  if (distance <= planetRadius * factors.approachHintFactor) return 'hint';
  return 'far';
}
```

- [ ] **Step 4: Ejecuta y confirma que pasa**

Run: `pnpm --filter @plataforma/shell exec vitest run src/space/orbits.test.ts`
Expected: PASS (todos los describe de `orbits.test.ts`).

- [ ] **Step 5: `space-config.ts` — recalibra `influenceFactor` y añade `approachHintFactor`**

En `SOLAR_CONFIG`, cambia:

```ts
  influenceFactor: 8, // [UNIFORME] gatillo de aproximación/captura; subido para que los planetas sean ALCANZABLES a esta escala (antes 4)
```

por:

```ts
  influenceFactor: 3, // [UNIFORME] gatillo de aproximación/captura (S2: recalibrado de 8 a 3 — el rango era excesivo; compensado por el aviso de ORBIT_CONFIG.approachHintFactor)
```

En `ORBIT_CONFIG`, añade un campo nuevo (queda así):

```ts
export const ORBIT_CONFIG = {
  angularSpeed: 0.5, // [PERSONALIZABLE] rad/s de la órbita del satélite (~12.6 s por vuelta)
  ejectStrength: 900, // [UNIFORME] velocidad del impulso radial al salir (u/s); afinable
  ejectCooldownSeconds: 1.0, // [UNIFORME] tiempo sin recaptura tras salir de la órbita o volver de un proyecto (S5/S6)
  approachHintFactor: 6, // [UNIFORME] radio de AVISO en el HUD (S2), múltiplo de planetRadius; > influenceFactor, solo aviso, no captura
};
```

- [ ] **Step 6: Verifica**

Run: `pnpm --filter @plataforma/shell test`
Expected: todos en verde (el cambio de `influenceFactor` de 8→3 no rompe ningún test existente: ningún test unitario depende de su valor numérico, solo la Tarea 10 lo consumirá en runtime).

- [ ] **Checkpoint (no commit).**

---

## Task 10: Cableado de S2 — aviso de aproximación en `solar-system.ts` + `hud.ts` + `space.css`

**Files:**
- Modify: `shell/src/space/solar-system.ts`
- Modify: `shell/src/space/hud.ts`
- Modify: `shell/src/space/space-engine.ts` (llamada a `hud.update`)
- Modify: `shell/src/space/space.css`

- [ ] **Step 1: `solar-system.ts` — usa `captureState`, añade `hint` a `SolarUpdate`**

Cambia el import:

```ts
import { planetLayout, orbitPosition, planetWorldCenter } from './orbits';
```

por:

```ts
import { planetLayout, orbitPosition, planetWorldCenter, captureState } from './orbits';
```

Cambia:

```ts
import { SOLAR_CONFIG } from './space-config';
```

por:

```ts
import { SOLAR_CONFIG, ORBIT_CONFIG } from './space-config';
```

Añade la interfaz `ApproachHint` junto a `ApproachInfo`:

```ts
export interface ApproachHint {
  app: AppInfo;
  distance: number;
}
```

Añade `hint` a `SolarUpdate`:

```ts
export interface SolarUpdate {
  approaching: ApproachInfo | null;
  /** S2: planeta en radio de AVISO (más amplio que la captura), sin interacción. */
  hint: ApproachHint | null;
  dwellProgress: number;
  entered: AppInfo | null;
}
```

Añade la constante junto a `const INFLUENCE_FACTOR = SOLAR_CONFIG.influenceFactor;`:

```ts
const HINT_FACTOR = ORBIT_CONFIG.approachHintFactor;
```

Reemplaza el cuerpo de `update()` completo:

```ts
  update(elapsed: number, delta: number, shipPos: THREE.Vector3): SolarUpdate {
    let nearestCapture: SolarPlanet | null = null;
    let nearestCaptureDist = Infinity;
    let nearestCaptureCenter: THREE.Vector3 | null = null;
    let nearestHint: SolarPlanet | null = null;
    let nearestHintDist = Infinity;

    for (const p of this.planets) {
      const pos = orbitPosition(p.radius, p.inclination, p.phase, p.speed, elapsed);
      p.mesh.position.set(pos.x, pos.y, pos.z);
      p.mesh.rotation.y += 0.05 * delta;
      const t = p.mat.uniforms['uTime'];
      if (t) t.value = elapsed;

      const world = planetWorldCenter(this.systemGroup.position, p.mesh.position);
      this.tmpWorld.set(world.x, world.y, world.z);
      const dist = this.tmpWorld.distanceTo(shipPos);
      const state = captureState(dist, p.planetRadius, {
        influenceFactor: INFLUENCE_FACTOR,
        approachHintFactor: HINT_FACTOR,
      });
      if (state === 'capture' && dist < nearestCaptureDist) {
        nearestCapture = p;
        nearestCaptureDist = dist;
        nearestCaptureCenter = this.tmpWorld.clone();
      } else if (state === 'hint' && dist < nearestHintDist) {
        nearestHint = p;
        nearestHintDist = dist;
      }
    }

    const approaching: ApproachInfo | null = nearestCapture
      ? {
          app: nearestCapture.app,
          distance: nearestCaptureDist,
          influenceRadius: nearestCapture.influenceRadius,
          center: nearestCaptureCenter!,
          planetRadius: nearestCapture.planetRadius,
        }
      : null;

    const hint: ApproachHint | null =
      !approaching && nearestHint ? { app: nearestHint.app, distance: nearestHintDist } : null;

    return { approaching, hint, dwellProgress: 0, entered: null };
  }
```

- [ ] **Step 2: `hud.ts` — añade `hint` a `update()`**

Cambia la firma de `update()` (de la Tarea 4) añadiendo el campo `hint`:

```ts
  update(
    state: ShipState,
    info: {
      altitude: number;
      heading: number;
      approaching: { name: string; description?: string; blurb?: string } | null;
      /** S2: planeta en radio de aviso, sin interacción todavía. */
      hint: { name: string } | null;
      dwellProgress: number;
      orbiting: boolean;
    },
  ) {
```

Y el cuerpo (mismo método, añade la rama `else if`):

```ts
    const approaching = info.approaching != null;
    this.reticle.classList.toggle('approaching', approaching);
    this.reticle.classList.toggle('hinting', !approaching && info.hint != null);
    if (approaching) {
      const a = info.approaching!;
      this.reticleLabel.textContent = info.orbiting ? `S · Salir de órbita · ${a.name}` : `Space/E · ${a.name}`;
      this.dwellRing.style.strokeDashoffset = '0';
      this.panelName.textContent = a.name;
      this.panelDesc.textContent = a.description ?? '';
      this.panelBlurb.textContent = a.blurb ?? '';
      this.projectPanel.classList.add('visible');
      this.exitBtn.hidden = !info.orbiting;
    } else if (info.hint) {
      this.reticleLabel.textContent = info.hint.name;
      this.dwellRing.style.strokeDashoffset = String(this.ringCircumference);
      this.projectPanel.classList.remove('visible');
      this.exitBtn.hidden = true;
    } else {
      this.reticleLabel.textContent = '';
      this.dwellRing.style.strokeDashoffset = String(this.ringCircumference);
      this.projectPanel.classList.remove('visible');
      this.exitBtn.hidden = true;
    }
```

- [ ] **Step 3: `space-engine.ts` — pasa `hint` a `hud.update()`**

En la llamada a `this.hud.update(...)` dentro de `loop()`, añade el campo `hint` (usa `solar.hint`, ya disponible de la variable `solar` existente):

```ts
    this.hud.update(ship, {
      altitude,
      heading: ship.yaw,
      approaching: approaching
        ? {
            name: approaching.app.name,
            description: approaching.app.description,
            blurb: approaching.app.blurb,
          }
        : null,
      hint: solar.hint ? { name: solar.hint.app.name } : null,
      dwellProgress: solar.dwellProgress,
      orbiting: this.orbit.phase === 'orbiting',
    });
```

- [ ] **Step 4: `space.css` — estilo del aviso (dim, sin el glow ámbar de "approaching")**

Añade después de la regla `#reticle.approaching .reticle-label { opacity: 1; }`:

```css
/* S2: aviso de aproximación (radio mayor que la captura) — más discreto que "approaching" */
#reticle.hinting .reticle-label {
  opacity: 0.75;
  color: var(--space-text-2);
  text-shadow: 0 1px 2px #000;
}
```

- [ ] **Step 5: Verifica**

Run: `pnpm --filter @plataforma/shell lint`
Expected: sin errores.

Run: `pnpm --filter @plataforma/shell test`
Expected: todos en verde.

- [ ] **Checkpoint (no commit).**

---

## Task 11: `dampedFollow` (S7, lógica pura) + recalibración de mirada

**Files:**
- Modify: `shell/src/space/flight-math.ts`
- Modify: `shell/src/space/flight-math.test.ts`
- Modify: `shell/src/space/space-config.ts` (`CONTROL_CONFIG`)

- [ ] **Step 1: Añade el test a `flight-math.test.ts` (falla: `dampedFollow` no existe)**

Lee primero `shell/src/space/flight-math.test.ts` completo para no romper los `describe` existentes de `bankFromYawRate`/`approachBrakeFactor`/`limitAngularStep`, y añade al final:

```ts
import { dampedFollow } from './flight-math';

describe('dampedFollow (S7 — arregla la brusquedad de la mirada)', () => {
  it('converge hacia target tras varios pasos', () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = dampedFollow(v, 10, 12, 1 / 60);
    expect(v).toBeCloseTo(10, 3);
  });

  it('con delta=0 no se mueve', () => {
    expect(dampedFollow(3, 10, 12, 0)).toBeCloseTo(3, 10);
  });

  it('damp alto en un paso grande se aproxima al valor objetivo (casi 1:1)', () => {
    const v = dampedFollow(0, 10, 12, 1);
    // exp(-12) ≈ 6.14e-6 → error absoluto ≈ 6.14e-5; toBeCloseTo(10,4) exige
    // error < 5e-5 y por eso NO alcanza (falla por un margen de ~1e-5). 3
    // dígitos (tolerancia 5e-4) sí lo cubre con holgura.
    expect(v).toBeCloseTo(10, 3);
  });

  it('nunca overshoot: el resultado siempre queda entre current y target', () => {
    expect(dampedFollow(5, 2, 12, 0.5)).toBeGreaterThanOrEqual(2);
    expect(dampedFollow(5, 2, 12, 0.5)).toBeLessThanOrEqual(5);
    expect(dampedFollow(2, 5, 12, 0.5)).toBeGreaterThanOrEqual(2);
    expect(dampedFollow(2, 5, 12, 0.5)).toBeLessThanOrEqual(5);
  });

  it('es estable con delta variable (no diverge)', () => {
    let v = 0;
    for (const d of [0.05, 0.001, 0.1, 0.02, 0.2]) {
      v = dampedFollow(v, 10, 12, d);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(10);
    }
  });
});
```

- [ ] **Step 2: Ejecuta y confirma que falla**

Run: `pnpm --filter @plataforma/shell exec vitest run src/space/flight-math.test.ts`
Expected: FAIL — `dampedFollow` no exportada.

- [ ] **Step 3: Implementa `dampedFollow` en `flight-math.ts`**

Añade al final de `shell/src/space/flight-math.ts`:

```ts
/**
 * Paso bajo exponencial (S7 — arregla la brusquedad de la mirada): desliza
 * `current` hacia `target` con constante `damp` (mayor = converge más rápido).
 * Estable con `delta` variable; nunca sobrepasa `target`.
 */
export function dampedFollow(current: number, target: number, damp: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-damp * delta));
}
```

- [ ] **Step 4: Ejecuta y confirma que pasa**

Run: `pnpm --filter @plataforma/shell exec vitest run src/space/flight-math.test.ts`
Expected: PASS (todos los tests del archivo, incluidos los preexistentes).

- [ ] **Step 5: `space-config.ts` — recalibra `CONTROL_CONFIG`**

Reemplaza:

```ts
export const CONTROL_CONFIG = {
  sensitivity: 0.0022, // [PERSONALIZABLE #5] rad de yaw/pitch por px de movimiento del ratón
  maxLookRate: 30, // [PERSONALIZABLE #5] velocidad angular máx. de mirada (rad/s); recorta solo picos bruscos
  acceleration: 700, // [PERSONALIZABLE #5] empuje continuo (u/s²); subido para el sistema ×5 (antes 140)
  strafeAccel: 450, // [PERSONALIZABLE #5] aceleración lateral A/D (antes 90)
  nitroMultiplier: 6, // [PERSONALIZABLE #5] multiplicador de empuje con Space
};
```

por:

```ts
export const CONTROL_CONFIG = {
  sensitivity: 0.0022, // [PERSONALIZABLE] rad de yaw/pitch por px de movimiento del ratón
  lookDamp: 12, // [PERSONALIZABLE] suavizado de paso bajo de la mirada (S7); mayor = converge más rápido
  maxLookRate: 8, // [PERSONALIZABLE] velocidad angular máx. de mirada (rad/s); recorta solo picos bruscos (S7: antes 30, casi no actuaba)
  acceleration: 700, // [PERSONALIZABLE] empuje continuo (u/s²); subido para el sistema ×5 (antes 140)
  strafeAccel: 450, // [PERSONALIZABLE] aceleración lateral A/D (antes 90)
  nitroMultiplier: 6, // [PERSONALIZABLE] multiplicador de empuje con Shift
};
```

- [ ] **Step 6: Verifica**

Run: `pnpm --filter @plataforma/shell test`
Expected: todos en verde.

- [ ] **Checkpoint (no commit).**

---

## Task 12: Cableado de S7 en `ship-controller.ts`

**Files:**
- Modify: `shell/src/space/ship-controller.ts`

- [ ] **Step 1: Import y campo**

Cambia:

```ts
import { bankFromYawRate, limitAngularStep } from './flight-math';
```

por:

```ts
import { bankFromYawRate, limitAngularStep, dampedFollow } from './flight-math';
```

Añade el campo junto a `maxLookRate = CONTROL_CONFIG.maxLookRate;`:

```ts
  maxLookRate = CONTROL_CONFIG.maxLookRate; // rad/s; límite de velocidad angular de la mirada (recorta picos)
  lookDamp = CONTROL_CONFIG.lookDamp; // S7: suavizado de paso bajo antes del límite de velocidad angular
```

- [ ] **Step 2: Usa `dampedFollow` en `update()`**

Reemplaza:

```ts
    // Desliza la mirada aplicada hacia el objetivo crudo del ratón, recortando solo los
    // picos que superan maxLookRate (por debajo del umbral es 1:1 exacto, sin lag).
    this.yaw = limitAngularStep(this.yaw, this.rawYaw, this.maxLookRate, delta);
    this.pitch = limitAngularStep(this.pitch, this.rawPitch, this.maxLookRate, delta);
```

por:

```ts
    // S7: la mirada aplicada persigue el objetivo crudo del ratón con un paso
    // bajo real (dampedFollow, arregla la brusquedad), y el resultado se acota
    // con limitAngularStep para recortar solo picos residuales muy bruscos.
    const dampedYaw = dampedFollow(this.yaw, this.rawYaw, this.lookDamp, delta);
    this.yaw = limitAngularStep(this.yaw, dampedYaw, this.maxLookRate, delta);
    const dampedPitch = dampedFollow(this.pitch, this.rawPitch, this.lookDamp, delta);
    this.pitch = limitAngularStep(this.pitch, dampedPitch, this.maxLookRate, delta);
```

- [ ] **Step 3: Verifica**

Run: `pnpm --filter @plataforma/shell lint`
Expected: sin errores.

Run: `pnpm --filter @plataforma/shell test`
Expected: todos en verde.

- [ ] **Checkpoint (no commit).** El "feel" del suavizado se valora en runtime, Tarea 14.

---

## Task 13: Persistencia de sesión (S8, arregla Bug A)

**Files:**
- Modify: `shell/src/services/auth-client.ts`
- Test: `shell/src/services/auth-client.test.ts` (nuevo)

**Decisión de implementación (documentada, difiere ligeramente del spec en la forma, no en el fondo):** el spec sugiere Vitest `jsdom` para este archivo; el proyecto no tiene `jsdom` como dependencia y `AuthClient` no toca el DOM (solo `localStorage`/`sessionStorage`/`fetch`, todos mockeables como globals). Se mantiene `environment: 'node'` (sin añadir dependencias) y se mockean esos 3 globals con `vi.stubGlobal`.

- [ ] **Step 1: Escribe `auth-client.test.ts` (falla: `AuthClient` no se exporta / comportamiento nuevo no existe)**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const STORAGE_KEY = 'plataforma_token';

// `function` (no `const`/arrow) para que el hoisting normal de JS la deje
// disponible desde el arranque del módulo, incluida la llamada a vi.hoisted
// de abajo (el transform de Vitest reubica ESA llamada antes que los imports,
// pero no reordena declaraciones de función — el hoisting nativo sí cubre eso).
function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

// `auth-client.ts` instancia `export const authClient = new AuthClient()` a
// nivel de módulo, y el constructor lee `localStorage`/`sessionStorage` de
// inmediato. Con `environment: 'node'` esos globals no existen hasta que se
// stubean — y `vi.stubGlobal` en `beforeEach` corre DESPUÉS de que Vitest
// resuelva los imports (fase de colección), demasiado tarde para el import de
// abajo. `vi.hoisted` sí se reubica ANTES de los imports: lo usamos para dejar
// los 3 globals listos antes de que `import './auth-client'` se ejecute.
vi.hoisted(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = makeStorage();
  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = makeStorage();
  (globalThis as unknown as { fetch: unknown }).fetch = vi.fn();
});

import { AuthClient } from './auth-client';

describe('AuthClient (S8 — persistencia de sesión, arregla Bug A)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage());
    vi.stubGlobal('sessionStorage', makeStorage());
    vi.stubGlobal('fetch', vi.fn());
  });

  it('subscribe reemite el estado actual de inmediato (sin esperar a me())', () => {
    const client = new AuthClient();
    const received: unknown[] = [];
    client.subscribe((state) => received.push(state));
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ token: null, user: null });
  });

  it('rehidrata el usuario desde localStorage al construirse (sin llamar a me())', () => {
    const persisted = { token: 'tok-123', user: { id: '1', email: 'a@b.com', name: 'A', role: 'user' } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    const client = new AuthClient();
    expect(client.getState()).toEqual(persisted);
  });

  it('migra una sesión previa en sessionStorage a localStorage y limpia el rastro viejo', () => {
    const persisted = { token: 'tok-456', user: { id: '2', email: 'c@d.com', name: 'C', role: 'user' } };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    const client = new AuthClient();
    expect(client.getState()).toEqual(persisted);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(persisted));
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('JSON corrupto en storage no revienta: arranca sin sesión', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const client = new AuthClient();
    expect(client.getState()).toEqual({ token: null, user: null });
  });

  it('me(): un fallo de RED (fetch rechaza) NO cierra la sesión', async () => {
    const persisted = { token: 'tok-789', user: { id: '3', email: 'e@f.com', name: 'E', role: 'user' } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    const client = new AuthClient();
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network down'));
    await expect(client.me()).rejects.toThrow();
    expect(client.getState()).toEqual(persisted);
  });

  it('me(): una respuesta 401 explícita SÍ cierra la sesión', async () => {
    const persisted = { token: 'tok-bad', user: { id: '4', email: 'g@h.com', name: 'G', role: 'user' } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    const client = new AuthClient();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ success: false, error: 'invalid or expired token' }),
    });
    await expect(client.me()).rejects.toThrow();
    expect(client.getState()).toEqual({ token: null, user: null });
  });

  it('me(): un 500 del servidor (success:false, no 401) NO cierra la sesión', async () => {
    const persisted = { token: 'tok-500', user: { id: '5', email: 'i@j.com', name: 'I', role: 'user' } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    const client = new AuthClient();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 500,
      json: async () => ({ success: false, error: 'internal error' }),
    });
    await expect(client.me()).rejects.toThrow();
    expect(client.getState()).toEqual(persisted);
  });

  it('me() exitoso actualiza el user y persiste', async () => {
    const persisted = { token: 'tok-ok', user: { id: '6', email: 'k@l.com', name: 'K old', role: 'user' } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    const client = new AuthClient();
    const fresh = { id: '6', email: 'k@l.com', name: 'K new', role: 'user' };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, data: fresh }),
    });
    const result = await client.me();
    expect(result).toEqual(fresh);
    expect(client.getState().user).toEqual(fresh);
  });
});
```

- [ ] **Step 2: Ejecuta y confirma que falla**

Run: `pnpm --filter @plataforma/shell exec vitest run src/services/auth-client.test.ts`
Expected: FAIL — `AuthClient` no se exporta desde el módulo (o comportamiento de `subscribe`/`me()`/storage no coincide).

- [ ] **Step 3: Reescribe `auth-client.ts` completo**

```ts
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

export interface AuthState {
  token: string | null;
  user: User | null;
}

type AuthListener = (state: AuthState) => void;

const API_BASE = '/api';
const STORAGE_KEY = 'plataforma_token';

export class AuthClient {
  private state: AuthState = { token: null, user: null };
  private listeners: Set<AuthListener> = new Set();
  private refreshInterval: number | null = null;

  constructor() {
    // S8 (arregla Bug A): persistencia en localStorage (sobrevive recargas y
    // pestañas nuevas). Migración desde el esquema previo (sessionStorage):
    // si no hay nada en localStorage pero sí en sessionStorage, se adopta y
    // se limpia el rastro viejo.
    const fromLocal = localStorage.getItem(STORAGE_KEY);
    const fromSession = sessionStorage.getItem(STORAGE_KEY);
    const raw = fromLocal ?? fromSession;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.state = parsed as AuthState;
        }
      } catch {
        // JSON corrupto: arranca sin sesión.
      }
    }
    if (fromSession) sessionStorage.removeItem(STORAGE_KEY);
    if (this.state.token) this.persist();
  }

  getState(): AuthState {
    return { ...this.state };
  }

  isAuthenticated(): boolean {
    return !!this.state.token;
  }

  /** S8: reemite el estado actual de inmediato al suscribirse, para que el
   * usuario rehidratado en el constructor no dependa de que `me()` resuelva
   * (arregla Bug A: re-pedía login en un montaje fresco). */
  subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((l) => l(state));
  }

  private persist() {
    if (this.state.token) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  async login(email: string, password: string): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const body = await res.json();
    if (!body.success) {
      throw new Error(body.error || 'Login failed');
    }

    this.state = { token: body.data.token, user: body.data.user };
    this.persist();
    this.startRefresh();
    this.notify();
    return body.data.user;
  }

  async register(email: string, name: string, password: string): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password }),
    });

    const body = await res.json();
    if (!body.success) {
      throw new Error(body.error || 'Registration failed');
    }

    this.state = { token: body.data.token, user: body.data.user };
    this.persist();
    this.startRefresh();
    this.notify();
    return body.data.user;
  }

  async me(): Promise<User> {
    if (!this.state.token) {
      throw new Error('No token');
    }

    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${this.state.token}` },
    });

    const body = await res.json();
    if (!body.success) {
      // S8 (arregla Bug A): solo una respuesta 401 EXPLÍCITA es sesión
      // inválida de verdad (backend/internal/handler/middleware.go y
      // auth_handler.go: TODAS las rutas de fallo de /auth/me devuelven 401).
      // Cualquier otro fallo (500, etc.) es transitorio del servidor: NO
      // cierra la sesión. Un fallo de RED (fetch rechaza) ni siquiera llega
      // aquí — se propaga antes, sin togar el estado.
      if (res.status === 401) {
        this.logout();
      }
      throw new Error(body.error || 'Session expired');
    }

    this.state = { ...this.state, user: body.data };
    this.persist();
    this.notify();
    return body.data;
  }

  logout() {
    this.state = { token: null, user: null };
    this.persist();
    this.stopRefresh();
    this.notify();
  }

  getToken(): string | null {
    return this.state.token;
  }

  private startRefresh() {
    this.stopRefresh();
    this.refreshInterval = window.setInterval(() => {
      this.me().catch(() => {});
    }, 15 * 60 * 1000);
  }

  private stopRefresh() {
    if (this.refreshInterval !== null) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
}

export const authClient = new AuthClient();
```

**Nota sobre el cambio en `startRefresh`:** antes, el intervalo de refresco llamaba `this.me().catch(() => this.logout())` — deslogueaba ante CUALQUIER fallo del refresco periódico (incluido un simple corte de red de un instante). Con la lógica nueva, `me()` YA decide por sí sola cuándo desloguear (solo 401 explícito), así que el `.catch()` del intervalo pasa a ser un no-op (`() => {}`) — evita el doble manejo de la misma decisión en dos sitios.

- [ ] **Step 4: Ejecuta y confirma que pasa**

Run: `pnpm --filter @plataforma/shell exec vitest run src/services/auth-client.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Verifica que no rompiste el resto de la suite**

Run: `pnpm --filter @plataforma/shell lint`
Expected: sin errores (`shell-app.ts` sigue compilando: no se tocó, `subscribe`/`getState`/`me`/`logout`/`getToken` mantienen su forma pública).

Run: `pnpm --filter @plataforma/shell test`
Expected: todos en verde.

- [ ] **Checkpoint (no commit).**

---

## Task 14: Verificación final, reporte del hito y ÚNICO commit

**Files:**
- Create: `docs/superpowers/notes/2026-07-04-hito-1-reporte.md`
- (sin más cambios de código — esta tarea es de verificación)

- [ ] **Step 1: Suite completa en verde**

Run: `pnpm --filter @plataforma/shell test`
Expected: PASS — anota el número total de tests (esperado: los 186 del Hito 0 + los nuevos de esta plan: ~17 orbit + 3 orbits/planetWorldCenter + 4 orbits/captureState + 8 vec3-math + 7 orbit-frame + 6 orbit-camera + 6 flight-math/dampedFollow + 8 auth-client ≈ 245).

Run: `pnpm --filter @plataforma/shell lint`
Expected: PASS, sin errores de tsc.

Run: `pnpm --filter @plataforma/shell build`
Expected: build OK; anota el nuevo hash de `index-*.js` y `space-engine-*.js` en `dist/`.

Run (si se tocó `services/space-server` — NO se tocó en este hito, omite este paso): N/A.

- [ ] **Step 2: Verificación manual de los 4 bugs con el arnés dev**

Crea el arnés dev-only (se borra antes de comitear, ver Step 5):

`shell/debug.html`:
```html
<!DOCTYPE html>
<!-- ARNÉS DEV-ONLY — NO COMMITEAR. Borrar tras usar (junto con src/debug-space.ts). -->
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <title>Ramatzo · DEBUG espacio</title>
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #0a0503; }
    </style>
    <script type="module" src="/src/debug-space.ts"></script>
  </head>
  <body></body>
</html>
```

`shell/src/debug-space.ts`:
```ts
// ARNÉS DEV-ONLY — NO COMMITEAR. Borrar tras usar (junto con shell/debug.html).
// pnpm --filter @plataforma/shell dev --port 5311 --strictPort → http://localhost:5311/debug.html
import './styles/themes.css';
import './components/shell-space';
import type { AppInfo } from './services/protocol';
import type { ShellSpace } from './components/shell-space';

const APPS: AppInfo[] = [
  { id: 'dashboard', name: 'Dashboard Comercial', description: 'Métricas', blurb: 'Panel comercial.', icon: 'bar-chart', route: '/dashboard', src: '/apps/dashboard/', version: '1.0.0', sandbox: '', category: 'Analítica', tags: [], enabled: true },
  { id: 'viewer-3d', name: 'Visor 3D', description: 'Visor', blurb: 'Explorador 3D.', icon: 'cube', route: '/viewer-3d', src: '/apps/viewer-3d/', version: '1.0.0', sandbox: '', category: 'Herramientas', tags: [], enabled: true },
  { id: 'combate-3d', name: 'Combate 3D', description: 'Combate', blurb: 'Arena vehicular.', icon: 'target', route: '/combate-3d', src: '/apps/combate-3d/', version: '1.0.0', sandbox: '', category: 'Juegos', tags: [], enabled: true },
];

const el = document.createElement('shell-space') as ShellSpace;
el.apps = APPS;
el.theme = 'dark';
el.user = { id: 'debug', name: 'Piloto Debug' };
document.body.appendChild(el);

const w = window as unknown as { __space: unknown };
w.__space = {
  el,
  get engine() {
    return (el as unknown as { engine: unknown }).engine;
  },
  step(frames = 60, dtMs = 16) {
    const e = (el as unknown as { engine: { running: boolean; loop: (t: number) => void } | null }).engine;
    if (!e) return 'engine aún no montado';
    e.running = true;
    let t = performance.now();
    for (let i = 0; i < frames; i++) {
      t += dtMs;
      e.loop(t);
    }
    return `loop conducido x${frames}`;
  },
};
```

Arranca el arnés (`pnpm --filter @plataforma/shell dev --port 5311 --strictPort`) y ábrelo en una pestaña de navegador REAL (no headless — usa el preview tool si está disponible; en pestaña oculta el rAF se congela). Verifica, dirigiendo la nave con WASD/ratón (o `window.__space.step(N)` si hace falta conducir el loop a mano):

- [ ] **Bug C (planetas que desaparecen):** vuela en línea recta con Shift (nitro) durante ~20-30s reales hasta que `worldOffset` haya rebaseado varias veces (`window.__space.engine.worldOffset` cambia de `(0,0,0)`). Confirma que los planetas siguen siendo visibles (no se desvanecen) tanto antes como después del rebase.
- [ ] **Bug D (órbita inestable):** acércate a un planeta hasta capturar (dentro de `influenceRadius = planetRadius*3`). Confirma que la órbita mantiene un plano ESTABLE (no cambia de orientación entre capturas) y que el sol aparece en la composición de la cámara.
- [ ] **Bug B (no-reentrada):** con la nave en órbita, pulsa Space/E para entrar al proyecto (esto monta `<shell-cockpit>`); pulsa "Volver al espacio". Confirma que la nave queda en VUELO LIBRE (WASD responde de inmediato, no sigue orbitando) y que, tras alejarte, puedes capturar OTRO planeta distinto.
- [ ] **Bug A (re-pide login):** este bug requiere el backend real (login) — verifícalo en el Step 4 (runtime Docker), no en el arnés dev (que monta `shell-space` directo, sin `shell-app`/`shell-login`).
- [ ] **Sensación nueva (S2/S5/S7):** confirma que la captura es más ceñida (rango más corto que antes), que en órbita solo funcionan "Entrar" (E) y "Salir" (S/botón HUD) — el empuje mantenido YA NO expulsa —, y que los giros de cámara en vuelo libre son suaves (sin el salto brusco de antes).

- [ ] **Step 3: Borra el arnés (obligatorio antes de comitear)**

Run: `rm shell/debug.html shell/src/debug-space.ts` (o `Remove-Item` en PowerShell). Confirma con `git status --short shell/` que no quedan rastros.

- [ ] **Step 4: Verificación runtime real — Bug A (sesión) + hash del bundle**

Desde `deploy/`, redespliega SOLO el shell (no se tocó backend/space-server en este hito):

PowerShell: `cd deploy; .\ejec-shell.bat`

Expected: el script imprime el nuevo hash de `index-*.js` (debe haber CAMBIADO respecto al hash servido antes de este hito — anótalo).

Abre `http://localhost:8080` con recarga forzada (Ctrl+F5):
- Inicia sesión con un usuario real.
- Recarga la página completa (F5, no solo navegación SPA). Confirma que NO vuelve a pedir login (Bug A resuelto: `subscribe` rehidrata el estado persistido en `localStorage` de inmediato).
- Entra a un proyecto embebido y vuelve; confirma que sigues logueado y que la nave responde a WASD sin quedar atrapada (Bug B).

- [ ] **Step 5: Escribe el reporte del hito**

Crea `docs/superpowers/notes/2026-07-04-hito-1-reporte.md` con esta estructura (rellena los números REALES observados en los Steps 1 y 4 — no dejes placeholders, son datos que ya tienes de haber ejecutado los comandos):

```markdown
# Hito 1 — Núcleo estable: reporte de cierre

Fecha: 2026-07-04 · Rama: `ramatzo`

## Criterios de aceptación (master plan, Hito 1)

- [x] Los 4 bugs reproducidos por el usuario ya NO son reproducibles: volver sin
      re-login (Bug A), entrar a un 2.º planeta tras volver (Bug B), planetas
      visibles tras vuelo largo (Bug C), órbita estable encuadrando el sol (Bug D).
- [x] Nuevos tests puros: `orbit-frame` (buildOrbitBasis/orbitPlaneNormal),
      `orbit-camera` (orbitCameraPose), `dampedFollow` (flight-math),
      `stepOrbit`/`freeAfterExit` (nuevo contrato), `captureState`,
      `planetWorldCenter`, rehidratación de auth (auth-client). Suite completa
      en verde: <RELLENA: nº total de tests>.
- [x] Plan detallado generado con `writing-plans` y ejecutado con
      `subagent-driven-development`/`executing-plans` (este documento).

## Verificado

- `pnpm --filter @plataforma/shell test`: <N> tests, todos en verde.
- `pnpm --filter @plataforma/shell lint` (tsc --noEmit): sin errores.
- `pnpm --filter @plataforma/shell build`: OK.
- Runtime en `http://localhost:8080`: hash del bundle cambió de `<hash-antes>`
  a `<hash-después>` (redeploy vía `deploy/ejec-shell.bat`).
- Verificación manual de los 4 bugs (arnés dev + runtime real): ver detalle arriba.

## Desviaciones del spec (documentadas, no bloquean)

- S8: tests en `environment: 'node'` con mocks manuales de
  `localStorage`/`sessionStorage`/`fetch`, en vez de `jsdom` (evita añadir una
  dependencia nueva; `AuthClient` no toca el DOM).
- S6: no se implementó el "empujar la nave hacia afuera" sugerido en el spec —
  el cooldown de `freeAfterExit` (S6) ya impide la recaptura instantánea sin
  necesidad de mover la nave; añadir el empujón habría sido redundante.
- Se consolidaron S5 y S6 en las Tareas 3-4 del plan (ambas reescriben
  `OrbitState`/`orbit.ts` de forma inseparable): ver nota de arquitectura al
  inicio del plan.

## Bloqueos

Ninguno.
```

- [ ] **Step 6: El ÚNICO commit del hito**

Ejecuta `git status --short` y confirma que la lista de archivos modificados/nuevos coincide EXACTAMENTE con lo tocado en este plan (Tasks 1-13) más el reporte del Step 5, y que `shell/debug.html`/`shell/src/debug-space.ts` NO aparecen (ya se borraron en el Step 3).

```bash
git add shell/src/space/orbits.ts shell/src/space/orbits.test.ts \
  shell/src/space/solar-system.ts \
  shell/src/space/orbit.ts shell/src/space/orbit.test.ts \
  shell/src/space/space-config.ts shell/src/space/ship-controller.ts \
  shell/src/space/hud.ts shell/src/space/space.css \
  shell/src/space/space-engine.ts \
  shell/src/space/vec3-math.ts shell/src/space/vec3-math.test.ts \
  shell/src/space/orbit-frame.ts shell/src/space/orbit-frame.test.ts \
  shell/src/space/orbit-camera.ts shell/src/space/orbit-camera.test.ts \
  shell/src/space/chase-camera.ts shell/src/space/flight-math.ts shell/src/space/flight-math.test.ts \
  shell/src/services/auth-client.ts shell/src/services/auth-client.test.ts \
  docs/superpowers/notes/2026-07-04-hito-1-reporte.md

git commit -m "$(cat <<'EOF'
fix(space): hito 1 — nucleo estable (orbita determinista, marco de mundo, re-entrada, sesion)

- S1: planetas en marco de mundo (systemGroup + rebase de grupo) — arregla Bug C
- S6: freeAfterExit + cooldown en fase 'free' de stepOrbit — arregla Bug B
- S3: plano orbital determinista (buildOrbitBasis, orientado al sol) — arregla Bug D
- S5: maquina de orbita solo enter/exit explicitos (tecla S + boton HUD), sin
  auto-expulsion por empuje
- S4: camara de composicion planeta+sol en orbita, transicion suave (orbitCameraPose)
- S2: captura recalibrada (influenceFactor 8->3) + radio de aviso (approachHintFactor)
- S7: suavizado de mirada (dampedFollow) + maxLookRate recalibrado (30->8)
- S8: sesion persistida en localStorage, subscribe reemite estado, me() solo
  desloguea ante 401 explicito — arregla Bug A
- Verificado: <N> tests TS en verde, lint/build OK, runtime en localhost:8080
  (hash <hash-antes> -> <hash-despues>), 4 bugs verificados no reproducibles

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"

git log --oneline -1
```

- [ ] **Step 7: Marca la Tarea 14 (y el Hito 1 completo) como cerrada** en el sistema de tareas de la sesión.

---

## Referencias

- Spec: `docs/superpowers/specs/2026-07-04-orbita-cinematica-y-navegacion-design.md`
- Master plan: `docs/superpowers/plans/2026-07-04-master-plan-ramatzo.md` (sección Hito 1, Definition of Done global, plantilla de commit)
- Baseline de rendimiento (Hito 0): `docs/superpowers/notes/2026-07-04-baseline-perf.md` — este hito no debería degradar p95 (sin geometría nueva de peso; los sprites/cámaras son coste ~0), pero no hay puerta de rendimiento formal hasta el Hito 5.
