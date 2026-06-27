import { describe, it, expect } from 'vitest';
import { stepOrbit, ejectVelocity, type OrbitState, type OrbitInput } from './orbit';

const FREE: OrbitState = { phase: 'free', cooldown: 0 };
const ORBIT: OrbitState = { phase: 'orbiting', cooldown: 0 };
const CD = 1.0;
const baseInput: OrbitInput = { insideInfluence: false, enterPressed: false, thrustPressed: false, dt: 0.016 };

describe('stepOrbit', () => {
  it('captura: free + dentro de influencia → orbiting', () => {
    const r = stepOrbit(FREE, { ...baseInput, insideInfluence: true }, CD);
    expect(r.state.phase).toBe('orbiting');
    expect(r.action).toBe('none');
  });

  it('free + fuera de influencia → sigue free', () => {
    const r = stepOrbit(FREE, baseInput, CD);
    expect(r.state.phase).toBe('free');
    expect(r.action).toBe('none');
  });

  it('orbiting + E → acción enter', () => {
    const r = stepOrbit(ORBIT, { ...baseInput, insideInfluence: true, enterPressed: true }, CD);
    expect(r.action).toBe('enter');
  });

  it('orbiting + pulsación de empuje (flanco) → ejecting + acción eject', () => {
    const r = stepOrbit(ORBIT, { ...baseInput, insideInfluence: true, thrustPressed: true }, CD);
    expect(r.state.phase).toBe('ejecting');
    expect(r.state.cooldown).toBeCloseTo(CD, 6);
    expect(r.action).toBe('eject');
  });

  it('orbiting + empuje MANTENIDO (sin flanco) NO expulsa (acercarse con W no rompe la órbita)', () => {
    const r = stepOrbit(ORBIT, { ...baseInput, insideInfluence: true, thrustPressed: false }, CD);
    expect(r.state.phase).toBe('orbiting');
    expect(r.action).toBe('none');
  });

  it('orbiting + sale de influencia → free', () => {
    const r = stepOrbit(ORBIT, { ...baseInput, insideInfluence: false }, CD);
    expect(r.state.phase).toBe('free');
  });

  it('ejecting: descuenta cooldown y NO recaptura dentro de influencia', () => {
    const e: OrbitState = { phase: 'ejecting', cooldown: 1.0 };
    const r = stepOrbit(e, { ...baseInput, insideInfluence: true, dt: 0.4 }, CD);
    expect(r.state.phase).toBe('ejecting');
    expect(r.state.cooldown).toBeCloseTo(0.6, 6);
    expect(r.action).toBe('none');
  });

  it('ejecting: al agotar el cooldown vuelve a free', () => {
    const e: OrbitState = { phase: 'ejecting', cooldown: 0.1 };
    const r = stepOrbit(e, { ...baseInput, insideInfluence: true, dt: 0.2 }, CD);
    expect(r.state.phase).toBe('free');
  });

  it('orbiting: enter tiene prioridad sobre el empuje simultáneo', () => {
    const r = stepOrbit(
      ORBIT,
      { ...baseInput, insideInfluence: true, enterPressed: true, thrustPressed: true },
      CD,
    );
    expect(r.action).toBe('enter');
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
