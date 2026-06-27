import { describe, it, expect } from 'vitest';
import { stepOrbit, ejectVelocity, type OrbitState, type OrbitInput } from './orbit';

const PARAMS = { cooldownDuration: 1.0, captureGrace: 0.5 };
const FREE: OrbitState = { phase: 'free', cooldown: 0, grace: 0 };
const orbiting = (grace = 0): OrbitState => ({ phase: 'orbiting', cooldown: 0, grace });
const baseInput: OrbitInput = { insideInfluence: false, enterPressed: false, thrustActive: false, dt: 0.016 };

describe('stepOrbit', () => {
  it('captura: free + dentro de influencia → orbiting con grace = captureGrace', () => {
    const r = stepOrbit(FREE, { ...baseInput, insideInfluence: true }, PARAMS);
    expect(r.state.phase).toBe('orbiting');
    expect(r.state.grace).toBeCloseTo(PARAMS.captureGrace, 6);
    expect(r.action).toBe('none');
  });

  it('free + fuera de influencia → sigue free', () => {
    const r = stepOrbit(FREE, baseInput, PARAMS);
    expect(r.state.phase).toBe('free');
    expect(r.action).toBe('none');
  });

  it('orbiting + E → acción enter', () => {
    const r = stepOrbit(orbiting(0), { ...baseInput, insideInfluence: true, enterPressed: true }, PARAMS);
    expect(r.action).toBe('enter');
  });

  it('durante la GRACE el empuje no expulsa (acercarse con W no provoca expulsión instantánea)', () => {
    const r = stepOrbit(orbiting(0.5), { ...baseInput, insideInfluence: true, thrustActive: true, dt: 0.1 }, PARAMS);
    expect(r.state.phase).toBe('orbiting');
    expect(r.state.grace).toBeCloseTo(0.4, 6);
    expect(r.action).toBe('none');
  });

  it('tras la GRACE, el empuje (incluso mantenido) expulsa → no quedarse atrapado', () => {
    const r = stepOrbit(orbiting(0), { ...baseInput, insideInfluence: true, thrustActive: true }, PARAMS);
    expect(r.state.phase).toBe('ejecting');
    expect(r.state.cooldown).toBeCloseTo(PARAMS.cooldownDuration, 6);
    expect(r.action).toBe('eject');
  });

  it('orbiting + sale de influencia → free', () => {
    const r = stepOrbit(orbiting(0), { ...baseInput, insideInfluence: false }, PARAMS);
    expect(r.state.phase).toBe('free');
  });

  it('ejecting: descuenta cooldown y NO recaptura dentro de influencia', () => {
    const e: OrbitState = { phase: 'ejecting', cooldown: 1.0, grace: 0 };
    const r = stepOrbit(e, { ...baseInput, insideInfluence: true, dt: 0.4 }, PARAMS);
    expect(r.state.phase).toBe('ejecting');
    expect(r.state.cooldown).toBeCloseTo(0.6, 6);
    expect(r.action).toBe('none');
  });

  it('ejecting: al agotar el cooldown vuelve a free', () => {
    const e: OrbitState = { phase: 'ejecting', cooldown: 0.1, grace: 0 };
    const r = stepOrbit(e, { ...baseInput, insideInfluence: true, dt: 0.2 }, PARAMS);
    expect(r.state.phase).toBe('free');
  });

  it('orbiting: enter tiene prioridad sobre el empuje simultáneo', () => {
    const r = stepOrbit(
      orbiting(0),
      { ...baseInput, insideInfluence: true, enterPressed: true, thrustActive: true },
      PARAMS,
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
