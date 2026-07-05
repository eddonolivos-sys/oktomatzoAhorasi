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
