# Spec — Mejora #1: Suavizado de giros (clamp de tasa angular)

- **Fecha:** 2026-06-22
- **Rama:** `ramatzo`
- **Bloque:** 2 (7 mejoras del espacio 3D). Orden aprobado: **7 → 1 → 2 → 4 → 3 → 5 → 6** (#7 ya code-complete).
- **Alcance:** control de mirada del jugador en `shell/src/space/`. No toca apps, registry, cabina ni multijugador.

## Contexto

La mirada se fija **1:1 en tiempo real** en [`ShipController.onMouseMove`](../../../shell/src/space/ship-controller.ts) (líneas 144-149): `yaw -= movementX·sensitivity`, `pitch -= movementY·sensitivity` (con clamp de pitch a ±`pitchLimit`). Es síncrono y **sin `delta`**. Luego [`update(delta)`](../../../shell/src/space/ship-controller.ts) (165) deriva `yawRate = (yaw − prevYaw)/delta` para el alabeo (`bankFromYawRate`) y compone el quaternion.

El usuario calibró esta respuesta directa y la quiere conservar; solo molesta que un **movimiento brusco** del ratón produce un salto angular igualmente brusco (y un tirón de banking). Objetivo: **amortiguar solo los picos**, sin tocar la sensación 1:1 normal.

Nota: el comentario de clase (líneas 26-27) está **desactualizado** (describe `targetYaw/targetPitch` + `damp` que ya no existen); se corrige en esta mejora.

## Decisiones (confirmadas en brainstorming)

| Eje | Decisión |
|---|---|
| Filtro | **Clamp duro de tasa angular** (lineal). Por debajo del umbral: 1:1 exacto; por encima: recorta el paso a `maxLookRate·delta`. NO exponencial (introduciría lag constante y rompería el 1:1) |
| Ejes | **yaw y pitch**. El pitch conserva su tope de posición ±85° (`pitchLimit`) |
| Umbral | `maxLookRate` (rad/s) **alto** por defecto (~30 rad/s ≈ 1700°/s); recorta solo picos extremos; se afina en dev server |
| Configurable | `sensitivity` y `maxLookRate` en `space-config.ts`, marcados `[PERSONALIZABLE #5]` |
| Activación | **Siempre activo** (también con nitro; el nitro solo afecta al empuje) |

## Arquitectura — dos etapas en `ship-controller.ts`

El limitador necesita `delta`, pero `onMouseMove` no lo tiene y puede recibir varios eventos coalescidos por frame. Por eso se separa **captar input** de **aplicar el límite**:

- **Etapa A — desacoplar input.** Nuevos campos `rawYaw`, `rawPitch` (init 0). `onMouseMove` escribe en `rawYaw/rawPitch` (en vez de `yaw/pitch`); el clamp ±`pitchLimit` se aplica sobre `rawPitch`. `yaw/pitch` pasan a ser la mirada *aplicada* (suavizada).
- **Etapa B — limitar en el frame.** Al inicio de `update(delta)`, **antes** del cálculo de `yawRate` (169), deslizar:
  ```ts
  this.yaw   = limitAngularStep(this.yaw,   this.rawYaw,   this.maxLookRate, delta);
  this.pitch = limitAngularStep(this.pitch, this.rawPitch, this.maxLookRate, delta);
  ```
  El resto de `update` (yawRate → roll → quaternion → integración) queda **igual**. `chase-camera` hereda el suavizado automáticamente (sigue al raíz por resorte; no se toca).

Como `rawPitch` ya está dentro de ±`pitchLimit`, `pitch` (que se desliza hacia él) nunca lo supera. Al suavizar el pico de `yaw`, el `yawRate` resultante baja → el banking deja de dar tirones (efecto secundario deseable, sin cambios en `bankFromYawRate`).

## Lógica pura (TDD) en `flight-math.ts`

```ts
/** Desliza `current` hacia `target` limitando el paso a maxRate·delta (recorta solo el exceso). */
export function limitAngularStep(current: number, target: number, maxRate: number, delta: number): number {
  const maxStep = maxRate * delta;
  const d = target - current;
  if (d > maxStep) return current + maxStep;
  if (d < -maxStep) return current - maxStep;
  return target; // dentro del límite → 1:1 exacto
}
```

Tests (Vitest, node, sin Three.js):
1. `|target−current| ≤ maxRate·delta` ⇒ devuelve `target` exacto (preserva 1:1, sin pérdida de precisión).
2. Salto positivo grande ⇒ `current + maxRate·delta` (recorte exacto del pico).
3. Salto negativo grande ⇒ `current − maxRate·delta` (antisimetría de signo).
4. `maxRate = Infinity` (o `delta` enorme) ⇒ `target` (interruptor sin efecto).
5. Idempotencia: si `current === target` ⇒ `target` (se queda).

## Config

Nueva sección en `space-config.ts`:

```ts
/** Control de vuelo / mirada del jugador (mejora #1). */
export const CONTROL_CONFIG = {
  sensitivity: 0.0022, // [PERSONALIZABLE #5] rad de yaw/pitch por px de movimiento del ratón
  maxLookRate: 30,     // [PERSONALIZABLE #5] velocidad angular máx. (rad/s); recorta solo picos
};
```

`ShipController` lee estos valores como defaults (campos públicos `sensitivity`, `maxLookRate` inicializados desde `CONTROL_CONFIG`), de modo que siguen siendo sintonizables en caliente y la mejora #5 podrá exponerlos.

## Rendimiento y riesgo

Cambio local a `ship-controller.ts` + una función pura. Sin coste relevante. Riesgo = *sensación*: `maxLookRate` muy bajo se siente "pegajoso"; muy alto no recorta nada. Mitigado: empieza alto (solo picos), es afinable y testeable de forma aislada. El `delta` del loop está saneado (16–100 ms, `space-engine.ts:262`), así que el clamp por frame no se descalibra en frames largos.

## Verificación

- `pnpm --filter @plataforma/shell test` (incluye los nuevos tests de `limitAngularStep`).
- `pnpm --filter @plataforma/shell lint` (`tsc --noEmit`).
- `pnpm --filter @plataforma/shell build` (`tsc && vite build`).
- Visual/sensación: dev server / arnés (lo prueba el usuario; calibra `maxLookRate`).

## Fuera de alcance

- Cambiar la sensibilidad base o el modelo de mirada 1:1 (solo se recortan picos).
- `chase-camera`, banking (`bankFromYawRate`), el resto del control (empuje/strafe/nitro/damping).
- UI del menú de configuración (mejora #5; aquí solo se deja `CONTROL_CONFIG` listo y marcado).
