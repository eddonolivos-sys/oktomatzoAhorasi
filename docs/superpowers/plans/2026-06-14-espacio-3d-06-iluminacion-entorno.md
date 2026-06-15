---
# Iluminacion, parallax y marca Ramatzo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Restaurar la sensacion de movimiento y la presencia de marca del shell espacial corrigiendo el parallax de la galaxia, anadiendo un campo de estrellas lejanas fijo, un cinturon de asteroides "Ramatzo" orbitando el sol, y afinando sol, rim light, tone mapping y bloom para un entorno sobrio y realista.

**Architecture:** El motor `space-engine.ts` orquesta por frame y rebasa el origen sobre la posicion de la NAVE (no la camara). Este subsistema toca solo el "fondo y entorno": `galaxy.ts` deja de recentrarse en el jugador (bug actual en galaxy.ts:85-89) y se mueve a una fraccion de su posicion via un helper PURO testeable; un nuevo `far-starfield.ts` anade una capa fija de estrellas distantes para que el movimiento sea perceptible; un nuevo `asteroids.ts` crea `createRamatzoBelt` (cinturon instanciado heliocentrico con un subconjunto que lleva la marca "Ramatzo" como decal de canvas); `ramatzo-sun.ts` se ajusta para visibilidad al spawnear y rango de luz del sistema compacto; y se calibra iluminacion/tone mapping/bloom. Toda la logica pura (factor de parallax) vive en `parallax.ts` y se testea en el entorno node (patron de `layout.ts`); las clases Three.js se verifican manualmente en el dev server.

**Tech Stack:** TypeScript, Three.js 0.170, Lit 3, Vitest. Package @plataforma/shell.

**Depends on:** plan 01 (la posicion de la NAVE — `ShipState.position` — alimenta el parallax y el rebase; este plan asume que `space-engine.ts` ya pasa la posicion de la nave a `galaxy.update(...)` en lugar de `this.camera.position`) y plan 02 (`solar-system.ts` define la escala compacta del sistema: radios de orbita ~600-3000 u, radio de planeta ~120-260 u; el sol y el cinturon de asteroides se coordinan con esa escala). Si plan 01 aun no fusiono, las tareas de integracion en `space-engine.ts` se aplican igual usando `flight`/`ship` segun el estado del archivo en ese momento; las tareas PURE y de fabrica son independientes.

---
---

## File structure

**Created**

- `shell/src/space/parallax.ts` — logica PURA: `parallaxOffset(playerPos, factor)` devuelve el desplazamiento {x,y,z} que debe aplicar una capa de fondo para moverse a una fraccion `factor` del jugador (0 = totalmente fija, 1 = pegada al jugador). Sin Three.js.
- `shell/src/space/parallax.test.ts` — tests Vitest (entorno node) de `parallaxOffset`.
- `shell/src/space/far-starfield.ts` — fabrica de una capa de estrellas lejanas FIJA (no rebasa, no sigue al jugador) que da referencia de movimiento.
- `shell/src/space/asteroids.ts` — `createRamatzoBelt(opts)`: cinturon de asteroides instanciados orbitando el sol; un subconjunto lleva la marca "Ramatzo" como decal de textura de canvas. API verbatim del contrato compartido.

**Modified**

- `shell/src/space/galaxy.ts` (lineas 83-89) — `update` deja de recentrarse en el jugador cada frame; ahora coloca la galaxia a `parallaxOffset(playerPos, GALAXY_PARALLAX)` (fraccion pequena) para que el parallax sea visible.
- `shell/src/space/ramatzo-sun.ts` (lineas 33-69) — sol reescalado/orientado para visibilidad al spawnear y rango de luz que cubre el sistema compacto; pequeno rim/aporte ambiental coherente.
- `shell/src/space/space-engine.ts` (lineas 84-115, 126-135, 194-205, 337-350, 372-383) — tone mapping/bloom afinados; rim light direccional sobrio; instancia y actualiza `far-starfield` y `asteroids`; los rebasa y dispone.

> **Nota de testeo:** solo `parallax.ts` es logica pura y lleva tests unitarios (Vitest, environment node). `far-starfield.ts`, `asteroids.ts`, `galaxy.ts`, `ramatzo-sun.ts` y los cambios de `space-engine.ts` usan Three.js y se verifican manualmente en el dev server (NO se testean en unidad), siguiendo la convencion del repo.

---

## Task 1: Factor de parallax (logica pura, TDD)

**Files:**
- Test: `shell/src/space/parallax.test.ts` (create)
- Create: `shell/src/space/parallax.ts`

Helper puro que calcula el desplazamiento de una capa de fondo en funcion de la posicion del jugador y un factor de parallax. `factor = 0` deja la capa fija en el origen del mundo; `factor = 1` la pega al jugador (sin parallax); valores intermedios producen parallax. Usa solo numeros/objetos planos para que corra en el entorno node.

- [ ] **Step 1: Write the failing test**

```ts
// shell/src/space/parallax.test.ts
import { describe, it, expect } from 'vitest';
import { parallaxOffset } from './parallax';

describe('parallaxOffset', () => {
  it('factor 0 deja la capa fija en el origen', () => {
    expect(parallaxOffset({ x: 1000, y: -500, z: 3000 }, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('factor 1 pega la capa al jugador (sin parallax)', () => {
    expect(parallaxOffset({ x: 1000, y: -500, z: 3000 }, 1)).toEqual({ x: 1000, y: -500, z: 3000 });
  });

  it('factor intermedio escala linealmente cada eje', () => {
    expect(parallaxOffset({ x: 200, y: 100, z: -400 }, 0.25)).toEqual({ x: 50, y: 25, z: -100 });
  });

  it('clampa el factor por debajo de 0 a 0', () => {
    expect(parallaxOffset({ x: 800, y: 0, z: 0 }, -2)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('clampa el factor por encima de 1 a 1', () => {
    expect(parallaxOffset({ x: 800, y: 0, z: 0 }, 5)).toEqual({ x: 800, y: 0, z: 0 });
  });

  it('es lineal: duplicar la posicion duplica el offset', () => {
    const a = parallaxOffset({ x: 100, y: 50, z: 25 }, 0.4);
    const b = parallaxOffset({ x: 200, y: 100, z: 50 }, 0.4);
    expect(b.x).toBeCloseTo(a.x * 2, 6);
    expect(b.y).toBeCloseTo(a.y * 2, 6);
    expect(b.z).toBeCloseTo(a.z * 2, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/parallax.test.ts`
  Expected: FAIL — el archivo `./parallax` no existe / `parallaxOffset` no esta exportado (error de resolucion de modulo).

- [ ] **Step 3: Write minimal implementation**

```ts
// shell/src/space/parallax.ts

/** Punto en espacio 3D como objeto plano (sin Three.js) para test en node. */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Desplazamiento que debe aplicar una capa de fondo para producir parallax.
 *
 * @param playerPos posicion del jugador (de `ShipState.position`).
 * @param factor    fraccion de seguimiento en [0,1] (se clampa):
 *                  0 = capa totalmente fija en el origen del mundo;
 *                  1 = capa pegada al jugador (sin parallax aparente).
 * @returns offset {x,y,z} = playerPos * factor por eje.
 */
export function parallaxOffset(playerPos: Vec3Like, factor: number): Vec3Like {
  const f = Math.max(0, Math.min(1, factor));
  return {
    x: playerPos.x * f,
    y: playerPos.y * f,
    z: playerPos.z * f,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/parallax.test.ts`
  Expected: PASS (6 tests verdes).

- [ ] **Step 5: Commit**
  Run:
  ```
  git add shell/src/space/parallax.ts shell/src/space/parallax.test.ts
  git commit -m "test(space): parallaxOffset helper puro para fondo (TDD)"
  ```

---

## Task 2: Arreglar el parallax de la galaxia

**Files:**
- Modify: `shell/src/space/galaxy.ts` (lineas 83-89, el bloque `return { object, update(...) {...} }`)

**Bug actual (galaxy.ts:88):** `object.position.set(playerPos.x, playerPos.y - 20, playerPos.z)` recentra la galaxia en el jugador cada frame, por lo que el fondo nunca se mueve respecto a la nave y se pierde toda sensacion de avance. El fix: mover la galaxia solo a una FRACCION pequena de la posicion del jugador usando `parallaxOffset`, de modo que el backdrop se desplace lentamente (parallax) sin que la nave lo "alcance". El offset de altura de -20 se conserva sumandolo despues.

- [ ] **Step 1: Importar el helper puro y definir la constante de parallax**
  En `shell/src/space/galaxy.ts`, justo despues de la linea `import * as THREE from 'three';` (linea 1), anadir:

```ts
import { parallaxOffset } from './parallax';

/**
 * Fraccion de seguimiento de la galaxia al jugador. Pequena (~6%) para que el
 * backdrop se desplace lento respecto a la nave (parallax visible) sin que la
 * nave llegue nunca a "alcanzarlo". 0 = totalmente fija; 1 = pegada (bug previo).
 */
const GALAXY_PARALLAX = 0.06;
```

- [ ] **Step 2: Reemplazar el cuerpo de `update` para aplicar parallax en vez de recentrar**
  Reemplazar exactamente este bloque (galaxy.ts:85-89):

```ts
    update(elapsed, delta, playerPos) {
      object.rotation.y += delta * 0.008;
      object.rotation.x = Math.sin(elapsed * 0.003) * 0.05;
      object.position.set(playerPos.x, playerPos.y - 20, playerPos.z);
    },
```

  por:

```ts
    update(elapsed, delta, playerPos) {
      object.rotation.y += delta * 0.008;
      object.rotation.x = Math.sin(elapsed * 0.003) * 0.05;
      // Parallax: el backdrop sigue al jugador solo a una fraccion pequena, de
      // modo que la nave avanza visiblemente respecto a el (fix galaxy.ts:88).
      const o = parallaxOffset({ x: playerPos.x, y: playerPos.y, z: playerPos.z }, GALAXY_PARALLAX);
      object.position.set(o.x, o.y - 20, o.z);
    },
```

- [ ] **Step 3: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS (sin errores de tipos; `playerPos` sigue siendo `THREE.Vector3`, que satisface `Vec3Like`).

- [ ] **Step 4: Verificacion manual**
  Run: `pnpm --filter @plataforma/shell dev`; abrir http://localhost:5173; iniciar sesion; tomar control y mantener `W` para avanzar.
  Expected: la galaxia de fondo se desplaza LENTAMENTE respecto a la nave (se percibe avance), a diferencia del comportamiento previo donde quedaba clavada al jugador. Girar con el raton: la galaxia rota suavemente con `elapsed` pero no se reposiciona bruscamente.

  > **Nota plan 01:** `space-engine.ts` debe pasar la posicion de la NAVE a `galaxy.update(...)`. Si plan 01 ya fusiono, ya sera `this.ship.object.position` (o equivalente). Si aun no, en `space-engine.ts:194` cambiar `this.galaxy.update(this.elapsed, delta, this.camera.position)` por la posicion de la nave disponible. Esa edicion concreta se consolida en la Task 6.

- [ ] **Step 5: Commit**
  Run:
  ```
  git add shell/src/space/galaxy.ts
  git commit -m "fix(space): galaxia con parallax (deja de recentrarse en el jugador)"
  ```

---

## Task 3: Capa de estrellas lejanas fija

**Files:**
- Create: `shell/src/space/far-starfield.ts`

Una capa de estrellas distantes FIJA en el origen del mundo (no sigue al jugador, no rebasa) que sirve de referencia absoluta de movimiento: con el parallax de la galaxia y los chunks cercanos moviendose, esta capa lejana hace que el avance sea inequivoco. Esfera de puntos de radio grande, blanco-ambar muy tenue, sin bloom agresivo, sobria. Como es lejana y fija, no necesita rebase: queda anclada y la nave la sobrevuela.

- [ ] **Step 1: Crear el archivo completo**

```ts
// shell/src/space/far-starfield.ts
import * as THREE from 'three';

export interface FarStarfield {
  object: THREE.Points;
  update(elapsed: number): void;
  dispose(): void;
}

/**
 * Capa de estrellas lejanas FIJA (anclada al origen del mundo). No sigue al
 * jugador ni rebasa: es la referencia absoluta de movimiento. Estrellas frias
 * con acentos ambar muy tenues, distribucion esferica hueca a gran radio, sin
 * pulso ni neon. Rota imperceptiblemente para sensacion de profundidad.
 */
export function createFarStarfield(renderer: THREE.WebGLRenderer): FarStarfield {
  const count = 2600;
  const inner = 18000;
  const outer = 26000;

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  const cool = new THREE.Color(0xcdd6e6);
  const warm = new THREE.Color(0xffd9a8);
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    // Punto aleatorio sobre una cascara esferica (distribucion uniforme).
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const r = inner + Math.random() * (outer - inner);
    const s = Math.sqrt(1 - u * u);
    positions[i * 3] = r * s * Math.cos(theta);
    positions[i * 3 + 1] = r * u;
    positions[i * 3 + 2] = r * s * Math.sin(theta);

    // Mayoria frias, una minoria con tinte ambar tenue (sobrio).
    tmp.copy(Math.random() < 0.16 ? warm : cool);
    const dim = 0.55 + Math.random() * 0.45;
    colors[i * 3] = tmp.r * dim;
    colors[i * 3 + 1] = tmp.g * dim;
    colors[i * 3 + 2] = tmp.b * dim;

    sizes[i] = 1.0 + Math.random() * 2.4;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      uniform float uPixelRatio;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float d = distance(gl_PointCoord, vec2(0.5));
        float alpha = 1.0 - smoothstep(0.1, 0.5, d);
        gl_FragColor = vec4(vColor, alpha * 0.85);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });

  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = -1; // detras de todo

  return {
    object,
    update(elapsed) {
      object.rotation.y = elapsed * 0.0006;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
```

- [ ] **Step 2: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS.

- [ ] **Step 3: Commit**
  Run:
  ```
  git add shell/src/space/far-starfield.ts
  git commit -m "feat(space): capa de estrellas lejanas fija (referencia de movimiento)"
  ```

  > La verificacion visual se hace en la Task 6 tras integrar en `space-engine.ts`.

---

## Task 4: Cinturon de asteroides "Ramatzo"

**Files:**
- Create: `shell/src/space/asteroids.ts`

`createRamatzoBelt` (API verbatim del contrato compartido) crea un cinturon de asteroides instanciados (`InstancedMesh`) orbitando el sol entre `innerRadius` y `outerRadius`, con inclinaciones leves para usar las 3 dimensiones. Un subconjunto pequeno lleva la marca "Ramatzo" mediante un decal de textura de canvas (sin dependencia de fuentes ni `TextGeometry`/`FontLoader`), montados como sprites/quads ligeros sobre algunos asteroides. Materiales sobrios (roca opaca, sin neon); el decal usa color ambar tenue coherente con el sol. `rebase` desplaza el grupo entero; `update` avanza las orbitas; `dispose` libera geometrias, materiales y texturas.

- [ ] **Step 1: Crear el archivo completo**

```ts
// shell/src/space/asteroids.ts
import * as THREE from 'three';

export interface RamatzoBelt {
  object: THREE.Group;
  update(elapsed: number, delta: number): void;
  rebase(delta: THREE.Vector3): void;
  dispose(): void;
}

export interface RamatzoBeltOptions {
  count?: number;
  innerRadius: number;
  outerRadius: number;
}

/** Textura de canvas con la palabra "Ramatzo" en relieve ambar sobre transparente. */
function createBrandTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.font = '700 76px "Inter", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Sombra sutil para dar relieve.
  ctx.fillStyle = 'rgba(20, 10, 4, 0.85)';
  ctx.fillText('Ramatzo', c.width / 2 + 3, c.height / 2 + 3);
  // Cuerpo ambar sobrio (sin neon).
  ctx.fillStyle = 'rgba(240, 196, 130, 0.95)';
  ctx.fillText('Ramatzo', c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

/** Geometria de roca irregular (icosaedro deformado por seed). */
function rockGeometry(seed: number): THREE.IcosahedronGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes['position'] as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(0.78 + rand() * 0.5);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Cinturon de asteroides instanciados orbitando el sol (entre innerRadius y
 * outerRadius, inclinaciones leves para usar las 3D). Un subconjunto lleva la
 * marca "Ramatzo" (decal de canvas) para presencia de marca en el entorno.
 * Sobrio y coherente con la iluminacion calida; sin neon.
 */
export function createRamatzoBelt(opts: RamatzoBeltOptions): RamatzoBelt {
  const count = opts.count ?? 240;
  const { innerRadius, outerRadius } = opts;

  const group = new THREE.Group();

  // ── Asteroides instanciados ──
  const geometry = rockGeometry(7);
  const material = new THREE.MeshStandardMaterial({
    color: 0x6b5a47,
    roughness: 0.95,
    metalness: 0.05,
    flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  group.add(mesh);

  interface OrbitParam {
    radius: number;
    phase: number;
    speed: number;
    inclination: number;
    scale: number;
    spin: number;
    spinAxis: THREE.Vector3;
  }
  const params: OrbitParam[] = [];
  const dummy = new THREE.Object3D();
  const quat = new THREE.Quaternion();

  for (let i = 0; i < count; i++) {
    params.push({
      radius: innerRadius + Math.random() * (outerRadius - innerRadius),
      phase: Math.random() * Math.PI * 2,
      speed: 0.02 + Math.random() * 0.05, // lento
      inclination: (Math.random() - 0.5) * 0.32,
      scale: 6 + Math.random() * 22,
      spin: (Math.random() - 0.5) * 0.6,
      spinAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
    });
  }

  // ── Subconjunto con marca "Ramatzo" (decals planos sobre algunos asteroides) ──
  const brandTex = createBrandTexture();
  const brandMat = new THREE.MeshBasicMaterial({
    map: brandTex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const brandGeo = new THREE.PlaneGeometry(120, 30);
  const brandCount = Math.min(8, Math.max(3, Math.round(count * 0.03)));
  const brandPanels: { mesh: THREE.Mesh; param: OrbitParam }[] = [];
  for (let i = 0; i < brandCount; i++) {
    const p = params[Math.floor((i / brandCount) * count)]!;
    const panel = new THREE.Mesh(brandGeo, brandMat);
    group.add(panel);
    brandPanels.push({ mesh: panel, param: p });
  }

  function placeInstance(target: THREE.Object3D, p: OrbitParam, angle: number) {
    const x = Math.cos(angle) * p.radius;
    const z = Math.sin(angle) * p.radius;
    const y = Math.sin(angle * 1.3 + p.phase) * p.radius * p.inclination;
    target.position.set(x, y, z);
  }

  function frame(elapsed: number) {
    for (let i = 0; i < count; i++) {
      const p = params[i]!;
      const angle = p.phase + elapsed * p.speed * 0.1;
      placeInstance(dummy, p, angle);
      quat.setFromAxisAngle(p.spinAxis, elapsed * p.spin);
      dummy.quaternion.copy(quat);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    for (const { mesh: panel, param: p } of brandPanels) {
      const angle = p.phase + elapsed * p.speed * 0.1;
      placeInstance(panel, p, angle);
      panel.position.y += p.scale * 1.4; // flotar junto al asteroide
      // Orientacion tangencial a la orbita (mira hacia fuera del centro).
      panel.lookAt(panel.position.x * 2, panel.position.y, panel.position.z * 2);
    }
  }

  // Posicion inicial.
  frame(0);

  return {
    object: group,
    update(elapsed) {
      frame(elapsed);
    },
    rebase(delta) {
      group.position.sub(delta);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      brandGeo.dispose();
      brandMat.dispose();
      brandTex.dispose();
    },
  };
}
```

- [ ] **Step 2: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS.

- [ ] **Step 3: Commit**
  Run:
  ```
  git add shell/src/space/asteroids.ts
  git commit -m "feat(space): cinturon de asteroides con marca Ramatzo (createRamatzoBelt)"
  ```

  > La verificacion visual se hace en la Task 6 tras integrar en `space-engine.ts`.

---

## Task 5: Sol Ramatzo visible al spawnear y rango de luz del sistema

**Files:**
- Modify: `shell/src/space/ramatzo-sun.ts` (lineas 33-69)

El sol debe verse al spawnear (la nave mira hacia el sistema) y su `PointLight` debe cubrir el sistema compacto definido por plan 02 (orbitas ~600-3000 u). El radio actual de 700 u y el `distance` de 15000 son desproporcionados para un sistema compacto; se reducen a una escala coherente con planetas de radio ~120-260 u y se mantiene el faro visible de lejos (materiales con `fog: false`). El sol queda en el origen de escena (su `position` ya rebasa via `space-engine`), que es justo enfrente del spawn segun plan 02.

- [ ] **Step 1: Reescalar el sol y su luz**
  Reemplazar exactamente este bloque (ramatzo-sun.ts:33-69, de `const radius = 700;` hasta la linea que anade `light`):

```ts
  const group = new THREE.Group();
  const radius = 700;

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false }),
  );
  group.add(core);

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.05, 48, 48),
    new THREE.MeshBasicMaterial({
      color: 0xff8c42,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  group.add(shell);

  const coronaTex = createCoronaTexture();
  const corona = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: coronaTex,
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.9,
      fog: false,
    }),
  );
  corona.scale.set(radius * 9, radius * 9, 1);
  group.add(corona);

  const light = new THREE.PointLight(0xffb060, 2.6, 15000, 2);
  group.add(light);
```

  por:

```ts
  const group = new THREE.Group();
  // Escala coherente con el sistema compacto (plan 02: orbitas ~600-3000 u,
  // planetas ~120-260 u). El sol es el cuerpo mayor pero sin eclipsar el sistema.
  const radius = 340;

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false }),
  );
  group.add(core);

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.06, 48, 48),
    new THREE.MeshBasicMaterial({
      color: 0xff8c42,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  group.add(shell);

  const coronaTex = createCoronaTexture();
  const corona = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: coronaTex,
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.85,
      fog: false,
    }),
  );
  corona.scale.set(radius * 6, radius * 6, 1);
  group.add(corona);

  // Luz puntual que cubre el sistema compacto (hasta ~3600 u de orbita externa)
  // con caida fisica suave. Intensidad sobria para realismo (sin sobreexponer).
  const light = new THREE.PointLight(0xffb060, 3.2, 4200, 1.6);
  group.add(light);
```

- [ ] **Step 2: Ajustar el pulso de la corona al nuevo radio**
  Reemplazar exactamente este bloque del `update` (ramatzo-sun.ts:76-82):

```ts
    update(elapsed) {
      core.rotation.y += 0.0008;
      const pulse = 0.85 + 0.15 * Math.sin(elapsed * 0.6);
      (shell.material as THREE.MeshBasicMaterial).opacity = 0.4 * pulse;
      const s = radius * (8.5 + 0.5 * Math.sin(elapsed * 0.5));
      corona.scale.set(s, s, 1);
    },
```

  por:

```ts
    update(elapsed) {
      core.rotation.y += 0.0008;
      const pulse = 0.85 + 0.15 * Math.sin(elapsed * 0.6);
      (shell.material as THREE.MeshBasicMaterial).opacity = 0.4 * pulse;
      const s = radius * (5.8 + 0.4 * Math.sin(elapsed * 0.5));
      corona.scale.set(s, s, 1);
    },
```

- [ ] **Step 3: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS.

- [ ] **Step 4: Commit**
  Run:
  ```
  git add shell/src/space/ramatzo-sun.ts
  git commit -m "feat(space): sol Ramatzo reescalado al sistema compacto + rango de luz"
  ```

  > La verificacion visual (sol visible al spawnear, sistema iluminado) se hace en la Task 6.

---

## Task 6: Integrar entorno en space-engine (far-starfield, asteroides, iluminacion, parallax wiring)

**Files:**
- Modify: `shell/src/space/space-engine.ts` (imports linea 7-13; campos linea 57-67; iluminacion/bloom linea 84-115; mundo linea 126-135; loop linea 194-205; rebase linea 337-350; dispose linea 372-383)

Cablea el `far-starfield` y el cinturon de asteroides, afina iluminacion/tone mapping/bloom, anade rim light direccional sobrio, y asegura que la galaxia reciba la posicion de la NAVE (coordina con plan 01). El cinturon usa radios coordinados con plan 02 (interior algo dentro de la orbita externa de planetas, exterior algo mas alla).

- [ ] **Step 1: Anadir imports**
  En `shell/src/space/space-engine.ts`, tras la linea `import { createRamatzoSun, type RamatzoSun } from './ramatzo-sun';` (linea 8), anadir:

```ts
import { createFarStarfield, type FarStarfield } from './far-starfield';
import { createRamatzoBelt, type RamatzoBelt } from './asteroids';
```

- [ ] **Step 2: Anadir campos de instancia**
  Tras la linea `private ramatzoSun!: RamatzoSun;` (linea 58), anadir:

```ts
  private farStars!: FarStarfield;
  private belt!: RamatzoBelt;
```

- [ ] **Step 3: Afinar tone mapping y exposicion**
  Reemplazar exactamente (space-engine.ts:84-85):

```ts
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
```

  por:

```ts
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05; // sobrio: evita lavar los acentos
```

- [ ] **Step 4: Afinar iluminacion (rim/ambient/fill)**
  Reemplazar exactamente el bloque de iluminacion (space-engine.ts:96-108):

```ts
    // Iluminación cálida
    this.scene.add(new THREE.AmbientLight(0x3a2a20, 0.4));
    const starLight = new THREE.DirectionalLight(0xff8c42, 1.5);
    starLight.position.set(50, 100, -200);
    starLight.castShadow = true;
    starLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(starLight);
    const fillLight = new THREE.DirectionalLight(0x8b7a5a, 0.3);
    fillLight.position.set(-50, 30, 100);
    this.scene.add(fillLight);
    const warmLight = new THREE.PointLight(0xff6b35, 0.5, 80);
    warmLight.position.set(20, 10, 30);
    this.scene.add(warmLight);
```

  por:

```ts
    // Iluminación cálida y sobria: key cálido del sol, fill frío tenue y un
    // rim azulado para recortar nave y planetas del fondo (realismo sin neón).
    this.scene.add(new THREE.AmbientLight(0x2a2018, 0.35));
    const starLight = new THREE.DirectionalLight(0xffb070, 1.35);
    starLight.position.set(50, 100, -200);
    starLight.castShadow = true;
    starLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(starLight);
    const fillLight = new THREE.DirectionalLight(0x6a7488, 0.28);
    fillLight.position.set(-60, 20, 120);
    this.scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0x9fb6d8, 0.45);
    rimLight.position.set(-30, 60, -150); // contraluz: rim en nave/planetas
    this.scene.add(rimLight);
```

- [ ] **Step 5: Afinar bloom (mas selectivo, menos difuso)**
  Reemplazar exactamente (space-engine.ts:113-115):

```ts
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.5, 0.15),
    );
```

  por:

```ts
    this.composer.addPass(
      // strength, radius, threshold: realce solo de emisivos brillantes (sol,
      // toberas, acentos) sin halo lechoso global.
      new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.45, 0.6),
    );
```

- [ ] **Step 6: Instanciar far-starfield y cinturon en el bloque de mundo**
  Tras la linea `this.scene.add(this.ramatzoSun.object);` (linea 130), anadir:

```ts
    this.farStars = createFarStarfield(this.renderer);
    this.scene.add(this.farStars.object);

    // Cinturon de asteroides Ramatzo: radios coordinados con plan 02
    // (orbita externa de planetas ~3000 u). Va por dentro/fuera de esa franja.
    this.belt = createRamatzoBelt({ count: 240, innerRadius: 3400, outerRadius: 4400 });
    this.scene.add(this.belt.object);
```

- [ ] **Step 7: Actualizar far-stars y cinturon en el loop, y pasar posicion de la NAVE a la galaxia**
  Reemplazar exactamente el bloque del loop (space-engine.ts:194-202):

```ts
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
    // Parallax sobre la posicion de la nave (plan 01). Mientras plan 01 no
    // fusione, `this.camera.position` aproxima la posicion de la nave; al
    // fusionar, sustituir por la posicion de la nave (p.ej. this.ship.object.position).
    const shipPos = this.camera.position;
    this.galaxy.update(this.elapsed, delta, shipPos);
    this.farStars.update(this.elapsed);
    this.ramatzoSun.update(this.elapsed);
    this.belt.update(this.elapsed, delta);

    setStarGasTime(this.elapsed);
    this.chunks.update(this.camera.position.clone().add(this.worldOffset));
    this.constellations.update(this.elapsed, delta);
    this.radar.draw(this.camera.position, flight.yaw, this.constellations.getRadarBlips(), this.ramatzoSun.position);
    floatShips(this.ships, this.elapsed, delta);
    this.playerShip.update(this.elapsed);
```

  > La `far-starfield` es FIJA: no se le pasa posicion ni se rebasa (es la referencia absoluta). La galaxia hace su propio parallax interno (Task 2). El cinturon SI se rebasa (Step 8).

- [ ] **Step 8: Rebasar el cinturon en `maybeRebase`**
  Reemplazar exactamente (space-engine.ts:346-349):

```ts
    this.chunks.rebase(delta);
    this.constellations.rebase(delta);
    this.ramatzoSun.object.position.sub(delta);
    for (const s of this.ships) s.position.sub(delta);
```

  por:

```ts
    this.chunks.rebase(delta);
    this.constellations.rebase(delta);
    this.belt.rebase(delta);
    this.ramatzoSun.object.position.sub(delta);
    for (const s of this.ships) s.position.sub(delta);
    // farStars es fija (referencia absoluta): no se rebasa a proposito.
```

- [ ] **Step 9: Disponer far-stars y cinturon**
  Reemplazar exactamente (space-engine.ts:377-378):

```ts
    this.galaxy?.dispose();
    this.ramatzoSun?.dispose();
```

  por:

```ts
    this.galaxy?.dispose();
    this.farStars?.dispose();
    this.belt?.dispose();
    this.ramatzoSun?.dispose();
```

- [ ] **Step 10: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS.

- [ ] **Step 11: Verificacion manual integral**
  Run: `pnpm --filter @plataforma/shell dev`; abrir http://localhost:5173; iniciar sesion; tomar control.
  Expected:
  - Al spawnear, el sol Ramatzo es visible enfrente (la nave mira hacia el sistema) y su luz calida ilumina planetas cercanos.
  - Manteniendo `W`, el avance es claramente perceptible: las estrellas lejanas fijas se desplazan respecto a la nave y la galaxia hace parallax lento (no queda clavada).
  - Se ve un cinturon de asteroides orbitando el sol; al acercarse a el, algunos asteroides muestran el panel con la marca "Ramatzo" (ambar sobrio, legible).
  - Nave y planetas tienen un rim azulado que los recorta del fondo; el bloom realza el sol y las toberas sin halo lechoso global.
  - No hay errores en la consola del navegador; el FPS se mantiene estable (el escalado adaptativo de `pixelRatio` sigue operando).

- [ ] **Step 12: Run ALL shell tests (regresion)**
  Run: `pnpm --filter @plataforma/shell test`
  Expected: PASS (incluye `parallax.test.ts` y los tests previos del paquete).

- [ ] **Step 13: Build (sanity)**
  Run: `pnpm --filter @plataforma/shell build`
  Expected: build exitoso sin errores de tipos.

- [ ] **Step 14: Commit**
  Run:
  ```
  git add shell/src/space/space-engine.ts
  git commit -m "feat(space): integra estrellas lejanas, cinturon Ramatzo y rim light + bloom afinado"
  ```

---

## Verification checklist (al cerrar el subsistema)

- [ ] `pnpm --filter @plataforma/shell test` en verde (incluye `parallax.test.ts`).
- [ ] `pnpm --filter @plataforma/shell lint` sin errores.
- [ ] `pnpm --filter @plataforma/shell build` exitoso.
- [ ] Dev server: avance perceptible (parallax galaxia + estrellas lejanas fijas), sol visible al spawnear, cinturon con marca "Ramatzo", rim light en nave/planetas, sin neon ni halo lechoso, sin errores de consola.
- [ ] Las apps de proyecto NO se tocaron; el contrato `onEnterApp` y el iframe de la cabina quedan intactos (este plan no los referencia).
