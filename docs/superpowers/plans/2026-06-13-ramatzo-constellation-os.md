# Ramatzo Constellation OS v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar el demo `docs/referencia-espacial.html` a un motor 3D modular en `shell/src/space/`, integrado con el `app-registry` real y `shell-app-container`, reemplazando el dashboard post-login, con `chunks.ts` como sistema de streaming para espacio vasto.

**Architecture:** Motor TypeScript agnóstico de framework (canvas + overlays DOM propios, referencias a nodos, nunca `getElementById`) montado por un componente Lit `<shell-space>` en light DOM. La cabina es Lit (`<shell-cockpit>`) y reutiliza `shell-app-container` (iframe real). `star-gas.ts` es la fábrica de campos estelares; `chunks.ts` los instancia en streaming alrededor del jugador. Sin tocar auth, protocolo ni apps embebidas.

**Tech Stack:** Lit 3.2 + TypeScript 5.6 + Vite 6, Three.js 0.170.0 (UnrealBloomPass, EffectComposer), Vitest (solo lógica pura).

**Fuente canónica:** [`docs/referencia-espacial.html`](../../referencia-espacial.html). Spec: [`docs/superpowers/specs/2026-06-13-ramatzo-constellation-os-design.md`](../specs/2026-06-13-ramatzo-constellation-os-design.md).

**Filosofía de verificación:** cada tarea termina en (a) `pnpm --filter @plataforma/shell lint` (= `tsc --noEmit`) limpio, (b) cuando hay lógica pura, `pnpm --filter @plataforma/shell test` verde, y (c) cuando hay cambio visible, `pnpm --filter @plataforma/shell dev` + observación del comportamiento descrito. Commit al final de cada tarea.

**Comandos base** (desde la raíz del repo; el shell es `shell/`):
- Dev: `pnpm --filter @plataforma/shell dev` (Vite, normalmente http://localhost:5173)
- Type-check: `pnpm --filter @plataforma/shell lint`
- Test: `pnpm --filter @plataforma/shell test`
- Build: `pnpm --filter @plataforma/shell build`

> Nota Windows/PowerShell: ejecutar comandos sin `cd` (el cwd ya es la raíz). El login del shell requiere backend Go vivo; si no, `loadApps()` cae al fallback YAML — suficiente para ver constelaciones. Para entrar a una app real (cabina) hace falta que `apps/**` estén servidas (Vite proxy / docker-compose dev).

---

## Mapa de archivos

**Crear (`shell/src/space/`):**
- `space.css` — estilos de overlays (port del `<style>` del demo, líneas 11–534).
- `space-engine.ts` — orquestador: renderer/scene/luces/composer/loop/resize/visibility/resolution-scaling/dispose/rebase.
- `flight.ts` — `FlightController` (WASD + pointer lock + nitro).
- `hud.ts` — `Hud` (velocidad, nitro, coords, reticula, vignette, mensaje inicio).
- `star-gas.ts` — fábrica de campos estelares (material shader compartido + builder de geometría sembrada).
- `galaxy.ts` — `createGalaxy` (80k puntos espiral).
- `chunks.ts` — `ChunkManager` (grid streaming, pooling, idle-gen, fade-in).
- `constellation.ts` — `createConstellation` (una constelación).
- `planet.ts` — `createPlanet` (magma).
- `constellations.ts` — `ConstellationManager` (layout desde registry + raycast + blips + órbitas).
- `radar.ts` — `Radar` (canvas 2D).
- `spaceships.ts` — 3 naves + `placeShips`.
- `project-overlay.ts` — `ProjectOverlay` (tarjeta de info).
- `layout.ts` — lógica pura: layout de constelaciones, color por categoría, seeded RNG, chunk-key/rebase math (lo testeable con Vitest).

**Crear (`shell/src/components/`):**
- `shell-space.ts` — Lit host del motor + estado de cabina + guard WebGL.
- `shell-cockpit.ts` — Lit cabina + `shell-app-container`.

**Crear (tests):**
- `shell/src/space/layout.test.ts`, `shell/src/space/chunks.test.ts`.

**Modificar:**
- `shell/package.json` — deps `three`, `@types/three`; devDep `vitest`; script `test`.
- `shell/index.html` — fuentes Google.
- `shell/src/styles/themes.css` — tokens `--space-*`/`--orange-*`/`--metal-*`.
- `shell/src/components/shell-app.ts` — post-login → `<shell-space>`.
- `shell/src/components/shell-login.ts` — estética + ignición.
- `shell/vite.config.ts` — (si hace falta) `test` config de Vitest.

---

## FASE 0 — Fundación (login → canvas vacío verificable)

### Task 1: Dependencias, fuentes y tokens de color

**Files:**
- Modify: `shell/package.json`
- Modify: `shell/index.html`
- Modify: `shell/src/styles/themes.css`

- [ ] **Step 1: Declarar Three.js y Vitest en `shell/package.json`**

En `dependencies` añadir `"three": "0.170.0"`. En `devDependencies` añadir `"@types/three": "0.170.0"` y `"vitest": "^2.1.0"`. En `scripts` añadir `"test": "vitest run"` y `"test:watch": "vitest"`.

- [ ] **Step 2: Instalar**

Run: `pnpm install`
Expected: instala sin errores; `three@0.170.0` resuelto desde el workspace.

- [ ] **Step 3: Añadir fuentes en `shell/index.html`**

Dentro de `<head>`, antes del `</head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cinzel+Decorative:wght@700;900&family=JetBrains+Mono:wght@300;400;600;700&display=swap" rel="stylesheet" />
```

- [ ] **Step 4: Añadir tokens espaciales en `themes.css`**

Al final de `:root { ... }` (NO eliminar tokens `--shell-*` existentes), añadir:
```css
  /* ── Constellation OS (espacio) ── */
  --space-deep: #0A0503;   --space-dark: #1A0E08;   --space-surface: #2A1A10;
  --orange-burnt: #C84B31; --orange-rust: #8B3A1A;  --orange-amber: #E6A817;
  --orange-gold: #D4A84B;  --orange-ember: #FF6B35; --orange-warm: #FF8C42;
  --metal-iron: #3A2A20;   --metal-steel: #5A4A3A;  --metal-brass: #8B7A5A; --metal-copper: #B86A3A;
  --space-text: #C8B898;   --space-text-2: #8A7A6A; --space-text-dim: #5A4A3A;
  --font-display: 'Cinzel Decorative', serif;
  --font-serif: 'Cinzel', serif;
  --font-mono: 'JetBrains Mono', monospace;
```

- [ ] **Step 5: Verificar y commit**

Run: `pnpm --filter @plataforma/shell lint`
Expected: sin errores de tipos.
```
git add shell/package.json shell/index.html shell/src/styles/themes.css pnpm-lock.yaml
git commit -m "feat(space): deps three+vitest, fuentes y tokens de color espacial"
```

---

### Task 2: Configurar Vitest (entorno para lógica pura)

**Files:**
- Modify: `shell/vite.config.ts`
- Test: `shell/src/space/smoke.test.ts` (temporal)

- [ ] **Step 1: Añadir bloque `test` a `vite.config.ts`**

Añadir `/// <reference types="vitest" />` al inicio y, en el objeto de config, `test: { environment: 'node', include: ['src/**/*.test.ts'] }`.

- [ ] **Step 2: Test de humo**

Crear `shell/src/space/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
describe('vitest', () => { it('runs', () => { expect(1 + 1).toBe(2); }); });
```

- [ ] **Step 3: Ejecutar**

Run: `pnpm --filter @plataforma/shell test`
Expected: 1 passed.

- [ ] **Step 4: Borrar el test de humo y commit**

Eliminar `smoke.test.ts`.
```
git add shell/vite.config.ts
git commit -m "chore(space): configurar Vitest para lógica pura"
```

---

### Task 3: `space.css` — estilos de overlays

**Files:**
- Create: `shell/src/space/space.css`

- [ ] **Step 1: Portar estilos del demo**

Copiar el contenido del `<style>` del demo (`referencia-espacial.html` líneas 12–533): el bloque `:root` de tokens locales **se omite** (ya están en `themes.css`), pero portar TODAS las reglas de `#hud`, `#nitroBar`, `#coords`, `#reticle`, `#startMsg`, `#projectInfo`, `#cockpitView`/`.cockpit-*`, `#vignette`, y el `@media (max-width:768px)`. Reemplazar referencias a variables locales por las de `themes.css` (`--space-text`→ usar `--space-text`, etc.; nombres ya coinciden salvo `--text-primary`→`--space-text`, `--text-secondary`→`--space-text-2`, `--text-dim`→`--space-text-dim`).

> Las clases de cabina (`.cockpit-*`) se reutilizarán dentro del Shadow DOM de `<shell-cockpit>` en una Task posterior; aquí viven para los overlays in-space (HUD/radar/project-info) que el motor inyecta en light DOM.

- [ ] **Step 2: Verificar sintaxis**

Run: `pnpm --filter @plataforma/shell build` (Vite parsea el CSS al importarlo más tarde; por ahora basta con que el archivo exista y sea CSS válido — revisión visual).
Expected: archivo creado, CSS bien formado.

- [ ] **Step 3: Commit**
```
git add shell/src/space/space.css
git commit -m "feat(space): estilos de overlays (HUD, radar, project-info, cabina)"
```

---

### Task 4: `<shell-space>` esqueleto + guard WebGL + integración en `shell-app`

**Files:**
- Create: `shell/src/components/shell-space.ts`
- Modify: `shell/src/components/shell-app.ts`
- Modify: `shell/src/main.ts`

- [ ] **Step 1: Crear `<shell-space>` (light DOM, guard WebGL, import dinámico stub)**

```ts
import { LitElement, html } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { AppInfo } from '../services/protocol';

export class ShellSpace extends LitElement {
  // Light DOM: el canvas y overlays viven en el documento (pointer lock + overlays del motor)
  protected createRenderRoot() { return this; }

  @property({ type: Array }) apps: AppInfo[] = [];
  @property({ type: String }) theme: 'light' | 'dark' = 'dark';
  @state() private webglOk = true;
  private engine: { dispose(): void; pause(): void; resume(): void } | null = null;
  private host: HTMLDivElement | null = null;

  private hasWebGL(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { return false; }
  }

  async firstUpdated() {
    if (!this.hasWebGL()) { this.webglOk = false; return; }
    this.host = this.querySelector('#space-host') as HTMLDivElement;
    const { SpaceEngine } = await import('../space/space-engine');
    this.engine = new SpaceEngine();
    this.engine.mount(this.host!, {
      apps: this.apps,
      onEnterApp: (app: AppInfo) => this.dispatchEvent(new CustomEvent('enter-app', { detail: app })),
      onLogout: () => this.dispatchEvent(new CustomEvent('logout')),
    });
  }

  disconnectedCallback() { super.disconnectedCallback(); this.engine?.dispose(); this.engine = null; }

  render() {
    if (!this.webglOk) {
      return html`<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
        background:#0A0503;color:#C8B898;font-family:serif;text-align:center;padding:40px;">
        <div><h2 style="color:#E6A817;font-family:'Cinzel Decorative',serif">WebGL no disponible</h2>
        <p>Este entorno requiere un navegador con WebGL para la experiencia espacial.</p></div></div>`;
    }
    return html`<div id="space-host" style="position:fixed;inset:0;overflow:hidden;background:#0A0503;"></div>`;
  }
}
customElements.define('shell-space', ShellSpace);
```

- [ ] **Step 2: Crear stub mínimo de `SpaceEngine` para que el import resuelva**

Crear `shell/src/space/space-engine.ts` provisional:
```ts
import type { AppInfo } from '../services/protocol';
import './space.css';

export interface MountOpts { apps: AppInfo[]; onEnterApp: (a: AppInfo) => void; onLogout: () => void; }

export class SpaceEngine {
  private host: HTMLElement | null = null;
  mount(host: HTMLElement, _opts: MountOpts) {
    this.host = host;
    host.style.background = 'radial-gradient(circle at 50% 40%, #1A0E08, #0A0503)';
  }
  pause() {}
  resume() {}
  dispose() { if (this.host) this.host.innerHTML = ''; }
}
```

- [ ] **Step 3: Registrar e integrar en `shell-app.ts`**

En `main.ts` añadir `import './components/shell-space';`. En `shell-app.ts` `render()`, sustituir el bloque autenticado (topbar + shell-layout) por:
```ts
    return html`
      <shell-space
        .apps=${this.apps}
        .theme=${this.theme}
        @enter-app=${(e: CustomEvent) => { this.currentApp = (e.detail as AppInfo).id; }}
        @logout=${this.handleLogout}
      ></shell-space>
    `;
```
> Conservar `loadApps`, `handleLogin`, `handleLogout`, tema, listeners. No borrar imports de topbar/sidebar/container todavía (la cabina usará el container).

- [ ] **Step 4: Verificar**

Run: `pnpm --filter @plataforma/shell lint` → limpio.
Run: `pnpm --filter @plataforma/shell dev` → login; tras autenticar (o si ya hay token) se ve el host con degradado oscuro; sin errores de consola; sin scroll. Si no hay WebGL, la pantalla de guard.

- [ ] **Step 5: Commit**
```
git add shell/src/components/shell-space.ts shell/src/space/space-engine.ts shell/src/main.ts shell/src/components/shell-app.ts
git commit -m "feat(space): <shell-space> host + guard WebGL + reemplazo de dashboard post-login"
```

---

## FASE 1 — Motor + vuelo (volar en espacio vacío)

### Task 5: `space-engine.ts` real (renderer, escena, luces, bloom, loop, dispose)

**Files:**
- Modify: `shell/src/space/space-engine.ts`

- [ ] **Step 1: Implementar el motor base**

Portar setup del demo (líneas 642–682 init/lights, 1468–1478 composer, 1862–1869 resize). Estructura:
```ts
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { AppInfo } from '../services/protocol';
import './space.css';

export interface MountOpts { apps: AppInfo[]; onEnterApp: (a: AppInfo) => void; onLogout: () => void; }

export class SpaceEngine {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private canvas!: HTMLCanvasElement;
  private host!: HTMLElement;
  private rafId = 0;
  private running = false;
  private lastTime = 0;
  private elapsed = 0;
  private opts!: MountOpts;
  readonly worldOffset = new THREE.Vector3(); // §5 rebase

  // adaptive resolution
  private fpsSamples: number[] = [];
  private pixelRatio = Math.min(devicePixelRatio, 2);

  mount(host: HTMLElement, opts: MountOpts) {
    this.host = host; this.opts = opts;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'space-canvas';
    this.canvas.style.cssText = 'display:block;width:100vw;height:100vh;position:fixed;top:0;left:0;';
    host.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0A0503);
    this.scene.fog = new THREE.Fog(0x0A0503, 200, 600);

    this.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 1200);
    this.camera.position.set(0, 3, 8);

    // luces (demo 666–682)
    this.scene.add(new THREE.AmbientLight(0x3A2A20, 0.4));
    const starLight = new THREE.DirectionalLight(0xFF8C42, 1.5);
    starLight.position.set(50, 100, -200); starLight.castShadow = true;
    starLight.shadow.mapSize.set(1024, 1024); this.scene.add(starLight);
    const fill = new THREE.DirectionalLight(0x8B7A5A, 0.3); fill.position.set(-50, 30, 100); this.scene.add(fill);
    const warm = new THREE.PointLight(0xFF6B35, 0.5, 80); warm.position.set(20, 10, 30); this.scene.add(warm);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.5, 0.15));

    addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.start();
  }

  // hooks que rellenan fases posteriores:
  protected onFrame(_delta: number, _elapsed: number) {}

  private loop = (time: number) => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);
    let delta = (time - this.lastTime) / 1000; this.lastTime = time;
    if (!delta || delta > 0.1) delta = 0.016;
    this.elapsed += delta;
    this.trackFps(delta);
    this.onFrame(delta, this.elapsed);
    this.composer.render();
  };

  private trackFps(delta: number) {
    this.fpsSamples.push(1 / delta);
    if (this.fpsSamples.length > 60) {
      const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
      this.fpsSamples.length = 0;
      if (avg < 25 && this.pixelRatio > 1) { this.pixelRatio = Math.max(1, this.pixelRatio - 0.5); this.renderer.setPixelRatio(this.pixelRatio); }
      else if (avg > 50 && this.pixelRatio < Math.min(devicePixelRatio, 2)) { this.pixelRatio = Math.min(Math.min(devicePixelRatio, 2), this.pixelRatio + 0.5); this.renderer.setPixelRatio(this.pixelRatio); }
    }
  }

  private onResize = () => {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight);
  };
  private onVisibility = () => { document.hidden ? this.pause() : this.resume(); };

  start() { if (!this.running) { this.running = true; this.lastTime = performance.now(); this.rafId = requestAnimationFrame(this.loop); } }
  pause() { this.running = false; cancelAnimationFrame(this.rafId); }
  resume() { if (!document.hidden) this.start(); }

  dispose() {
    this.pause();
    removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.scene?.traverse((o: any) => { o.geometry?.dispose?.(); const m = o.material; if (Array.isArray(m)) m.forEach((x) => x.dispose?.()); else m?.dispose?.(); });
    this.composer?.dispose?.();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
    this.host && (this.host.innerHTML = '');
  }
}
```

- [ ] **Step 2: Verificar**

Run: `pnpm --filter @plataforma/shell lint` → limpio (puede requerir `"types": ["three"]` o que `@types/three` esté instalado).
Run: dev → tras login se ve fondo `#0A0503` (negro), sin objetos aún, FPS estable, sin errores. Cambiar de pestaña pausa (verificar en consola que no crece el RAF).

- [ ] **Step 3: Commit**
```
git add shell/src/space/space-engine.ts
git commit -m "feat(space): motor base (renderer, luces, bloom, loop, visibility, dispose)"
```

---

### Task 6: `flight.ts` + lógica pura de sector + integración

**Files:**
- Create: `shell/src/space/flight.ts`
- Create: `shell/src/space/layout.ts` (sección de sector/flight aquí)
- Create: `shell/src/space/layout.test.ts`
- Modify: `shell/src/space/space-engine.ts`

- [ ] **Step 1 (test primero — lógica pura): sector desde posición**

Crear `shell/src/space/layout.ts` con:
```ts
export function sectorOf(x: number, z: number, size = 50): { sx: number; sz: number } {
  return { sx: Math.floor(x / size), sz: Math.floor(z / size) };
}
```
Crear `shell/src/space/layout.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { sectorOf } from './layout';
describe('sectorOf', () => {
  it('mapea origen a 0:0', () => { expect(sectorOf(0, 0)).toEqual({ sx: 0, sz: 0 }); });
  it('mapea negativos con floor', () => { expect(sectorOf(-10, -60)).toEqual({ sx: -1, sz: -2 }); });
  it('respeta el tamaño', () => { expect(sectorOf(120, 0, 50)).toEqual({ sx: 2, sz: 0 }); });
});
```

- [ ] **Step 2: Ejecutar test (debe fallar → pasar)**

Run: `pnpm --filter @plataforma/shell test` → 3 passed.

- [ ] **Step 3: Implementar `FlightController`**

Portar física del demo (1600–1733) a una clase. Contrato:
```ts
import * as THREE from 'three';

export interface FlightState { speed: number; isNitro: boolean; yaw: number; pitch: number; }

export class FlightController {
  private keys: Record<string, boolean> = {};
  private pointerLocked = false;
  private mouseDX = 0; private mouseDY = 0;
  private velocity = new THREE.Vector3();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private forward = new THREE.Vector3();
  yaw = 0; pitch = 0;
  maxSpeed = 30; acceleration = 20; damping = 0.97; rotationSpeed = 1.2; nitroMultiplier = 3;
  onPointerLockChange?: (locked: boolean) => void;

  constructor(private camera: THREE.PerspectiveCamera, private canvas: HTMLCanvasElement) {}

  attach() {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('click', this.onCanvasClick);
    document.addEventListener('pointerlockchange', this.onPLChange);
    document.addEventListener('mousemove', this.onMouseMove);
  }
  detach() {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('click', this.onCanvasClick);
    document.removeEventListener('pointerlockchange', this.onPLChange);
    document.removeEventListener('mousemove', this.onMouseMove);
  }
  get isPointerLocked() { return this.pointerLocked; }

  private onKeyDown = (e: KeyboardEvent) => { this.keys[e.code] = true; if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault(); };
  private onKeyUp = (e: KeyboardEvent) => { this.keys[e.code] = false; };
  private onCanvasClick = () => { if (!this.pointerLocked) this.canvas.requestPointerLock(); };
  private onPLChange = () => { this.pointerLocked = document.pointerLockElement === this.canvas; this.onPointerLockChange?.(this.pointerLocked); };
  private onMouseMove = (e: MouseEvent) => { if (this.pointerLocked) { this.mouseDX = e.movementX; this.mouseDY = e.movementY; } };

  update(delta: number): FlightState {
    const sens = 0.002;
    if (this.pointerLocked) { this.yaw -= this.mouseDX * sens; this.pitch -= this.mouseDY * sens; this.pitch = Math.max(-0.8, Math.min(0.8, this.pitch)); this.mouseDX = 0; this.mouseDY = 0; }
    this.euler.set(this.pitch, this.yaw, 0); this.camera.quaternion.setFromEuler(this.euler);
    this.forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const isNitro = !!this.keys['Space']; const mult = isNitro ? this.nitroMultiplier : 1;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) this.velocity.add(this.forward.clone().multiplyScalar(this.acceleration * delta * mult));
    if (this.keys['KeyS'] || this.keys['ArrowDown']) this.velocity.sub(this.forward.clone().multiplyScalar(this.acceleration * delta * 0.5));
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) this.yaw -= this.rotationSpeed * delta;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) this.yaw += this.rotationSpeed * delta;
    const max = this.maxSpeed * mult; if (this.velocity.length() > max) this.velocity.normalize().multiplyScalar(max);
    this.velocity.multiplyScalar(this.damping);
    this.camera.position.add(this.velocity.clone().multiplyScalar(delta));
    return { speed: this.velocity.length(), isNitro, yaw: this.yaw, pitch: this.pitch };
  }
}
```

- [ ] **Step 4: Integrar en el motor**

En `SpaceEngine.mount`, tras crear cámara/canvas: `this.flight = new FlightController(this.camera, this.canvas); this.flight.attach();`. En `onFrame`: `this.lastFlight = this.flight.update(delta);`. En `dispose`: `this.flight?.detach();`. Añadir campos `private flight!: FlightController; lastFlight?: FlightState;`.

- [ ] **Step 5: Verificar**

Run: lint limpio; test verde.
Run: dev → click en el canvas bloquea el puntero; WASD mueve la cámara; el mouse rota; Space acelera; flechas no hacen scroll de la página.

- [ ] **Step 6: Commit**
```
git add shell/src/space/flight.ts shell/src/space/layout.ts shell/src/space/layout.test.ts shell/src/space/space-engine.ts
git commit -m "feat(space): control de vuelo WASD + pointer lock + nitro"
```

---

### Task 7: `hud.ts` (reticula, velocidad, nitro, coords, vignette, mensaje)

**Files:**
- Create: `shell/src/space/hud.ts`
- Modify: `shell/src/space/space-engine.ts`

- [ ] **Step 1: Implementar `Hud`**

Crea los nodos DOM (de `referencia-espacial.html` líneas 538–573) dentro del host, guardando referencias. Contrato:
```ts
import type { FlightState } from './flight';
import { sectorOf } from './layout';

export class Hud {
  private root: HTMLDivElement;
  private speedValue!: HTMLElement; private speedUnit!: HTMLElement;
  private nitroBar!: HTMLElement; private nitroFill!: HTMLElement;
  private sectorVal!: HTMLElement; private zVal!: HTMLElement; private sysVal!: HTMLElement;
  private startMsg!: HTMLElement;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.innerHTML = `
      <div id="vignette"></div>
      <div id="reticle"><div class="center-dot"></div></div>
      <div id="startMsg"><h1>Ramatzo</h1><p>
        <span class="key">W</span> <span class="key">A</span> <span class="key">S</span> <span class="key">D</span> Navegar &nbsp;·&nbsp;
        <span class="key">SPACE</span> Nitro &nbsp;·&nbsp; <span class="key">MOUSE</span> Mirar<br/>
        Haz clic en las constelaciones para explorar</p></div>
      <div id="hud"><div class="speed-display"><span class="value" id="speedValue">0</span> <span id="speedUnit">U/s</span></div>
        <div class="speed-unit">Velocidad de crucero</div></div>
      <div id="nitroBar"><div class="fill" id="nitroFill"></div></div>
      <div id="coords"><span class="label">SECTOR</span> <span id="sectorVal">0:0</span><br/>
        <span class="label">Z</span> <span id="zVal">0.00</span> AU<br/>
        <span class="label">SISTEMAS</span> <span id="sysVal">OK</span></div>`;
    host.appendChild(this.root);
    const q = (id: string) => this.root.querySelector('#' + id) as HTMLElement;
    this.speedValue = q('speedValue'); this.speedUnit = q('speedUnit');
    this.nitroBar = q('nitroBar'); this.nitroFill = q('nitroFill');
    this.sectorVal = q('sectorVal'); this.zVal = q('zVal'); this.sysVal = q('sysVal');
    this.startMsg = q('startMsg');
  }

  update(state: FlightState, worldX: number, worldZ: number, maxNitro: number) {
    this.speedValue.textContent = state.speed.toFixed(1);
    this.zVal.textContent = (Math.abs(worldZ) * 0.01).toFixed(2);
    const { sx, sz } = sectorOf(worldX, worldZ);
    this.sectorVal.textContent = `${sx}:${sz}`;
    if (state.isNitro) { this.nitroBar.classList.add('active'); this.nitroFill.style.width = Math.min(100, (state.speed / maxNitro) * 100) + '%'; this.speedUnit.textContent = 'NITRO'; this.speedUnit.style.color = 'var(--orange-ember)'; }
    else { this.nitroBar.classList.remove('active'); this.speedUnit.textContent = 'U/s'; this.speedUnit.style.color = ''; }
    this.sysVal.textContent = 'OK';
  }
  hideStartMessage() { this.startMsg.classList.add('hidden'); }
  dispose() { this.root.remove(); }
}
```

- [ ] **Step 2: Integrar**

En `mount`: `this.hud = new Hud(host);` y `this.flight.onPointerLockChange = (l) => { if (l) this.hud.hideStartMessage(); };`. En `onFrame`: `const w = this.camera.position; this.hud.update(this.lastFlight!, w.x + this.worldOffset.x, w.z + this.worldOffset.z, this.flight.maxSpeed * this.flight.nitroMultiplier);`. En `dispose`: `this.hud?.dispose();`.

- [ ] **Step 3: Verificar**

Run: lint limpio. dev → reticula central visible, vignette en bordes, mensaje de inicio que desaparece al bloquear puntero, velocidad/sector actualizan al volar, barra nitro aparece con Space.

- [ ] **Step 4: Commit**
```
git add shell/src/space/hud.ts shell/src/space/space-engine.ts
git commit -m "feat(space): HUD (reticula, velocidad, nitro, coords, vignette)"
```

---

## FASE 2 — Fondo del universo (galaxia + streaming de estrellas)

### Task 8: `star-gas.ts` — fábrica de campos estelares

**Files:**
- Create: `shell/src/space/star-gas.ts`

- [ ] **Step 1: Implementar fábrica**

Material shader compartido (fragment de gas del demo 807–832) + builder de geometría con RNG inyectable (determinismo). Contrato:
```ts
import * as THREE from 'three';

let sharedMaterial: THREE.ShaderMaterial | null = null;

export function getStarGasMaterial(renderer: THREE.WebGLRenderer): THREE.ShaderMaterial {
  if (sharedMaterial) return sharedMaterial;
  sharedMaterial = new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: renderer.getPixelRatio() }, uTime: { value: 0 } },
    vertexShader: `attribute float size; attribute vec3 color; varying vec3 vColor; uniform float uPixelRatio;
      void main(){ vColor=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*uPixelRatio*(80.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vColor; uniform float uTime;
      void main(){ vec2 c=vec2(0.5); float d=distance(gl_PointCoord,c); float a=1.0-smoothstep(0.2,0.7,d); float core=exp(-d*15.0);
        float pulse=0.85+0.15*sin(uTime*0.5+d*10.0); vec3 col=mix(vColor*0.4,vColor*1.2,core)*pulse; gl_FragColor=vec4(col,a*0.85); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  return sharedMaterial;
}
export function setStarGasTime(t: number) { if (sharedMaterial) sharedMaterial.uniforms.uTime.value = t; }
export function disposeStarGasMaterial() { sharedMaterial?.dispose(); sharedMaterial = null; }

const PALETTE = [0xFFE4C4, 0xFF8C42, 0xD43A1A];

export function buildStarFieldGeometry(opts: {
  count: number; sizeBounds: [number, number];
  box: { min: [number, number, number]; max: [number, number, number] };
  rng: () => number;
}): THREE.BufferGeometry {
  const { count, sizeBounds, box, rng } = opts;
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), sizes = new Float32Array(count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    positions[i*3]   = box.min[0] + rng() * (box.max[0] - box.min[0]);
    positions[i*3+1] = box.min[1] + rng() * (box.max[1] - box.min[1]);
    positions[i*3+2] = box.min[2] + rng() * (box.max[2] - box.min[2]);
    const t = rng(); c.setHex(t < 0.6 ? PALETTE[0] : t < 0.8 ? PALETTE[1] : PALETTE[2]);
    colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
    sizes[i] = sizeBounds[0] + rng() * (sizeBounds[1] - sizeBounds[0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  return g;
}
```

- [ ] **Step 2: Verificar**

Run: lint limpio. (Sin uso visual aún; lo consume `chunks.ts`.)

- [ ] **Step 3: Commit**
```
git add shell/src/space/star-gas.ts
git commit -m "feat(space): fábrica de campos estelares (shader gas + geometría sembrada)"
```

---

### Task 9: `galaxy.ts` — fondo espiral

**Files:**
- Create: `shell/src/space/galaxy.ts`
- Modify: `shell/src/space/space-engine.ts`

- [ ] **Step 1: Implementar**

Portar `createGalaxy` del demo (688–763) a:
```ts
import * as THREE from 'three';
export function createGalaxy(renderer: THREE.WebGLRenderer): { object: THREE.Points; update(elapsed: number, delta: number, playerPos: THREE.Vector3): void; dispose(): void } {
  /* port líneas 688–762: 80000 puntos, 4 brazos, shader de gas (vertex 728–740, fragment 742–752),
     AdditiveBlending, depthWrite false. galaxy.position.y = -20. */
  // update: galaxy.rotation.y += delta*0.008; galaxy.rotation.x = sin(elapsed*0.003)*0.05;
  //         galaxy.position.x = playerPos.x; galaxy.position.z = playerPos.z; (seguir al jugador a gran escala)
  // dispose: geometry.dispose(); material.dispose();
}
```

- [ ] **Step 2: Integrar**

En `mount`: `this.galaxy = createGalaxy(this.renderer); this.scene.add(this.galaxy.object);`. En `onFrame`: `this.galaxy.update(this.elapsed, delta, this.camera.position);`. En `dispose`: `this.galaxy.dispose();`.

- [ ] **Step 3: Verificar**

Run: lint limpio. dev → galaxia espiral naranja de fondo con bloom cálido; rota lento; al volar lejos no "te alcanza" (sigue al jugador).

- [ ] **Step 4: Commit**
```
git add shell/src/space/galaxy.ts shell/src/space/space-engine.ts
git commit -m "feat(space): galaxia espiral de fondo"
```

---

### Task 10: `chunks.ts` — streaming del campo estelar (PRIORIDAD)

**Files:**
- Create: `shell/src/space/chunks.ts`
- Modify: `shell/src/space/layout.ts` (chunk math puro)
- Create: `shell/src/space/chunks.test.ts`
- Modify: `shell/src/space/space-engine.ts`

- [ ] **Step 1 (test primero): math de chunks en `layout.ts`**

Añadir a `layout.ts`:
```ts
export function chunkCoord(v: number, size: number): number { return Math.floor(v / size); }
export function chunkKey(cx: number, cy: number, cz: number): string { return `${cx}_${cy}_${cz}`; }
export function hashChunk(cx: number, cy: number, cz: number): number {
  let h = (cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791);
  h = h >>> 0; return h || 1;
}
export function seededRng(seed: number): () => number {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
export function neededChunkKeys(cx: number, cy: number, cz: number, r: number): string[] {
  const keys: string[] = [];
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) keys.push(chunkKey(cx+dx, cy+dy, cz+dz));
  return keys;
}
```

Crear `shell/src/space/chunks.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { chunkKey, hashChunk, seededRng, neededChunkKeys, chunkCoord } from './layout';
describe('chunk math', () => {
  it('chunkCoord usa floor', () => { expect(chunkCoord(-1, 100)).toBe(-1); expect(chunkCoord(250, 100)).toBe(2); });
  it('chunkKey es estable', () => { expect(chunkKey(1, -2, 3)).toBe('1_-2_3'); });
  it('hashChunk es determinista y positivo', () => { expect(hashChunk(1,2,3)).toBe(hashChunk(1,2,3)); expect(hashChunk(1,2,3)).toBeGreaterThan(0); });
  it('seededRng es determinista en [0,1)', () => { const a = seededRng(42), b = seededRng(42); for (let i=0;i<5;i++){ const v=a(); expect(v).toBe(b()); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1);} });
  it('neededChunkKeys cubre (2r+1)^3', () => { expect(neededChunkKeys(0,0,0,2).length).toBe(125); });
});
```

- [ ] **Step 2: Ejecutar test**

Run: `pnpm --filter @plataforma/shell test` → todo verde (8 tests acumulados).

- [ ] **Step 3: Implementar `ChunkManager`**

```ts
import * as THREE from 'three';
import { getStarGasMaterial, buildStarFieldGeometry } from './star-gas';
import { chunkCoord, chunkKey, hashChunk, seededRng, neededChunkKeys } from './layout';

interface Chunk { key: string; points: THREE.Points; }

export class ChunkManager {
  private chunkSize: THREE.Vector3;
  private loadRadius: number;
  private starsPerChunk: number;
  private maxLoaded: number;
  private active = new Map<string, Chunk>();
  private pool: THREE.Points[] = [];
  private queue: { cx: number; cy: number; cz: number; key: string }[] = [];
  private worldOffset = new THREE.Vector3();

  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer, opts?: { chunkSize?: [number,number,number]; loadRadius?: number; starsPerChunk?: number; maxLoadedChunks?: number }) {
    this.chunkSize = new THREE.Vector3(...(opts?.chunkSize ?? [100, 100, 50]));
    this.loadRadius = opts?.loadRadius ?? 2;
    this.starsPerChunk = opts?.starsPerChunk ?? 500;
    this.maxLoaded = opts?.maxLoadedChunks ?? 125;
  }

  setLoadRadius(r: number) { this.loadRadius = Math.max(1, r); }
  get loadedCount() { return this.active.size; }

  update(playerWorldPos: THREE.Vector3) {
    const cx = chunkCoord(playerWorldPos.x, this.chunkSize.x);
    const cy = chunkCoord(playerWorldPos.y, this.chunkSize.y);
    const cz = chunkCoord(playerWorldPos.z, this.chunkSize.z);
    const needed = new Set(neededChunkKeys(cx, cy, cz, this.loadRadius));

    // descargar fuera de rango (a pool)
    for (const [key, ch] of this.active) {
      if (!needed.has(key)) { this.scene.remove(ch.points); this.pool.push(ch.points); this.active.delete(key); }
    }
    // encolar faltantes ordenados por cercanía (cap maxLoaded)
    this.queue = [];
    for (let dx = -this.loadRadius; dx <= this.loadRadius; dx++)
      for (let dy = -this.loadRadius; dy <= this.loadRadius; dy++)
        for (let dz = -this.loadRadius; dz <= this.loadRadius; dz++) {
          const k = chunkKey(cx+dx, cy+dy, cz+dz);
          if (!this.active.has(k)) this.queue.push({ cx: cx+dx, cy: cy+dy, cz: cz+dz, key: k });
        }
    this.queue.sort((a, b) => (Math.abs(a.cx-cx)+Math.abs(a.cy-cy)+Math.abs(a.cz-cz)) - (Math.abs(b.cx-cx)+Math.abs(b.cy-cy)+Math.abs(b.cz-cz)));

    // procesar presupuesto por frame (~4 chunks); respeta maxLoaded
    let budget = 4;
    while (budget-- > 0 && this.queue.length && this.active.size < this.maxLoaded) {
      const job = this.queue.shift()!; this.loadChunk(job.cx, job.cy, job.cz, job.key);
    }
    if (this.queue.length && this.active.size >= this.maxLoaded) console.debug(`[chunks] cap ${this.maxLoaded} alcanzado; ${this.queue.length} en espera`);
  }

  private loadChunk(cx: number, cy: number, cz: number, key: string) {
    const rng = seededRng(hashChunk(cx, cy, cz));
    const min: [number,number,number] = [0, 0, 0];
    const max: [number,number,number] = [this.chunkSize.x, this.chunkSize.y, this.chunkSize.z];
    let points = this.pool.pop();
    if (points) {
      const g = buildStarFieldGeometry({ count: this.starsPerChunk, sizeBounds: [1, 4], box: { min, max }, rng });
      points.geometry.dispose(); points.geometry = g;
    } else {
      const g = buildStarFieldGeometry({ count: this.starsPerChunk, sizeBounds: [1, 4], box: { min, max }, rng });
      points = new THREE.Points(g, getStarGasMaterial(this.renderer));
    }
    points.position.set(cx * this.chunkSize.x - this.worldOffset.x, cy * this.chunkSize.y - this.worldOffset.y, cz * this.chunkSize.z - this.worldOffset.z);
    points.frustumCulled = true;
    this.scene.add(points);
    this.active.set(key, { key, points });
  }

  rebase(delta: THREE.Vector3) {
    this.worldOffset.add(delta);
    for (const { points } of this.active.values()) points.position.sub(delta);
  }

  dispose() {
    for (const { points } of this.active.values()) { this.scene.remove(points); points.geometry.dispose(); }
    for (const p of this.pool) p.geometry.dispose();
    this.active.clear(); this.pool.length = 0;
  }
}
```

> Nota: el fade-in de opacidad por chunk se omite por simplicidad de material compartido; el `fog` (200–600) y el orden por cercanía hacen que la aparición sea suave. Si se ve pop-in molesto, se materializa con un atributo `aOpacity` por chunk (enhancement, no bloqueante).

- [ ] **Step 4: Integrar y retirar star-gas estático**

En `mount`: `this.chunks = new ChunkManager(this.scene, this.renderer);`. En `onFrame`: `setStarGasTime(this.elapsed); this.chunks.update(this.camera.position.clone().add(this.worldOffset));`. En `dispose`: `this.chunks.dispose(); disposeStarGasMaterial();` (importar `setStarGasTime`, `disposeStarGasMaterial`).

- [ ] **Step 5: Verificar**

Run: lint limpio; test verde.
Run: dev → al volar (WASD) aparecen estrellas por delante y desaparecen atrás; `engine.chunks.loadedCount` se mantiene acotado (≤125); FPS estable tras volar 30s; sin crecimiento de memoria sostenido (DevTools Performance Monitor → JS heap estable y GPU memory acotada).

- [ ] **Step 6: Commit**
```
git add shell/src/space/chunks.ts shell/src/space/layout.ts shell/src/space/chunks.test.ts shell/src/space/space-engine.ts
git commit -m "feat(space): streaming de estrellas por chunks (grid + pooling + semilla determinista)"
```

---

## FASE 3 — Constelaciones, planetas, radar (apps reales)

### Task 11: `planet.ts` — planeta de magma

**Files:**
- Create: `shell/src/space/planet.ts`

- [ ] **Step 1: Implementar**

Portar `createPlanet` del demo (1356–1448): esfera deformada por ruido + ShaderMaterial de magma (vertex 1382–1389, fragment 1391–1440). Firma:
```ts
import * as THREE from 'three';
import { seededRng } from './layout';
export function createPlanet(radius: number, seed: number, baseColor: number): THREE.Mesh {
  const detail = radius < 4 ? 16 : 32; // LOD por tamaño
  /* port 1356–1447 usando seededRng(seed) en lugar del RNG inline;
     uColor3 = baseColor; castShadow/receiveShadow true; userData lo asigna el llamador. */
}
```

- [ ] **Step 2: Verificar**

Run: lint limpio.

- [ ] **Step 3: Commit**
```
git add shell/src/space/planet.ts
git commit -m "feat(space): planeta irregular con shader de magma"
```

---

### Task 12: `constellation.ts` — una constelación

**Files:**
- Create: `shell/src/space/constellation.ts`

- [ ] **Step 1: Implementar**

Portar `createConstellation` + `createGlowTexture` del demo (1205–1354), parametrizado por `AppInfo` y layout. Firma:
```ts
import * as THREE from 'three';
import type { AppInfo } from '../services/protocol';
import { createPlanet } from './planet';
import { seededRng } from './layout';

export interface ConstellationLayout { position: THREE.Vector3; color: number; }

export function createConstellation(app: AppInfo, layout: ConstellationLayout, renderer: THREE.WebGLRenderer): THREE.Group {
  /* port 1205–1337:
     - 10–18 estrellas (shader points 1237–1271) color uColor=layout.color
     - líneas de conexión (<4u) 1276–1299
     - nebulosa sprite (createGlowTexture, 1301–1311)
     - 1–2 planetas vía createPlanet(3 + rng()*5, hash, layout.color) con userData {orbitRadius, orbitSpeed, orbitOffset}
     group.position.copy(layout.position)
     group.userData = { app, points, planets, mat, lineMat }  // 'points' para el raycaster
     usar seededRng a partir de app.id (charCodes) para reproducibilidad */
}
```

- [ ] **Step 2: Verificar**

Run: lint limpio.

- [ ] **Step 3: Commit**
```
git add shell/src/space/constellation.ts
git commit -m "feat(space): constelación individual (estrellas, líneas, nebulosa, planetas)"
```

---

### Task 13: `constellations.ts` + layout desde registry (con tests)

**Files:**
- Modify: `shell/src/space/layout.ts` (layout + color por categoría)
- Modify: `shell/src/space/layout.test.ts`
- Create: `shell/src/space/constellations.ts`
- Modify: `shell/src/space/space-engine.ts`

- [ ] **Step 1 (test primero): layout y color por categoría**

Añadir a `layout.ts`:
```ts
import * as THREE from 'three';
const CATEGORY_COLORS: Record<string, number> = {
  'Analítica': 0xD4A84B, 'Herramientas': 0xC84B31, 'Juegos': 0xD43A1A, 'Sistema': 0x6B8A3A, 'Pruebas': 0x5A4A3A,
};
export function colorForCategory(category: string | undefined): number {
  if (category && CATEGORY_COLORS[category] != null) return CATEGORY_COLORS[category];
  let h = 0; for (const ch of category ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return [0xE6A817, 0xFF6B35, 0x8B7A5A, 0xB86A3A][h % 4];
}
export function constellationPosition(index: number): { x: number; y: number; z: number } {
  const z = -50 - index * 45;
  const x = (index % 2 === 0 ? 1 : -1) * (25 + (index * 13) % 35);
  const y = ((index * 7) % 8) - 3;
  return { x, y, z };
}
```

Añadir a `layout.test.ts`:
```ts
import { colorForCategory, constellationPosition } from './layout';
describe('layout de constelaciones', () => {
  it('color por categoría conocida', () => { expect(colorForCategory('Juegos')).toBe(0xD43A1A); });
  it('color determinista para categoría desconocida', () => { expect(colorForCategory('Z')).toBe(colorForCategory('Z')); });
  it('posiciones se alejan en -Z y no colisionan en índice', () => {
    const a = constellationPosition(0), b = constellationPosition(1);
    expect(a.z).toBeGreaterThan(b.z); expect(Math.sign(a.x)).not.toBe(Math.sign(b.x));
  });
});
```

- [ ] **Step 2: Ejecutar test** → verde.

- [ ] **Step 3: Implementar `ConstellationManager`**

```ts
import * as THREE from 'three';
import type { AppInfo } from '../services/protocol';
import { createConstellation } from './constellation';
import { colorForCategory, constellationPosition } from './layout';

export class ConstellationManager {
  private groups: THREE.Group[] = [];
  private points: THREE.Points[] = [];
  private raycaster = new THREE.Raycaster();
  private center = new THREE.Vector2(0, 0);

  constructor(private scene: THREE.Scene, apps: AppInfo[], renderer: THREE.WebGLRenderer) {
    apps.forEach((app, i) => {
      const p = constellationPosition(i);
      const group = createConstellation(app, { position: new THREE.Vector3(p.x, p.y, p.z), color: colorForCategory(app.category) }, renderer);
      this.scene.add(group); this.groups.push(group); this.points.push(group.userData.points as THREE.Points);
    });
  }

  update(elapsed: number, _delta: number) {
    for (const g of this.groups) {
      const ud = g.userData as any;
      if (ud.mat?.uniforms?.uTime) ud.mat.uniforms.uTime.value = elapsed;
      for (const planet of ud.planets ?? []) {
        const { orbitRadius, orbitSpeed, orbitOffset } = planet.userData;
        const a = elapsed * orbitSpeed + orbitOffset;
        planet.position.x = orbitRadius * Math.cos(a); planet.position.z = orbitRadius * Math.sin(a);
        planet.rotation.y += 0.005;
        if (planet.material.uniforms?.uTime) planet.material.uniforms.uTime.value = elapsed;
      }
    }
  }

  raycastFromCenter(camera: THREE.Camera): AppInfo | null {
    this.raycaster.setFromCamera(this.center, camera);
    const hits = this.raycaster.intersectObjects(this.points, false);
    if (hits.length) { const g = hits[0].object.parent as THREE.Group; return (g?.userData as any)?.app ?? null; }
    return null;
  }

  getRadarBlips() { return this.groups.map((g) => ({ name: (g.userData as any).app.name as string, position: g.position.clone() })); }
  rebase(delta: THREE.Vector3) { for (const g of this.groups) g.position.sub(delta); }
  dispose() {
    for (const g of this.groups) { this.scene.remove(g); g.traverse((o: any) => { o.geometry?.dispose?.(); const m=o.material; Array.isArray(m)?m.forEach((x)=>x.dispose?.()):m?.dispose?.(); }); }
    this.groups = []; this.points = [];
  }
}
```

- [ ] **Step 4: Integrar**

En `mount` (tras chunks): `this.constellations = new ConstellationManager(this.scene, opts.apps, this.renderer);`. En `onFrame`: `this.constellations.update(this.elapsed, delta);`. En `dispose`: `this.constellations.dispose();`. Guardar `this.opts.apps`.

- [ ] **Step 5: Verificar**

Run: lint limpio; test verde.
Run: dev → aparecen tantas constelaciones como apps del registry (8), distribuidas en -Z, con planetas de magma orbitando; al apuntar la reticula a una constelación y hacer click (en pointer lock) la consola del raycaster encuentra el app (lo conectamos al overlay en Task 16).

- [ ] **Step 6: Commit**
```
git add shell/src/space/constellations.ts shell/src/space/layout.ts shell/src/space/layout.test.ts shell/src/space/space-engine.ts
git commit -m "feat(space): constelaciones desde app-registry (layout determinista + raycast + órbitas)"
```

---

### Task 14: `radar.ts` — radar 2D

**Files:**
- Create: `shell/src/space/radar.ts`
- Modify: `shell/src/space/space-engine.ts`

- [ ] **Step 1: Implementar**

Portar `drawRadar` del demo (1484–1594) a una clase que recibe blips. Firma:
```ts
import * as THREE from 'three';
export interface Blip { name: string; position: THREE.Vector3; }
export class Radar {
  private canvas: HTMLCanvasElement; private ctx: CanvasRenderingContext2D;
  private size = 180; private r = 78;
  constructor(host: HTMLElement) {
    this.canvas = document.createElement('canvas'); this.canvas.width = this.size; this.canvas.height = this.size;
    this.canvas.style.cssText = 'position:fixed;top:24px;left:24px;z-index:100;border-radius:50%;pointer-events:none;';
    host.appendChild(this.canvas); this.ctx = this.canvas.getContext('2d')!;
  }
  draw(playerPos: THREE.Vector3, yaw: number, blips: Blip[]) { /* port 1498–1594 usando blips en vez de `constellations` */ }
  show() { this.canvas.style.display = 'block'; }
  hide() { this.canvas.style.display = 'none'; }
  dispose() { this.canvas.remove(); }
}
```

- [ ] **Step 2: Integrar**

En `mount`: `this.radar = new Radar(host);`. En `onFrame`: `this.radar.draw(this.camera.position.clone().add(this.worldOffset), this.lastFlight!.yaw, this.constellations.getRadarBlips());`. En `dispose`: `this.radar.dispose();`. Exponer `pause()`/`resume()` para que la cabina oculte/reaparezca: en `pause()` `this.radar?.hide()`, en `resume()` `this.radar?.show()`.

- [ ] **Step 3: Verificar**

Run: lint limpio. dev → radar arriba-izquierda con anillos, blips de constelaciones que rotan con el rumbo, barrido, indicador de rumbo, "N".

- [ ] **Step 4: Commit**
```
git add shell/src/space/radar.ts shell/src/space/space-engine.ts
git commit -m "feat(space): radar 2D en tiempo real"
```

---

## FASE 4 — Naves + selección de proyecto

### Task 15: `spaceships.ts` — naves decorativas

**Files:**
- Create: `shell/src/space/spaceships.ts`
- Modify: `shell/src/space/space-engine.ts`

- [ ] **Step 1: Implementar**

Portar `createShipAuriga/Yunque/Flecha` + `placeShips` del demo (850–1172). Firma:
```ts
import * as THREE from 'three';
export function placeShips(scene: THREE.Scene): THREE.Group[] { /* port 1142–1170; cada nave userData {name, type:'ship'} */ }
export function floatShips(ships: THREE.Group[], elapsed: number, delta: number) { /* port 1841–1844 */ }
```

- [ ] **Step 2: Integrar**

En `mount`: `this.ships = placeShips(this.scene);`. En `onFrame`: `floatShips(this.ships, this.elapsed, delta);`. En `dispose`: recorrer y `dispose` geometrías/materiales (o `ConstellationManager`-style traverse helper).

- [ ] **Step 3: Verificar**

Run: lint limpio. dev → tres naves (Auriga, Yunque, Flecha) visibles cerca del spawn, flotando suavemente, con motores emisivos.

- [ ] **Step 4: Commit**
```
git add shell/src/space/spaceships.ts shell/src/space/space-engine.ts
git commit -m "feat(space): naves prefabricadas (Auriga, Yunque, Flecha)"
```

---

### Task 16: `project-overlay.ts` + click → overlay

**Files:**
- Create: `shell/src/space/project-overlay.ts`
- Modify: `shell/src/space/space-engine.ts`

- [ ] **Step 1: Implementar overlay**

```ts
import type { AppInfo } from '../services/protocol';
export class ProjectOverlay {
  private root: HTMLDivElement; private nameEl!: HTMLElement; private catEl!: HTMLElement; private descEl!: HTMLElement;
  private current: AppInfo | null = null;
  constructor(host: HTMLElement, private cb: { onEnter: (a: AppInfo) => void; onCancel: () => void }) {
    this.root = document.createElement('div'); this.root.id = 'projectInfo';
    this.root.innerHTML = `<div class="constellation-icon">&#9733;</div>
      <h2 id="ovName"></h2><div class="category" id="ovCat"></div><div class="desc" id="ovDesc"></div>
      <div class="actions"><button data-act="cancel">Cancelar</button><button class="primary" data-act="enter">Ingresar</button></div>`;
    host.appendChild(this.root);
    this.nameEl = this.root.querySelector('#ovName')!; this.catEl = this.root.querySelector('#ovCat')!; this.descEl = this.root.querySelector('#ovDesc')!;
    this.root.querySelector('[data-act="cancel"]')!.addEventListener('click', () => { this.hide(); this.cb.onCancel(); });
    this.root.querySelector('[data-act="enter"]')!.addEventListener('click', () => { if (this.current) this.cb.onEnter(this.current); });
  }
  get visible() { return this.root.classList.contains('visible'); }
  show(app: AppInfo) { this.current = app; this.nameEl.textContent = app.name; this.catEl.textContent = app.category ?? ''; this.descEl.textContent = (app as any).description ?? ''; this.root.classList.add('visible'); }
  hide() { this.root.classList.remove('visible'); this.current = null; }
  dispose() { this.root.remove(); }
}
```

- [ ] **Step 2: Integrar click→overlay→onEnterApp**

En `mount`: crear overlay con `onEnter: (a) => { this.overlay.hide(); this.opts.onEnterApp(a); }` y `onCancel: () => {}`. Añadir listener de click en canvas: `this.canvas.addEventListener('click', () => { if (!this.flight.isPointerLocked || this.overlay.visible) return; const app = this.constellations.raycastFromCenter(this.camera); if (app) { document.exitPointerLock(); this.overlay.show(app); } });`. En `dispose`: `this.overlay.dispose();`.

> El click de `FlightController` (requestPointerLock) y este click conviven: si ya hay pointer lock, este maneja la selección. Si el overlay está visible, ignora el click del canvas.

- [ ] **Step 3: Verificar**

Run: lint limpio. dev → apuntar reticula a una constelación + click → se libera el puntero y aparece la tarjeta con nombre/categoría/descripción reales del app; "Cancelar" cierra; "Ingresar" dispara `enter-app` (lo recibe `shell-app`, lo conectamos a la cabina en Task 17).

- [ ] **Step 4: Commit**
```
git add shell/src/space/project-overlay.ts shell/src/space/space-engine.ts
git commit -m "feat(space): overlay de proyecto + selección por reticula"
```

---

## FASE 5 — Cabina (iframe real) + logout

### Task 17: `<shell-cockpit>` + integración con la cabina

**Files:**
- Create: `shell/src/components/shell-cockpit.ts`
- Modify: `shell/src/components/shell-space.ts`
- Modify: `shell/src/components/shell-app.ts`
- Modify: `shell/src/main.ts`

- [ ] **Step 1: Implementar `<shell-cockpit>` (reutiliza `shell-app-container`)**

```ts
import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import type { AppInfo } from '../services/protocol';
import './shell-app-container';

export class ShellCockpit extends LitElement {
  @property({ type: Object }) app: AppInfo | null = null;
  @property({ type: String }) theme: 'light' | 'dark' = 'dark';
  static styles = css`/* port .cockpit-* del demo (332–506) adaptado a :host; usar var(--metal-*), var(--space-*), var(--orange-amber) */
    :host{position:fixed;inset:0;z-index:120;background:rgba(10,5,3,.95);display:flex;flex-direction:column;}
    .titlebar{display:flex;justify-content:space-between;align-items:center;padding:12px 24px;background:var(--metal-iron);border-bottom:1px solid var(--metal-steel);}
    .project-name{color:var(--orange-amber);font-family:var(--font-display);font-size:14px;letter-spacing:.12em;}
    .actions{display:flex;gap:8px;}
    button{padding:6px 18px;border:1px solid var(--metal-steel);border-radius:4px;background:transparent;color:var(--space-text);font-family:var(--font-serif);font-size:11px;cursor:pointer;text-transform:uppercase;letter-spacing:.1em;}
    button:hover{border-color:var(--orange-burnt);color:var(--orange-burnt);}
    .frame{flex:1;margin:40px;border:2px solid var(--metal-iron);border-radius:16px;position:relative;background:var(--space-deep);box-shadow:inset 0 0 80px rgba(58,42,32,.5);}
    .screen{position:absolute;inset:20px;border:1px solid var(--metal-brass);border-radius:8px;overflow:hidden;}
    .rivets{position:absolute;width:8px;height:8px;border-radius:50%;background:var(--metal-copper);} .tl{top:8px;left:8px}.tr{top:8px;right:8px}.bl{bottom:8px;left:8px}.br{bottom:8px;right:8px}
    shell-app-container{display:block;width:100%;height:100%;}
  `;
  render() {
    return html`
      <div class="titlebar"><span class="project-name">${this.app?.name ?? ''}</span>
        <div class="actions">
          <button @click=${() => this.dispatchEvent(new CustomEvent('back'))}>Volver al espacio</button>
          <button @click=${() => this.dispatchEvent(new CustomEvent('logout'))}>Salir</button>
        </div></div>
      <div class="frame">
        <div class="screen"><shell-app-container .app=${this.app} .theme=${this.theme}></shell-app-container></div>
        <div class="rivets tl"></div><div class="rivets tr"></div><div class="rivets bl"></div><div class="rivets br"></div>
      </div>`;
  }
}
customElements.define('shell-cockpit', ShellCockpit);
```

- [ ] **Step 2: Estado de cabina en `<shell-space>`**

En `shell-space.ts`: añadir `@state() private cockpitApp: AppInfo | null = null;`. Cambiar el handler de `onEnterApp` para `this.cockpitApp = app; this.engine?.pause();`. Añadir al `render()` (después del host):
```ts
${this.cockpitApp ? html`<shell-cockpit .app=${this.cockpitApp} .theme=${this.theme}
  @back=${() => { this.cockpitApp = null; this.engine?.resume(); }}
  @logout=${() => this.dispatchEvent(new CustomEvent('logout'))}></shell-cockpit>` : ''}
```
Importar `./shell-cockpit` en `main.ts`.

- [ ] **Step 3: Quitar el handler temporal en `shell-app.ts`**

El `@enter-app` que solo seteaba `currentApp` ya no hace falta (la cabina vive dentro de `<shell-space>`). Dejar solo `@logout=${this.handleLogout}`.

- [ ] **Step 4: Verificar (HITO CLAVE)**

Run: lint limpio.
Run: dev (con backend + apps servidas, o al menos la app objetivo) → volar a la constelación "Dashboard Comercial" → Ingresar → la cabina muestra el **iframe real** del dashboard React dentro del marco con remaches; el módulo funciona igual que antes (recibe token vía postMessage); "Volver al espacio" cierra la cabina y reanuda el vuelo; el radar reaparece. Probar con `viewer-3d` también.

- [ ] **Step 5: Commit**
```
git add shell/src/components/shell-cockpit.ts shell/src/components/shell-space.ts shell/src/components/shell-app.ts shell/src/main.ts
git commit -m "feat(space): cabina Lit con iframe real (shell-app-container) + volver/salir"
```

---

### Task 18: Menú ESC en el espacio (logout + info de nave)

**Files:**
- Modify: `shell/src/space/space-engine.ts`
- Modify: `shell/src/space/space.css`

- [ ] **Step 1: Implementar menú ESC**

En el motor, crear un overlay simple (oculto por defecto) con botones "Reanudar" y "Salir (logout)". Listener: `keydown` `Escape` → si no hay pointer lock ni overlay de proyecto, alterna el menú. "Salir" llama `this.opts.onLogout()`. Estilos mínimos en `space.css` (`#escMenu`).
> Pointer Lock ya libera con Escape de forma nativa; este menú aparece tras soltar el lock, por eso se ofrece como panel central. Evitar capturar Escape mientras `document.pointerLockElement` exista (el navegador lo usa para salir del lock).

- [ ] **Step 2: Verificar**

Run: lint limpio. dev → en el espacio, soltar el puntero (Esc) y pulsar Esc de nuevo muestra el menú; "Salir" cierra sesión y vuelve al login; "Reanudar" lo oculta.

- [ ] **Step 3: Commit**
```
git add shell/src/space/space-engine.ts shell/src/space/space.css
git commit -m "feat(space): menú ESC con logout e info en el espacio"
```

---

## FASE 6 — Ignición, rebase, pulido y verificación final

### Task 19: Estética de login + transición de ignición

**Files:**
- Modify: `shell/src/components/shell-login.ts`
- Modify: `shell/src/components/shell-space.ts`
- Modify: `shell/src/space/space.css` (o estilos del login)

- [ ] **Step 1: Refinar estética del login**

Revisar `shell-login.ts`; sin romper su funcionalidad (usa `authClient`), ajustar paleta a naranja/ámbar usando los tokens `--orange-*`/`--space-*` (fondo `--space-deep`, acento `--orange-burnt`, tipografía `--font-serif`/`--font-display`). Sin emojis.

- [ ] **Step 2: Transición de ignición**

Al `login-success`, antes de montar el motor, mostrar ~1.2 s de oscurecimiento desde bordes + vibración CSS (`@keyframes ignition-shake`) + fade. Implementar en `shell-space.ts` con una clase CSS temporal sobre el host, o en `shell-app.ts` entre el cambio de estado. Sin librerías nuevas.

- [ ] **Step 3: Verificar**

Run: lint limpio. dev → login con estética naranja/ámbar; al entrar, breve ignición y aparición del espacio.

- [ ] **Step 4: Commit**
```
git add shell/src/components/shell-login.ts shell/src/components/shell-space.ts shell/src/space/space.css
git commit -m "feat(space): login naranja/ámbar + transición de ignición"
```

---

### Task 20: Rebase de origen (precisión en distancias largas)

**Files:**
- Modify: `shell/src/space/space-engine.ts`

- [ ] **Step 1: Implementar rebase**

En `onFrame`, tras `flight.update`: 
```ts
const REBASE = 4000;
if (this.camera.position.length() > REBASE) {
  const cs = this.chunks /* chunkSize */; // usar [100,100,50]
  const delta = new THREE.Vector3(
    Math.round(this.camera.position.x / 100) * 100,
    Math.round(this.camera.position.y / 100) * 100,
    Math.round(this.camera.position.z / 50) * 50,
  );
  this.camera.position.sub(delta);
  this.worldOffset.add(delta);
  this.chunks.rebase(delta);
  this.constellations.rebase(delta);
  for (const s of this.ships) s.position.sub(delta);
  // galaxy sigue al jugador, no necesita rebase
}
```
Flag `REBASE_ENABLED = true` para poder desactivar si causa problemas (aislamiento de riesgo §5/§12 de la spec).

- [ ] **Step 2: Verificar**

Run: lint limpio. dev → volar con nitro en línea recta > 4000 U; al cruzar el umbral no hay salto visible ni jitter; HUD sigue mostrando sector creciente (usa `worldOffset`); chunks y constelaciones permanecen coherentes.

- [ ] **Step 3: Commit**
```
git add shell/src/space/space-engine.ts
git commit -m "feat(space): rebase de origen para precisión en espacio vasto"
```

---

### Task 21: Verificación integral, build y limpieza

**Files:**
- Modify: varios (solo si se encuentran fallos)

- [ ] **Step 1: Suite de tests + tipos + build**

Run: `pnpm --filter @plataforma/shell test` → todo verde.
Run: `pnpm --filter @plataforma/shell lint` → limpio.
Run: `pnpm --filter @plataforma/shell build` → build OK (verificar que el chunk de Three.js queda en dynamic import, no en el bundle de entrada).

- [ ] **Step 2: Recorrido manual completo (checklist §11 de la spec)**

dev con backend + apps servidas:
- Login → ignición → espacio con galaxia + estrellas en streaming + constelaciones + naves + radar + HUD.
- Volar (WASD, mouse, nitro), sin scroll de página, FPS estable.
- Abrir **cada una de las 8 apps** desde su constelación: el iframe carga y la app funciona igual (token llega). Volver al espacio entre cada una.
- Logout desde cabina y desde menú ESC; re-login no acumula contextos WebGL (consola sin warning "Too many active WebGL contexts").
- Cambiar de pestaña pausa el render.

- [ ] **Step 3: Auditoría de dispose**

Verificar en DevTools (Memory) que tras 5 ciclos login→volar→logout el heap no crece monotónicamente y no quedan listeners colgados.

- [ ] **Step 4: Commit final**
```
git add -A
git commit -m "test(space): verificación integral del port Constellation OS v2"
```

---

## Self-review (cobertura spec → tareas)

- §1 reemplazo dashboard / no tocar funcionamiento → Task 4, 17 (reutiliza `shell-app-container`); auth/protocolo intactos.
- §3 arquitectura motor+Lit → Task 4, 5, 17.
- §4 contratos de módulos → un módulo por Task (5–16).
- §4.4 chunks (prioridad) → Task 10 (+ tests Task 10).
- §5 rebase → Task 20.
- §6 carga dinámica + guard WebGL → Task 4.
- §7 ignición → Task 19.
- §8 tokens/fuentes → Task 1.
- §9 rendimiento (pixelRatio scaling, visibility, dispose) → Task 5, 21.
- §10 desviaciones (chunks incluido, cabina Lit, star-gas como fábrica) → Task 10, 17, 8.
- §11 verificación por hito → pasos de verificación en cada Task + Task 21.

Gaps: ninguno pendiente. Lógica pura cubierta por Vitest (Tasks 6, 10, 13); lo visual/WebGL por observación.
