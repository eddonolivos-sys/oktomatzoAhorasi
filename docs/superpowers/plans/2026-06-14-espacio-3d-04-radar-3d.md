---
# Radar 3D holográfico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Reescribir `radar.ts` como un radar 3D holográfico ámbar y sobrio que comunica altitud (postes verticales con chevrons), rumbo (disco táctico inclinado proyectado por `yaw`), distancias con escala fija (anillos numerados) y el objetivo en aproximación (corchetes + distancia + puntero de rumbo si está fuera del disco), integrando el `pitch` de la nave.

**Architecture:** La proyección rumbo/elevación se extrae a `radar-projection.ts` como lógica pura (sin Three.js), testeada con Vitest en entorno node siguiendo el patrón de `layout.ts`/`layout.test.ts`. `radar.ts` se reescribe como una clase que dibuja en un canvas 2D el "disco 3D leído" usando esas funciones puras y recibe `draw(shipPos, yaw, pitch, blips, lockedApp, sunPos?)`. `space-engine.ts` se ajusta para pasar `yaw`+`pitch`, los `RadarBlip` de `SolarSystem` y el objetivo bloqueado/aproximándose desde `SolarUpdate.approaching`.

**Tech Stack:** TypeScript, Three.js 0.170, Lit 3, Vitest. Package @plataforma/shell.

**Depends on:** plan 01 (`ShipState` de `ship-controller.ts`) y plan 02 (`RadarBlip { name; position; app }` y el objetivo en aproximación expuestos por `solar-system.ts` vía `SolarUpdate.approaching`).

---
---

## File structure

| Archivo | Acción | Responsabilidad única |
|---|---|---|
| `shell/src/space/radar-projection.ts` | Create | Lógica PURA (sin Three.js): `bearingToDisc` (rota un offset XZ por `yaw`, escala al disco, marca `onDisc` con clamping al borde) y `elevationStalk` (longitud del poste de altitud ∝ `relY`, con `sign` -1/0/1, clamp a `maxLen`). |
| `shell/src/space/radar-projection.test.ts` | Create | Tests unitarios de las dos funciones puras (rotación, `onDisc`, clamp, signo del chevron, monotonía). |
| `shell/src/space/radar.ts` | Modify (reescritura completa, líneas 1-158) | Clase `Radar`: dibuja en canvas 2D el disco táctico inclinado, anillos con distancia fija, blips con postes de altitud + chevrons, objetivo bloqueado con corchetes + distancia, puntero de rumbo en el borde. Firma `draw(shipPos, yaw, pitch, blips, lockedApp, sunPos?)`. |
| `shell/src/space/space-engine.ts` | Modify (líneas ~200) | Llamada `this.radar.draw(...)` con `yaw`+`pitch`+blips+objetivo bloqueado desde `SolarUpdate.approaching`. |

> **Nota de contratos compartidos.** Este plan usa verbatim:
> - `radar-projection.ts (PURE)` → `bearingToDisc(relX: number, relZ: number, yaw: number, range: number, discRadius: number): { x: number; y: number; onDisc: boolean }` y `elevationStalk(relY: number, scale: number, maxLen: number): { len: number; sign: -1 | 0 | 1 }`.
> - `radar.ts` → `class Radar { constructor(host: HTMLElement); draw(shipPos: THREE.Vector3, yaw: number, pitch: number, blips: RadarBlip[], lockedApp: AppInfo | null, sunPos?: THREE.Vector3): void; show(): void; hide(): void; dispose(): void; }`
> - `RadarBlip { name: string; position: THREE.Vector3; app: AppInfo }` (de `solar-system.ts`, plan 02) y `AppInfo` de `'../services/protocol'`.

---

## Task 1: `radar-projection.ts` — `bearingToDisc` (PURA, TDD)

**Files:**
- Test: `shell/src/space/radar-projection.test.ts` (Create)
- Implementation: `shell/src/space/radar-projection.ts` (Create)

`bearingToDisc` proyecta un offset relativo en el plano XZ (mundo) al disco 2D del radar, rotándolo por el `yaw` de la nave para que "adelante" (la dirección a la que mira la nave) quede arriba del disco. Marca `onDisc=true` cuando el blip cabe dentro de `discRadius`; cuando excede el rango, fija el punto al borde (`onDisc=false`) para usarlo como puntero de rumbo. Convención de ejes (coherente con el `radar.ts` actual, `space-engine.ts:179` y `flight`/`ship-controller`): se usa `atan2(relZ, relX) - yaw` para el ángulo en pantalla; el centro del disco es `(0,0)` y la salida `{x,y}` es el offset en píxeles desde ese centro.

- [ ] **Step 1: Write the failing test** (full test code block)

Create `shell/src/space/radar-projection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { bearingToDisc } from './radar-projection';

describe('bearingToDisc', () => {
  it('un blip dentro del rango queda onDisc=true', () => {
    const r = bearingToDisc(100, 0, 0, 1000, 80);
    expect(r.onDisc).toBe(true);
  });

  it('escala la distancia linealmente respecto al rango', () => {
    // A la mitad del rango debe quedar a la mitad del radio del disco.
    const half = bearingToDisc(500, 0, 0, 1000, 80);
    const full = bearingToDisc(1000, 0, 0, 1000, 80);
    const dHalf = Math.hypot(half.x, half.y);
    const dFull = Math.hypot(full.x, full.y);
    expect(dHalf).toBeCloseTo(40, 5);
    expect(dFull).toBeCloseTo(80, 5);
  });

  it('un blip más lejano que el rango se fija al borde con onDisc=false', () => {
    const r = bearingToDisc(5000, 0, 0, 1000, 80);
    expect(r.onDisc).toBe(false);
    expect(Math.hypot(r.x, r.y)).toBeCloseTo(80, 5);
  });

  it('rota el rumbo por yaw: con yaw=0, +X mapea al eje x del disco', () => {
    const r = bearingToDisc(1000, 0, 0, 1000, 80);
    expect(r.x).toBeCloseTo(80, 5);
    expect(r.y).toBeCloseTo(0, 5);
  });

  it('rota el rumbo por yaw: girar yaw +90° rota el punto -90° en pantalla', () => {
    // angle = atan2(0, 1000) - yaw = 0 - PI/2 = -PI/2
    const r = bearingToDisc(1000, 0, Math.PI / 2, 1000, 80);
    expect(r.x).toBeCloseTo(0, 5);
    expect(r.y).toBeCloseTo(-80, 5);
  });

  it('un blip prácticamente en el centro no genera NaN', () => {
    const r = bearingToDisc(0, 0, 0, 1000, 80);
    expect(Number.isNaN(r.x)).toBe(false);
    expect(Number.isNaN(r.y)).toBe(false);
    expect(r.onDisc).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/radar-projection.test.ts`
  Expected: FAIL — el módulo `./radar-projection` no existe todavía (error de import / `bearingToDisc is not a function`).

- [ ] **Step 3: Write minimal implementation** (full code block)

Create `shell/src/space/radar-projection.ts`:

```ts
/**
 * Lógica PURA del radar 3D holográfico (sin Three.js, testeable con Vitest en
 * entorno node, patrón de layout.ts). Proyecta rumbo (XZ → disco rotado por yaw)
 * y elevación (poste de altitud con signo de chevron).
 */

/**
 * Proyecta un offset relativo en el plano XZ (relX, relZ) al disco 2D del radar.
 * El ángulo se rota por `yaw` para que la dirección de la nave quede "arriba".
 * Devuelve el offset en píxeles {x,y} desde el centro del disco y `onDisc`:
 * - dentro del rango → escala lineal, onDisc=true.
 * - más allá del rango → fijado al borde (radio = discRadius), onDisc=false
 *   (sirve como puntero de rumbo).
 */
export function bearingToDisc(
  relX: number,
  relZ: number,
  yaw: number,
  range: number,
  discRadius: number,
): { x: number; y: number; onDisc: boolean } {
  const dist = Math.hypot(relX, relZ);
  const angle = Math.atan2(relZ, relX) - yaw;
  const onDisc = dist <= range;
  const rPix = onDisc ? (dist / range) * discRadius : discRadius;
  return {
    x: Math.cos(angle) * rPix,
    y: Math.sin(angle) * rPix,
    onDisc,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/radar-projection.test.ts`
  Expected: PASS — los 6 casos de `bearingToDisc` en verde.

- [ ] **Step 5: Commit**
  ```
  git add shell/src/space/radar-projection.ts shell/src/space/radar-projection.test.ts
  git commit -m "test(space): bearingToDisc — proyección de rumbo del radar 3D"
  ```

---

## Task 2: `radar-projection.ts` — `elevationStalk` (PURA, TDD)

**Files:**
- Test: `shell/src/space/radar-projection.test.ts` (Modify — añadir un `describe`)
- Implementation: `shell/src/space/radar-projection.ts` (Modify — añadir función)

`elevationStalk` traduce la diferencia de altitud relativa (`relY = blip.y - ship.y`) a la longitud del poste vertical del radar y a un `sign` que decide el chevron: `+1` (▲, blip por encima de la nave), `-1` (▼, por debajo), `0` (esencialmente al mismo nivel → sin poste). La longitud se escala con `scale` y se acota a `maxLen`. El signo se decide con una banda muerta pequeña para evitar parpadeo del chevron a altura casi igual.

- [ ] **Step 1: Write the failing test** (full test code block)

Append to `shell/src/space/radar-projection.test.ts`:

```ts
import { elevationStalk } from './radar-projection';

describe('elevationStalk', () => {
  it('blip por encima → sign +1 y len positiva', () => {
    const r = elevationStalk(200, 0.05, 40);
    expect(r.sign).toBe(1);
    expect(r.len).toBeCloseTo(10, 5);
  });

  it('blip por debajo → sign -1 y len positiva (longitud usa magnitud)', () => {
    const r = elevationStalk(-200, 0.05, 40);
    expect(r.sign).toBe(-1);
    expect(r.len).toBeCloseTo(10, 5);
  });

  it('mismo nivel (banda muerta) → sign 0 y len 0', () => {
    const r = elevationStalk(0, 0.05, 40);
    expect(r.sign).toBe(0);
    expect(r.len).toBe(0);
  });

  it('una diferencia muy pequeña cae en la banda muerta → sign 0', () => {
    const r = elevationStalk(0.5, 0.05, 40);
    expect(r.sign).toBe(0);
  });

  it('la longitud se acota a maxLen', () => {
    const r = elevationStalk(100000, 0.05, 40);
    expect(r.len).toBe(40);
    expect(r.sign).toBe(1);
  });

  it('len es monótona creciente con |relY| hasta el tope', () => {
    const a = elevationStalk(100, 0.05, 40).len;
    const b = elevationStalk(300, 0.05, 40).len;
    expect(b).toBeGreaterThan(a);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/radar-projection.test.ts`
  Expected: FAIL — `elevationStalk is not a function` (los tests de `bearingToDisc` siguen en verde).

- [ ] **Step 3: Write minimal implementation** (full code block)

Append to `shell/src/space/radar-projection.ts`:

```ts
/**
 * Poste de altitud del radar: traduce la diferencia de altura relativa
 * `relY = blip.y - ship.y` a la longitud del stem vertical (∝ |relY| * scale,
 * acotada a maxLen) y al signo del chevron:
 *   +1 ▲ (encima), -1 ▼ (debajo), 0 (mismo nivel, sin poste).
 * Banda muerta de 1 unidad de altura para evitar parpadeo del chevron.
 */
export function elevationStalk(
  relY: number,
  scale: number,
  maxLen: number,
): { len: number; sign: -1 | 0 | 1 } {
  const DEAD_ZONE = 1;
  if (Math.abs(relY) <= DEAD_ZONE) return { len: 0, sign: 0 };
  const sign: -1 | 1 = relY > 0 ? 1 : -1;
  const len = Math.min(Math.abs(relY) * scale, maxLen);
  return { len, sign };
}
```

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @plataforma/shell exec vitest run shell/src/space/radar-projection.test.ts`
  Expected: PASS — los 6 casos de `bearingToDisc` y los 6 de `elevationStalk` en verde.

- [ ] **Step 5: Commit**
  ```
  git add shell/src/space/radar-projection.ts shell/src/space/radar-projection.test.ts
  git commit -m "test(space): elevationStalk — poste de altitud con chevron del radar 3D"
  ```

---

## Task 3: Verificar que toda la suite del shell sigue verde

**Files:** ninguno (verificación).

- [ ] **Step 1: Run the full shell test suite**
  Run: `pnpm --filter @plataforma/shell test`
  Expected: PASS — todos los archivos `*.test.ts` (incluidos `layout.test.ts`, `chunks.test.ts` y el nuevo `radar-projection.test.ts`) en verde. No se hace commit (solo verificación de no-regresión).

---

## Task 4: Reescribir `radar.ts` (radar 3D holográfico, VISUAL)

**Files:** Modify `shell/src/space/radar.ts` (reescritura completa, líneas 1-158).

Esta tarea NO es unit-testeable (dibuja en canvas con Three.js `Vector3` como entrada): se verifica manualmente en el dev server. Se reemplaza el contenido completo del archivo. Cambios clave respecto al actual:
- Firma `draw(shipPos, yaw, pitch, blips, lockedApp, sunPos?)` — añade `pitch`, cambia el tipo de blip a `RadarBlip { name; position; app }` (plan 02) y añade `lockedApp: AppInfo | null`.
- Disco táctico inclinado: el plano XZ se proyecta a una **elipse** rotada por `yaw`; la inclinación vertical de la elipse depende de `pitch` (más cabeceo → disco más "de canto"), usando `bearingToDisc` para la planta y un factor `cos`/`sin` de pitch para el escorzo.
- **Anillos con distancia fija** (NO autoescala): rango total fijo `RANGE` y tres anillos etiquetados a 1/3, 2/3 y 3/3 del rango.
- **Postes de altitud** por blip con `elevationStalk` + chevron ▲/▼.
- **Lock:** si el blip corresponde a `lockedApp`, se dibuja con corchetes `[ ]` y su distancia numérica; si queda fuera del disco, se dibuja un **puntero de rumbo** en el borde.
- Estilo ámbar holográfico sobrio (sin neón): se conserva la paleta ámbar/arena del archivo actual, sombras suaves, sin saturaciones chillonas.

- [ ] **Step 1: Reescribir el archivo completo** (full code block)

Replace the entire contents of `shell/src/space/radar.ts` with:

```ts
import * as THREE from 'three';
import type { RadarBlip } from './solar-system';
import type { AppInfo } from '../services/protocol';
import { bearingToDisc, elevationStalk } from './radar-projection';

/**
 * Radar 3D holográfico (canvas 2D) fijo arriba-izquierda. Lee el plano XZ del
 * sistema relativo a la nave y al rumbo (yaw), lo proyecta a un disco táctico
 * inclinado por el pitch, y comunica la altitud con postes verticales + chevrons.
 * Anillos con distancia numérica de escala FIJA (no autoescala por frame).
 * El objetivo en aproximación se marca con corchetes + distancia; si queda fuera
 * del disco, un puntero de rumbo en el borde indica hacia dónde girar.
 *
 * Trabaja en espacio de escena (nave y blips comparten el mismo marco), por lo
 * que el rebase de origen no lo afecta. Estilo ámbar sobrio (sin neón).
 */
export class Radar {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private readonly size = 200;
  private readonly cx = 100;
  private readonly cy = 104; // ligero desplazamiento: deja aire arriba para los postes
  private readonly r = 84;

  /** Rango total FIJO del radar en unidades de mundo (escala estable, no autoscale). */
  private readonly range = 6000;
  /** Escala del poste de altitud: unidades de mundo (Y) → píxeles. */
  private readonly altScale = 0.012;
  private readonly maxStalk = 26;

  constructor(host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.canvas.style.cssText =
      'position:fixed;top:24px;left:24px;z-index:100;pointer-events:none;';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  draw(
    shipPos: THREE.Vector3,
    yaw: number,
    pitch: number,
    blips: RadarBlip[],
    lockedApp: AppInfo | null,
    sunPos?: THREE.Vector3,
  ): void {
    const ctx = this.ctx;
    const { cx, cy, r } = this;
    ctx.clearRect(0, 0, this.size, this.size);

    // Escorzo vertical del disco por el pitch: mirando al frente (pitch≈0) el
    // disco se ve casi de canto; mirando arriba/abajo se aplana hacia un círculo.
    // squash ∈ [0.34, 0.95]: nunca totalmente plano (legibilidad).
    const squash = 0.34 + 0.61 * Math.min(1, Math.abs(Math.sin(pitch)) + 0.0);

    // ── Carcasa (elipse de fondo) ──
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, squash);
    ctx.fillStyle = 'rgba(10, 5, 3, 0.78)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Anillos de distancia (escala FIJA), proyectados como elipses.
    ctx.lineWidth = 0.6;
    for (let i = 1; i <= 3; i++) {
      ctx.strokeStyle = `rgba(196, 130, 60, ${0.08 + i * 0.02})`;
      ctx.beginPath();
      ctx.arc(0, 0, (r * i) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cruz de orientación.
    ctx.strokeStyle = 'rgba(196, 130, 60, 0.07)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r);
    ctx.stroke();
    ctx.restore();

    // Borde superior (sin escorzo de trazo) para enmarcar el disco.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, squash);
    ctx.strokeStyle = 'rgba(210, 184, 140, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Etiquetas numéricas de distancia de los anillos (sin escorzo: legibles).
    ctx.fillStyle = 'rgba(210, 184, 140, 0.45)';
    ctx.font = '7px "Cinzel", serif';
    for (let i = 1; i <= 3; i++) {
      const ringDist = Math.round((this.range * i) / 3);
      const label = ringDist >= 1000 ? `${(ringDist / 1000).toFixed(1)}k` : `${ringDist}`;
      const yPix = cy - ((r * i) / 3) * squash;
      ctx.fillText(label, cx + 3, yPix - 1);
    }

    // ── Sol Ramatzo (faro central) — rombo distintivo ──
    if (sunPos) {
      this.drawBlip(shipPos, yaw, squash, sunPos, '#FF8C42', true);
    }

    // ── Blips de proyectos (planetas) con postes de altitud ──
    let lockedScreen: { x: number; y: number; onDisc: boolean } | null = null;
    let lockedDist = 0;
    for (const blip of blips) {
      const relX = blip.position.x - shipPos.x;
      const relZ = blip.position.z - shipPos.z;
      const relY = blip.position.y - shipPos.y;
      const dist = Math.hypot(relX, relZ);
      if (dist < 2) continue;

      const isLocked = lockedApp != null && blip.app.id === lockedApp.id;
      const disc = bearingToDisc(relX, relZ, yaw, this.range, r);
      const px = cx + disc.x;
      const py = cy + disc.y * squash;
      const brightness = Math.max(0.25, 1 - dist / this.range);

      // Poste de altitud + chevron.
      const stalk = elevationStalk(relY, this.altScale, this.maxStalk);
      if (stalk.len > 0) {
        const topY = py - stalk.sign * stalk.len;
        ctx.strokeStyle = `rgba(230, 168, 23, ${brightness * 0.6})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, topY);
        ctx.stroke();
        // Chevron ▲ (sign +1) / ▼ (sign -1).
        ctx.fillStyle = `rgba(230, 168, 23, ${brightness})`;
        ctx.beginPath();
        if (stalk.sign === 1) {
          ctx.moveTo(px - 3, topY + 3);
          ctx.lineTo(px + 3, topY + 3);
          ctx.lineTo(px, topY - 1);
        } else {
          ctx.moveTo(px - 3, topY - 3);
          ctx.lineTo(px + 3, topY - 3);
          ctx.lineTo(px, topY + 1);
        }
        ctx.closePath();
        ctx.fill();
      }

      // Punto del blip en el disco.
      ctx.fillStyle = `rgba(230, 168, 23, ${brightness})`;
      ctx.shadowColor = 'rgba(230, 168, 23, 0.25)';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(px, py, 1.6 + brightness * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Etiqueta del proyecto.
      ctx.fillStyle = `rgba(210, 196, 168, ${Math.max(0.5, brightness)})`;
      ctx.font = '7px "Cinzel", serif';
      ctx.fillText(blip.name.substring(0, 9), px + 5, py + 2);

      if (isLocked) {
        lockedScreen = { x: px, y: py, onDisc: disc.onDisc };
        lockedDist = dist;
      }
    }

    // ── Objetivo bloqueado / en aproximación: corchetes + distancia, o puntero ──
    if (lockedScreen) {
      ctx.strokeStyle = 'rgba(255, 140, 66, 0.9)';
      ctx.fillStyle = 'rgba(255, 196, 120, 0.95)';
      ctx.lineWidth = 1.2;
      if (lockedScreen.onDisc) {
        // Corchetes [ ] alrededor del objetivo.
        const b = 6;
        const { x, y } = lockedScreen;
        ctx.beginPath();
        ctx.moveTo(x - b, y - b + 2); ctx.lineTo(x - b, y - b); ctx.lineTo(x - b + 2, y - b);
        ctx.moveTo(x + b, y - b + 2); ctx.lineTo(x + b, y - b); ctx.lineTo(x + b - 2, y - b);
        ctx.moveTo(x - b, y + b - 2); ctx.lineTo(x - b, y + b); ctx.lineTo(x - b + 2, y + b);
        ctx.moveTo(x + b, y + b - 2); ctx.lineTo(x + b, y + b); ctx.lineTo(x + b - 2, y + b);
        ctx.stroke();
        const distLabel =
          lockedDist >= 1000 ? `${(lockedDist / 1000).toFixed(1)}k` : `${Math.round(lockedDist)}`;
        ctx.font = '8px "Cinzel", serif';
        ctx.fillText(distLabel, x + b + 2, y + b + 6);
      } else {
        // Fuera del disco: puntero de rumbo en el borde apuntando al objetivo.
        const ang = Math.atan2(lockedScreen.y - cy, lockedScreen.x - cx);
        const tipX = cx + Math.cos(ang) * (r - 2);
        const tipY = cy + Math.sin(ang) * (r - 2) * squash;
        ctx.save();
        ctx.translate(tipX, tipY);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-7, -3.5);
        ctx.lineTo(-7, 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // ── Nave del jugador (centro) ──
    ctx.fillStyle = '#E6A817';
    ctx.shadowColor = '#E6A817';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Indicador de rumbo (hacia arriba = adelante de la nave).
    ctx.strokeStyle = 'rgba(230, 168, 23, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - r * 0.7 * squash);
    ctx.stroke();

    // Marca de "adelante".
    ctx.fillStyle = 'rgba(200, 184, 152, 0.32)';
    ctx.font = '7px serif';
    ctx.fillText('PROA', cx - 9, cy - r * squash + 11);
  }

  /** Dibuja un blip simple (rombo) sin poste; usado para el sol Ramatzo. */
  private drawBlip(
    shipPos: THREE.Vector3,
    yaw: number,
    squash: number,
    pos: THREE.Vector3,
    color: string,
    diamond: boolean,
  ): void {
    const ctx = this.ctx;
    const relX = pos.x - shipPos.x;
    const relZ = pos.z - shipPos.z;
    const disc = bearingToDisc(relX, relZ, yaw, this.range, this.r);
    const px = this.cx + disc.x;
    const py = this.cy + disc.y * squash;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    if (diamond) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  show(): void {
    this.canvas.style.display = 'block';
  }

  hide(): void {
    this.canvas.style.display = 'none';
  }

  dispose(): void {
    this.canvas.remove();
  }
}
```

- [ ] **Step 2: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS sin errores en `radar.ts` y `radar-projection.ts`.
  > Si falla porque `solar-system.ts` (plan 02) aún no exporta `RadarBlip`, este plan depende de plan 02; confirma que plan 02 está integrado antes de continuar. El import correcto es `import type { RadarBlip } from './solar-system';`.

- [ ] **Step 3: Commit**
  ```
  git add shell/src/space/radar.ts
  git commit -m "feat(space): radar 3D holográfico (disco inclinado + postes de altitud + lock)"
  ```

---

## Task 5: Cablear el radar 3D en `space-engine.ts` (INTEGRACIÓN)

**Files:** Modify `shell/src/space/space-engine.ts` (línea ~200, la llamada `this.radar.draw(...)`).

Esta tarea no es unit-testeable; se verifica manualmente. La llamada actual (línea 200) es:

```ts
this.radar.draw(this.camera.position, flight.yaw, this.constellations.getRadarBlips(), this.ramatzoSun.position);
```

La nueva firma del radar requiere `(shipPos, yaw, pitch, blips, lockedApp, sunPos?)`. Tras la integración de plan 01 (`ship-controller` → `ShipState`) y plan 02 (`solar-system` → `SolarUpdate` con `approaching: ApproachInfo | null` y `getRadarBlips(): RadarBlip[]`), el frame ya dispone de:
- `state: ShipState` (de `ship.update(delta)`), con `state.position`, `state.yaw`, `state.pitch`.
- `solar: SolarUpdate` (de `solarSystem.update(...)`), con `solar.approaching?.app`.

> **Importante.** Este paso asume que plan 01 y plan 02 ya sustituyeron `flight`/`constellations` por `ship`/`solarSystem` en `space-engine.ts` y que el loop ya calcula `state` y `solar`. La edición de abajo solo ajusta la **línea del radar**; si los nombres de variable locales de tu integración difieren, mapea `state.position`/`state.yaw`/`state.pitch` y `solar.approaching?.app ?? null` a esos nombres. No modifiques las apps, el registry ni el iframe de la cabina.

- [ ] **Step 1: Reemplazar la llamada del radar** (full edit)

Replace the radar draw call (line ~200) with a version that passes `pitch`, the `RadarBlip[]` from the solar system, and the locked/approaching target:

```ts
    this.radar.draw(
      state.position,
      state.yaw,
      state.pitch,
      this.solarSystem.getRadarBlips(),
      solar.approaching?.app ?? null,
      this.ramatzoSun.position,
    );
```

- [ ] **Step 2: Type-check**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS — la llamada coincide con la nueva firma `draw(shipPos, yaw, pitch, blips, lockedApp, sunPos?)` y los tipos `ShipState`/`SolarUpdate`/`RadarBlip`.

- [ ] **Step 3: Build (sanity)**
  Run: `pnpm --filter @plataforma/shell build`
  Expected: el build completa sin errores de tipos ni de imports.

- [ ] **Step 4: Verificación manual (dev server)**
  Run: `pnpm --filter @plataforma/shell dev`
  Open: `http://localhost:5173`; inicia sesión; toma control de la nave (clic en el canvas / "Tomar control").
  Expected (observable en el radar arriba-izquierda):
  - **Altitud:** vuela por debajo de un planeta y comprueba que su blip muestra un **poste hacia arriba con chevron ▲**; vuela por encima y comprueba que muestra un **poste hacia abajo con chevron ▼**; a la misma altura, sin poste.
  - **Anillos de distancia fija:** los tres anillos muestran etiquetas numéricas estables (p. ej. `2.0k`, `4.0k`, `6.0k`) que **no cambian** de frame a frame al moverte (escala fija, sin autoescala).
  - **Disco inclinado:** al cabecear (mirar arriba/abajo con el ratón), el disco se aplana/inclina (escorzo por `pitch`); la línea "PROA" siempre apunta arriba (rumbo de la nave).
  - **Lock/aproximación:** al acercarte a un planeta hasta entrar en su esfera de influencia, su blip se rodea de **corchetes `[ ]` con la distancia numérica**; si el objetivo en aproximación queda fuera del disco, aparece un **puntero de rumbo** en el borde apuntando hacia él.
  - **Estética:** todo en ámbar/arena sobrio, sin colores neón chillones.

- [ ] **Step 5: Commit**
  ```
  git add shell/src/space/space-engine.ts
  git commit -m "feat(space): cablear radar 3D (yaw+pitch+blips+objetivo en aproximación)"
  ```

---

## Task 6: Verificación final de la suite

**Files:** ninguno (verificación de cierre).

- [ ] **Step 1: Run the full shell test suite**
  Run: `pnpm --filter @plataforma/shell test`
  Expected: PASS — incluido `radar-projection.test.ts` (12 casos) y sin regresiones en `layout.test.ts`/`chunks.test.ts`.

- [ ] **Step 2: Type-check de cierre**
  Run: `pnpm --filter @plataforma/shell lint`
  Expected: PASS sin errores.
