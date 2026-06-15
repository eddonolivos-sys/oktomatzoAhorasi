---
# HUD reactivo y menú de pausa con cursor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Rebuild the in-space HUD so it reports real speed, real altitude and heading with a reticle that shows approach/dwell state, and add a single-ESC pause menu that recovers the cursor and re-locks on resume — implementing spec §5.6.

**Architecture:** Pure formatting logic (`hud-format.ts`) is extracted and unit-tested in the node Vitest environment; the THREE-free `Hud` and `PauseMenu` DOM classes consume `ShipState` (plan 01) and the `approaching`/`dwellProgress` values (plan 02). The pause menu hooks `pointerlockchange` so the browser-consumed first ESC both frees the mouse and opens the menu; `space-engine.ts` wires the gate and re-lock flow. A separate diagnostic task reproduces the "Skip"/deformed-UI bug via the dev server and documents whether it is in shell scope.

**Tech Stack:** TypeScript, Three.js 0.170, Lit 3, Vitest. Package @plataforma/shell.

**Depends on:** plan 01 (`ShipState`, `ShipController.requestControl()` / `isLocked` / `onLockChange`) and plan 02 (`SolarUpdate.approaching` / `dwellProgress`).

---
---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `shell/src/space/hud-format.ts` | Create | PURE: `formatAltitude(y)` and `formatHeading(yaw)` (0..359°). THREE-free, unit-tested. |
| `shell/src/space/hud-format.test.ts` | Create (Test) | Vitest unit tests for the pure formatters. |
| `shell/src/space/hud.ts` | Modify (full rewrite of class body) | Reactive HUD: reticle with idle/approaching states + circular dwell ring, real speed, real altitude, heading/compass, persistent controls legend. Removes the misleading `Z … AU` field. Consumes `ShipState`. |
| `shell/src/space/pause-menu.ts` | Create | `PauseMenu` class: cursor-visible overlay with `Reanudar control` / `Controles` / `Cerrar sesión`. THREE-free DOM. |
| `shell/src/space/space-engine.ts` | Modify (lines 60–67, 121–123, 154–161, 175–206, 252–292, 359–406) | Wire `pointerlockchange` interception, single-ESC handling, flight gate by `pauseMenu.visible`, re-lock on resume, new `hud.update(...)` signature. Remove old `buildEscMenu`/`onEscKey`/`toggleEscMenu`. |
| `shell/src/space/space.css` | Modify (lines 20–124 HUD block; 297–353 ESC block) | Reticle approaching state + SVG dwell ring, altitude/heading readouts, controls legend, pause-menu overlay (cursor visible). Remove `#coords` Z/AU rule reliance. |

**Note on shared contracts:** `ShipState` (from plan 01, defined in `ship-controller.ts`) and `SolarUpdate` (plan 02, `solar-system.ts`) are imported types. This plan does not redefine them. `Hud.update(state, info)` and `Hud.hideStartMessage()` / `Hud.dispose()` match the pinned `hud.ts` contract verbatim. `PauseMenu` matches the pinned `pause-menu.ts` contract verbatim.

---

### Task 1: `hud-format.ts` — pure altitude & heading formatters (TDD)

**Files:**
- Create Test: `shell/src/space/hud-format.test.ts`
- Create: `shell/src/space/hud-format.ts`

This is PURE logic (plain numbers/strings, no THREE). Strict TDD.

- [ ] **Step 1: Write the failing test**

Create `shell/src/space/hud-format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatAltitude, formatHeading } from './hud-format';

describe('formatAltitude', () => {
  it('formats zero as +0 u', () => {
    expect(formatAltitude(0)).toBe('+0 u');
  });
  it('rounds to the nearest unit and keeps a + sign above the plane', () => {
    expect(formatAltitude(123.4)).toBe('+123 u');
    expect(formatAltitude(123.6)).toBe('+124 u');
  });
  it('keeps a − sign below the plane (real unicode minus)', () => {
    expect(formatAltitude(-50)).toBe('−50 u');
  });
  it('groups thousands for large altitudes', () => {
    expect(formatAltitude(12345)).toBe('+12 345 u');
    expect(formatAltitude(-12345)).toBe('−12 345 u');
  });
});

describe('formatHeading', () => {
  it('maps yaw 0 to 000', () => {
    expect(formatHeading(0)).toBe('000');
  });
  it('wraps into 0..359 and pads to 3 digits', () => {
    expect(formatHeading(Math.PI / 2)).toBe('090');
    expect(formatHeading(Math.PI)).toBe('180');
  });
  it('wraps negative yaw into the positive range', () => {
    expect(formatHeading(-Math.PI / 2)).toBe('270');
  });
  it('wraps yaw beyond 2π', () => {
    expect(formatHeading(2 * Math.PI + Math.PI / 2)).toBe('090');
  });
  it('never returns 360 (folds back to 000)', () => {
    // yaw just under a full turn rounds to 360 -> must fold to 000
    expect(formatHeading(2 * Math.PI - 0.0001)).toBe('000');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/hud-format.test.ts`
  Expected: FAIL — `hud-format.ts` does not exist (`Cannot find module './hud-format'`).

- [ ] **Step 3: Write minimal implementation**

Create `shell/src/space/hud-format.ts`:

```ts
/**
 * Formateadores puros del HUD (sin Three.js, testeables en node).
 * Patrón de layout.ts: numbers in, strings out.
 */

const MINUS = '−'; // signo menos tipográfico
const THIN = ' ';  // separador de miles (espacio fino no separable)

function groupThousands(n: number): string {
  // n es un entero no negativo; agrupa de 3 en 3 con THIN.
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

/** Altitud real en unidades de escena (ship.y + worldOffset.y). */
export function formatAltitude(y: number): string {
  const rounded = Math.round(y);
  const sign = rounded < 0 ? MINUS : '+';
  return `${sign}${groupThousands(Math.abs(rounded))} u`;
}

/** Rumbo en grados 0..359 (3 dígitos) a partir del yaw en radianes. */
export function formatHeading(yaw: number): string {
  let deg = Math.round((yaw * 180) / Math.PI) % 360;
  if (deg < 0) deg += 360;
  if (deg === 360) deg = 0;
  return String(deg).padStart(3, '0');
}
```

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/hud-format.test.ts`
  Expected: PASS — all `formatAltitude` and `formatHeading` cases green.

- [ ] **Step 5: Commit**
  ```
  git add shell/src/space/hud-format.ts shell/src/space/hud-format.test.ts
  git commit -m "feat(space): pure HUD formatters (altitude, heading 0..359)"
  ```

---

### Task 2: `hud.ts` — reactive HUD (reticle states + dwell ring + altitude/heading; remove Z/AU)

**Files:**
- Modify: `shell/src/space/hud.ts` (full rewrite — lines 1–101)
- Modify: `shell/src/space/space.css` (HUD block lines 20–165)

This is a DOM class (no THREE objects, but not pure-testable because it mutates the DOM). Write the complete code, then verify manually.

**Contract (pinned):**
```ts
class Hud {
  constructor(host: HTMLElement);
  update(state: ShipState, info: { altitude: number; heading: number; approaching: { name: string } | null; dwellProgress: number }): void;
  hideStartMessage(): void;
  dispose(): void;
}
```

- [ ] **Step 1: Rewrite `hud.ts`**

Replace the entire contents of `shell/src/space/hud.ts` with:

```ts
import type { ShipState } from './ship-controller';
import { formatAltitude, formatHeading } from './hud-format';

/**
 * Overlay HUD in-space (DOM en light DOM). Reactivo: reticula con estado
 * (idle / aproximando con anillo de permanencia), velocidad real (sin tope),
 * altitud real y rumbo/brújula, leyenda de controles persistente y vignette.
 * Sin campo "Z … AU" (engañoso). Estilos en space.css. Sin Three.js.
 */
export class Hud {
  private root: HTMLDivElement;
  private reticle: HTMLElement;
  private dwellRing: SVGCircleElement;
  private reticleLabel: HTMLElement;
  private speedValue: HTMLElement;
  private speedUnit: HTMLElement;
  private altValue: HTMLElement;
  private headingValue: HTMLElement;
  private startMsg: HTMLElement;

  /** Circunferencia del círculo de progreso (r = 16). */
  private readonly ringCircumference = 2 * Math.PI * 16;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.innerHTML = `
      <div id="vignette"></div>
      <div id="reticle">
        <svg class="dwell" viewBox="0 0 40 40" aria-hidden="true">
          <circle class="dwell-track" cx="20" cy="20" r="16"></circle>
          <circle class="dwell-fill" cx="20" cy="20" r="16"></circle>
        </svg>
        <div class="center-dot"></div>
        <div class="reticle-label"></div>
      </div>
      <div id="startMsg">
        <h1>Ramatzo</h1>
        <p>
          <span class="key">RAT&Oacute;N</span> Mirar &nbsp;&middot;&nbsp;
          <span class="key">W</span><span class="key">S</span> Avanzar &nbsp;&middot;&nbsp;
          <span class="key">A</span><span class="key">D</span> Lateral &nbsp;&middot;&nbsp;
          <span class="key">SPACE</span> Nitro<br/>
          Acerca la nave a un planeta y mant&eacute;n el rumbo para entrar
        </p>
      </div>
      <div id="hud">
        <div class="speed-display"><span class="value" id="speedValue">0</span> <span id="speedUnit">U/s</span></div>
        <div class="speed-unit">Velocidad</div>
      </div>
      <div id="flightData">
        <div class="row"><span class="label">ALT</span> <span id="altValue">+0 u</span></div>
        <div class="row"><span class="label">RUMBO</span> <span id="headingValue">000</span>&deg;</div>
      </div>
      <div id="controlsLegend">
        <span class="key">RAT&Oacute;N</span> mirar
        <span class="key">W</span><span class="key">S</span> avanzar
        <span class="key">A</span><span class="key">D</span> lateral
        <span class="key">SPACE</span> nitro
        <span class="key">SHIFT</span> freno
        <span class="key">ESC</span> men&uacute;
      </div>`;
    host.appendChild(this.root);

    const q = (sel: string) => this.root.querySelector(sel) as HTMLElement;
    this.reticle = q('#reticle');
    this.dwellRing = this.root.querySelector('#reticle .dwell-fill') as unknown as SVGCircleElement;
    this.reticleLabel = q('#reticle .reticle-label');
    this.speedValue = q('#speedValue');
    this.speedUnit = q('#speedUnit');
    this.altValue = q('#altValue');
    this.headingValue = q('#headingValue');
    this.startMsg = q('#startMsg');

    // Estado inicial del anillo de permanencia: vacío.
    this.dwellRing.style.strokeDasharray = String(this.ringCircumference);
    this.dwellRing.style.strokeDashoffset = String(this.ringCircumference);
  }

  update(
    state: ShipState,
    info: { altitude: number; heading: number; approaching: { name: string } | null; dwellProgress: number },
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
      this.reticleLabel.textContent = info.approaching!.name;
      const p = Math.max(0, Math.min(1, info.dwellProgress));
      this.dwellRing.style.strokeDashoffset = String(this.ringCircumference * (1 - p));
    } else {
      this.reticleLabel.textContent = '';
      this.dwellRing.style.strokeDashoffset = String(this.ringCircumference);
    }
  }

  hideStartMessage() {
    this.startMsg.classList.add('hidden');
  }

  dispose() {
    this.root.remove();
  }
}
```

- [ ] **Step 2: Add HUD styles to `space.css`**

In `shell/src/space/space.css`, replace the `#coords` block (lines 79–95) — the Z/AU readout — with the new flight-data + controls-legend rules below. Use Edit to swap the `#coords` rule for:

```css
/* Datos de vuelo (altitud / rumbo) — reemplaza el antiguo #coords con Z/AU */
#flightData {
  position: fixed;
  bottom: 80px;
  right: 30px;
  z-index: 100;
  pointer-events: none;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--space-text);
  text-align: right;
  line-height: 1.7;
  letter-spacing: 0.08em;
}
#flightData .label {
  color: var(--space-text-2);
  margin-right: 6px;
}

/* Leyenda de controles persistente y discreta */
#controlsLegend {
  position: fixed;
  bottom: 18px;
  left: 30px;
  z-index: 100;
  pointer-events: none;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--space-text-2);
  letter-spacing: 0.06em;
  opacity: 0.6;
}
#controlsLegend .key {
  display: inline-block;
  padding: 1px 6px;
  margin: 0 3px 0 8px;
  border: 1px solid var(--metal-iron);
  border-radius: 3px;
  color: var(--space-text);
}
```

- [ ] **Step 3: Update the reticle styles for the approaching state + dwell ring**

In `shell/src/space/space.css`, replace the reticle block (lines 126–165, from `#reticle {` through the `#reticle .center-dot { … }` rule) with:

```css
/* Reticula */
#reticle {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 100;
  pointer-events: none;
  width: 40px;
  height: 40px;
}
#reticle::before,
#reticle::after {
  content: '';
  position: absolute;
  background: rgba(200, 184, 152, 0.15);
}
#reticle::before {
  width: 1px;
  height: 14px;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}
#reticle::after {
  width: 14px;
  height: 1px;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}
#reticle .center-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--orange-amber);
  box-shadow: 0 0 6px rgba(230, 168, 23, 0.3);
}
/* Anillo de permanencia (dwell): círculo SVG centrado en la reticula */
#reticle .dwell {
  position: absolute;
  inset: 0;
  width: 40px;
  height: 40px;
  transform: rotate(-90deg); /* empieza arriba */
  opacity: 0;
  transition: opacity 0.2s;
}
#reticle .dwell circle {
  fill: none;
  stroke-width: 2;
}
#reticle .dwell .dwell-track {
  stroke: rgba(230, 168, 23, 0.12);
}
#reticle .dwell .dwell-fill {
  stroke: var(--orange-amber);
  stroke-linecap: round;
  filter: drop-shadow(0 0 4px rgba(230, 168, 23, 0.5));
  transition: stroke-dashoffset 0.05s linear;
}
#reticle.approaching .dwell {
  opacity: 1;
}
#reticle.approaching .center-dot {
  background: var(--orange-ember);
  box-shadow: 0 0 10px rgba(255, 107, 53, 0.6);
}
/* Etiqueta de aproximación bajo la reticula */
#reticle .reticle-label {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translate(-50%, 8px);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--orange-amber);
  text-shadow: 0 0 8px rgba(230, 168, 23, 0.4), 0 1px 2px #000;
  opacity: 0;
  transition: opacity 0.2s;
}
#reticle.approaching .reticle-label {
  opacity: 1;
}
```

- [ ] **Step 4: Remove the now-dead nitro-bar CSS reliance (optional cleanup)**

The HUD no longer renders `#nitroBar` / `#coords`. Leave the `#nitroBar` rules (lines 51–77) untouched for now (harmless dead CSS; a later cleanup task in plan 06 may prune them). Do NOT add `setStray`/`#strayWarn` usage — it is removed from the HUD class. Leave the `#strayWarn` CSS (lines 97–124) as harmless dead rules.

- [ ] **Step 5: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS for `hud.ts` (assuming `ship-controller.ts` exports `ShipState` from plan 01). If plan 01 is not yet merged, this task is blocked — confirm `import type { ShipState } from './ship-controller';` resolves before continuing. Note: `space-engine.ts` still references the old `Hud.update` signature at this point, so the full project lint will fail there until Task 4 — that is expected; only `hud.ts` itself must compile cleanly.

- [ ] **Step 6: Commit**
  ```
  git add shell/src/space/hud.ts shell/src/space/space.css
  git commit -m "feat(space): reactive HUD with dwell reticle, real altitude/heading, no Z/AU"
  ```

---

### Task 3: `pause-menu.ts` — cursor-visible pause overlay

**Files:**
- Create: `shell/src/space/pause-menu.ts`
- Modify: `shell/src/space/space.css` (replace `#escMenu` block, lines 297–353)

DOM class (no THREE). Write complete code, verify manually.

**Contract (pinned):**
```ts
class PauseMenu {
  constructor(host: HTMLElement, cb: { onResume: () => void; onLogout: () => void });
  open(): void;
  close(): void;
  get visible(): boolean;
  dispose(): void;
}
```

- [ ] **Step 1: Create `pause-menu.ts`**

Create `shell/src/space/pause-menu.ts`:

```ts
/**
 * Menú de pausa con cursor. Un overlay a pantalla completa que muestra el
 * cursor (el host recupera pointer-events) con botones "Reanudar control",
 * "Controles", "Cerrar sesión". El cuándo abrirlo (intercepción del primer
 * ESC vía pointerlockchange) lo decide space-engine; esta clase solo dibuja
 * el overlay y emite callbacks. Sin Three.js. Estilos en space.css.
 */
export class PauseMenu {
  private root: HTMLDivElement;
  private controlsPanel: HTMLElement;
  private _visible = false;

  constructor(host: HTMLElement, cb: { onResume: () => void; onLogout: () => void }) {
    this.root = document.createElement('div');
    this.root.id = 'pauseMenu';
    this.root.innerHTML = `
      <div class="panel">
        <h3>Pausa</h3>
        <button data-act="resume">Reanudar control</button>
        <button data-act="controls">Controles</button>
        <button data-act="logout">Cerrar sesi&oacute;n</button>
        <div class="controls-panel" hidden>
          <p>
            <span class="key">RAT&Oacute;N</span> mirar<br/>
            <span class="key">W</span> avanzar &middot; <span class="key">S</span>/<span class="key">SHIFT</span> freno<br/>
            <span class="key">A</span><span class="key">D</span> desplazamiento lateral<br/>
            <span class="key">SPACE</span> nitro<br/>
            <span class="key">ESC</span> abrir / cerrar este men&uacute;<br/>
            Acerca la nave a un planeta y mant&eacute;n el rumbo para entrar.
          </p>
        </div>
      </div>`;
    host.appendChild(this.root);

    this.controlsPanel = this.root.querySelector('.controls-panel') as HTMLElement;

    this.root.querySelector('[data-act="resume"]')!.addEventListener('click', () => cb.onResume());
    this.root.querySelector('[data-act="controls"]')!.addEventListener('click', () => {
      this.controlsPanel.hidden = !this.controlsPanel.hidden;
    });
    this.root.querySelector('[data-act="logout"]')!.addEventListener('click', () => cb.onLogout());
  }

  open() {
    this._visible = true;
    this.controlsPanel.hidden = true;
    this.root.classList.add('visible');
  }

  close() {
    this._visible = false;
    this.root.classList.remove('visible');
  }

  get visible(): boolean {
    return this._visible;
  }

  dispose() {
    this.root.remove();
  }
}
```

- [ ] **Step 2: Replace the `#escMenu` CSS with `#pauseMenu` (cursor visible)**

In `shell/src/space/space.css`, replace the entire `#escMenu` block (lines 297–353) with:

```css
/* Menú de pausa (con cursor) */
#pauseMenu {
  position: fixed;
  inset: 0;
  z-index: 180;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(10, 5, 3, 0.6);
  cursor: default; /* recupera el cursor sobre el overlay */
}
#pauseMenu.visible {
  display: flex;
}
#pauseMenu .panel {
  background: rgba(10, 5, 3, 0.95);
  border: 1px solid var(--metal-brass);
  border-radius: 12px;
  padding: 28px 32px;
  text-align: center;
  min-width: 260px;
}
#pauseMenu .panel h3 {
  font-family: var(--font-display);
  color: var(--orange-amber);
  letter-spacing: 0.12em;
  margin: 0 0 18px;
  font-size: 16px;
}
#pauseMenu .panel button {
  display: block;
  width: 100%;
  margin: 8px 0 0;
  padding: 10px 20px;
  border: 1px solid var(--metal-steel);
  border-radius: 6px;
  background: transparent;
  color: var(--space-text);
  font-family: var(--font-serif);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.3s;
}
#pauseMenu .panel button:hover {
  border-color: var(--orange-burnt);
  color: var(--orange-burnt);
}
#pauseMenu .controls-panel {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--metal-iron);
}
#pauseMenu .controls-panel p {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--space-text-2);
  line-height: 1.9;
  letter-spacing: 0.04em;
  margin: 0;
}
#pauseMenu .controls-panel .key {
  display: inline-block;
  padding: 1px 6px;
  margin: 0 2px;
  border: 1px solid var(--metal-iron);
  border-radius: 3px;
  color: var(--space-text);
}
```

- [ ] **Step 3: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: `pause-menu.ts` compiles. The project-wide lint still fails in `space-engine.ts` (old `escMenu` code + old `hud.update`) until Task 4 — that is expected.

- [ ] **Step 4: Commit**
  ```
  git add shell/src/space/pause-menu.ts shell/src/space/space.css
  git commit -m "feat(space): cursor-visible pause menu (resume/controls/logout)"
  ```

---

### Task 4: Wire `pointerlockchange` interception + single-ESC + flight gate in `space-engine.ts`

**Files:**
- Modify: `shell/src/space/space-engine.ts` (imports + fields lines 60–67; HUD ctor lines 121–123; menu/labels build lines 154–161; loop body lines 175–206; `buildEscMenu`/`onEscKey`/`toggleEscMenu` lines 252–292; `dispose` lines 372–406)

This is integration glue. Write the complete edits below. Verify manually.

> **Why pointerlockchange:** the browser consumes the first ESC by exiting pointer lock — the `keydown` for that ESC is NOT delivered while locked in most browsers. So we open the menu reactively when the lock is lost and no menu is open. A subsequent ESC (now that the cursor is free, the keydown fires) closes the menu. "Reanudar control" re-requests the lock via `ship.requestControl()`.

> **Dependency note:** this task assumes plan 01 has replaced `FlightController` with `ShipController` (fields `ship`, methods `requestControl()`, `isLocked`, `onLockChange`, `update(delta): ShipState`, `setEnabled`, `setApproachBrake`, `attach`, `detach`, `rebase`) and plan 02 has `SolarSystem` returning `SolarUpdate { approaching, dwellProgress, entered }` from `update(...)`. If wiring plans 01/02 is incomplete, the references below (`this.ship`, `this.solarSystem`, `ShipState`) will not resolve. Coordinate ordering: run this task only after 01 and 02 land. This plan touches ONLY the HUD/pause/ESC/lock wiring; it does not re-implement ship or solar logic.

- [ ] **Step 1: Update imports and fields**

In `shell/src/space/space-engine.ts`, change the HUD/pause imports. Replace line 6 (`import { Hud } from './hud';`) region so both HUD and PauseMenu are imported:

```ts
import { Hud } from './hud';
import { PauseMenu } from './pause-menu';
```

Then in the fields block (lines 60–67), remove the `escMenu`/`overlay` ESC-related declarations that this plan owns and add `pauseMenu`. Replace:

```ts
  private overlay!: ProjectOverlay;
  private escMenu!: HTMLElement;
  private aimLabel!: HTMLElement;
  private ramatzoLabel!: HTMLElement;
```

with:

```ts
  private pauseMenu!: PauseMenu;
  private aimLabel!: HTMLElement;
  private ramatzoLabel!: HTMLElement;
```

(The removal of `ProjectOverlay` itself and the solar-system field changes belong to plan 02; if `overlay` is already gone, skip that line. This plan only adds `pauseMenu` and removes `escMenu`.)

- [ ] **Step 2: Build the PauseMenu and hook `pointerlockchange` (replace `buildEscMenu`/labels wiring at lines 154–161)**

Replace the `this.buildEscMenu(host);` call and surrounding wiring (lines 154–158) with the pause-menu construction and lock listener:

```ts
    this.pauseMenu = new PauseMenu(host, {
      onResume: () => this.resumeControl(),
      onLogout: () => this.opts.onLogout(),
    });
    // Truco clave (§5.6): el navegador consume el primer ESC liberando el lock.
    // Escuchamos pointerlockchange: si se pierde el lock y no hay menú abierto,
    // lo interpretamos como "abrir pausa" → el primer ESC libera ratón Y muestra menú.
    document.addEventListener('pointerlockchange', this.onLockChange);
    // Un ESC posterior (con cursor ya libre) cierra el menú.
    document.addEventListener('keydown', this.onKeyDown);
    this.buildLabels(host);
```

- [ ] **Step 3: Add the lock-change / keydown / resume handlers**

Replace the old `buildEscMenu`, `onEscKey` and `toggleEscMenu` methods (lines 252–281) with:

```ts
  // El navegador sale del pointer lock al primer ESC. Si no hay menú abierto,
  // abrimos la pausa (cursor visible). Si reentramos al lock, cerramos la pausa.
  private onLockChange = () => {
    const locked = this.ship.isLocked;
    if (!locked && !this.pauseMenu.visible) {
      this.pauseMenu.open();
    } else if (locked && this.pauseMenu.visible) {
      this.pauseMenu.close();
    }
  };

  // ESC con el cursor libre (menú abierto): vuelve a tomar control.
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape' && this.pauseMenu.visible) {
      this.resumeControl();
    }
  };

  private resumeControl() {
    this.pauseMenu.close();
    this.ship.requestControl(); // vuelve a pedir pointer lock al canvas
  }
```

- [ ] **Step 4: Replace the canvas-click pointer-lock request and remove the old overlay raycast**

The old `onCanvasClick` (lines 240–250) used `this.flight.isPointerLocked` and the project overlay. Replace it with a simple control request (project entry is now by dwell, owned by plan 02):

```ts
  // Clic en el canvas: si no hay control, lo solicita (pointer lock).
  private onCanvasClick = () => {
    if (this.pauseMenu.visible) return;
    if (!this.ship.isLocked) this.ship.requestControl();
  };
```

- [ ] **Step 5: Gate flight by the pause menu and call the new `hud.update` signature (loop body, lines 175–206)**

Replace the flight-gate line (176), the speed-scale block (178–182), the `hud.update`/`hud.setStray` calls (186–192), and the `radar.draw` call to use the new HUD signature. The flight gate becomes:

```ts
    // Congela el vuelo (mirar + WASD) mientras el menú de pausa está visible.
    this.ship.setEnabled(!this.pauseMenu.visible);
```

The ship update + HUD update become (note: `solar` is produced by plan 02's `this.solarSystem.update(...)`; this plan consumes `solar.approaching` and `solar.dwellProgress`):

```ts
    const state: ShipState = this.ship.update(delta);
    this.lastState = state;
    this.maybeRebase();

    const altitude = state.position.y + this.worldOffset.y;
    this.hud.update(state, {
      altitude,
      heading: state.yaw,
      approaching: solar.approaching ? { name: solar.approaching.app.name } : null,
      dwellProgress: solar.dwellProgress,
    });
```

Replace the field declaration `private lastFlight?: FlightState;` (line 55) with `private lastState?: ShipState;` and add `import type { ShipState } from './ship-controller';` to the imports. (If plan 01 already renamed this field, reuse its name and adjust the line above to match.)

- [ ] **Step 6: Update `dispose` to detach the new listeners**

In `dispose` (lines 372–406), replace the old ESC/overlay teardown:

```ts
    document.removeEventListener('keydown', this.onEscKey);
    this.escMenu?.remove();
```

with:

```ts
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('keydown', this.onKeyDown);
    this.pauseMenu?.dispose();
```

Also remove `this.overlay?.dispose();` if `ProjectOverlay` is gone (owned by plan 02). Keep the rest of `dispose` intact.

- [ ] **Step 7: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS, assuming plans 01 + 02 have landed `ShipController`/`SolarSystem`. If lint reports unresolved `this.ship` / `solar` / `ShipState`, the prerequisite plans are not yet merged — stop and integrate them first.

- [ ] **Step 8: Run the full shell test suite (no regressions in pure logic)**
  Run: `pnpm --filter @plataforma/shell test`
  Expected: PASS — including `hud-format.test.ts`. (No new tests here; integration is verified manually next.)

- [ ] **Step 9: Manual verification of the full ESC → cursor → resume flow**
  Run: `pnpm --filter @plataforma/shell dev`
  Open: `http://localhost:5173`; log in.
  Expected, in order:
  1. Click the canvas → pointer locks, cursor hidden, you can look with the mouse.
  2. Speed readout shows real m-less integer speed (grows past any old cap while holding W); shows `NITRO` in ember while holding Space.
  3. Bottom-right shows `ALT +<n> u` changing with vertical movement and `RUMBO <000–359>°` changing as you turn. No `Z … AU` field anywhere.
  4. Fly toward a planet → reticle enters the `approaching` state: amber dwell ring begins filling clockwise from the top, center dot turns ember, planet name appears under the reticle.
  5. Hold the approach ~1s → dwell completes and the cockpit opens with the unchanged app (this is plan 02's `onEnterApp`; confirm it still fires).
  6. Press **ESC once** → mouse cursor reappears AND the pause menu shows simultaneously (single press). Flight is frozen (ship does not drift on input).
  7. Click **Controles** → controls panel toggles open/closed inside the menu.
  8. Click **Reanudar control** (or press ESC again) → menu closes, pointer re-locks, flight resumes.
  9. Press ESC, then **Cerrar sesión** → logout event fires (returns to login).
  Bottom-left shows the persistent discreet controls legend the whole time in flight.

- [ ] **Step 10: Commit**
  ```
  git add shell/src/space/space-engine.ts
  git commit -m "feat(space): single-ESC pause via pointerlockchange + new HUD wiring"
  ```

---

### Task 5: Reproduce & diagnose the "Skip" / deformed-UI bug

**Files:** No source changes unless the cause is in shell scope (see decision gate below). Diagnosis only.

> Per spec §5.6 and §8: the "Skip" button / deformed UI is **not** present in shell source (confirmed: no `Skip` string exists in `shell/src/space/**`). It likely comes from an embedded project app or a stale `dist` bundle served by Docker. This task reproduces it and documents the source. The apps/ projects, registry, and cockpit iframe behavior are OUT OF SCOPE (explicit user requirement) — do NOT modify them.

- [ ] **Step 1: Confirm "Skip" is not in shell source**
  Run (Grep tool): pattern `Skip` across `shell/src`.
  Expected: zero matches in `shell/src/space/**` and `shell/src/components/**`. Record the result.

- [ ] **Step 2: Reproduce on the dev server (fresh shell bundle)**
  Run: `pnpm --filter @plataforma/shell dev`
  Open: `http://localhost:5173`; log in; fly to a planet; dwell to enter the cockpit.
  Observe: does the "Skip" button / deformed UI appear (a) in the space shell itself, or (b) only inside the cockpit iframe after an app loads?
  Record which surface shows it and at what step.

- [ ] **Step 3: Isolate the source**
  - If it appears ONLY inside the cockpit iframe after an app loads → it belongs to that embedded app (e.g. `oktomatzo2`/TattooAR or another registry project). This is OUT OF SCOPE. Document the app id (visible in the cockpit header / `cockpitApp.id`) and the URL it loads.
  - If it appears in the space shell (canvas/overlays) on the dev server → it IS in shell scope; capture the DOM element (DevTools → inspect) and the file that renders it.
  - Compare dev-server behavior vs the Docker-served build: if "Skip" appears in Docker but NOT on the dev server, it is the **stale `dist` bind-mount** (§8) — resolved by `pnpm --filter @plataforma/shell build` + redeploy (redeploy is the user's responsibility, out of scope).

- [ ] **Step 4: Document findings (no file written — report in the session)**
  Report, as the task's deliverable text: (a) where "Skip" rendered, (b) the identified source (embedded app id / stale dist / shell element), (c) whether a fix is in shell scope. 

- [ ] **Step 5: Decision gate — fix only if in shell scope**
  - If the cause is an embedded app or stale dist → **no code change** in this plan; note it as a documented risk per §8 and stop.
  - If (and only if) the deformed UI is an actual shell overlay element on the dev server → write a minimal, scoped fix to that overlay's CSS/markup in `shell/src/space/**`, then commit:
    ```
    git add shell/src/space/<fixed-file>
    git commit -m "fix(space): correct deformed <element> overlay in shell"
    ```
    Otherwise skip this commit entirely.

---

## Verification summary

- Pure logic: `pnpm --filter @plataforma/shell test` (includes `hud-format.test.ts`) → PASS.
- One pure file in isolation: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/hud-format.test.ts` → PASS.
- Types: `pnpm --filter @plataforma/shell lint` → PASS (after plans 01/02 land).
- Build: `pnpm --filter @plataforma/shell build` → succeeds.
- Manual (dev server): the full ESC → cursor → resume flow in Task 4 Step 9, reactive reticle/dwell, real altitude/heading, no Z/AU field, persistent controls legend, and the Task 5 "Skip" repro.
