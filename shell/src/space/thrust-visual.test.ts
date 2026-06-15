import { describe, it, expect } from 'vitest';
import { thrustGlow } from './thrust-visual';

describe('thrustGlow', () => {
  it('en reposo da un mínimo de ralentí, no cero', () => {
    const g = thrustGlow(0, false);
    expect(g.length).toBeGreaterThan(0);
    expect(g.glow).toBeGreaterThan(0);
    expect(g.trailOpacity).toBeGreaterThanOrEqual(0);
    expect(g.length).toBeLessThan(0.5); // ralentí discreto
  });

  it('length y glow crecen de forma monótona con la velocidad', () => {
    const slow = thrustGlow(50, false);
    const fast = thrustGlow(400, false);
    expect(fast.length).toBeGreaterThan(slow.length);
    expect(fast.glow).toBeGreaterThan(slow.glow);
    expect(fast.trailOpacity).toBeGreaterThan(slow.trailOpacity);
  });

  it('satura: a velocidad enorme los factores quedan acotados (<= máximos)', () => {
    const huge = thrustGlow(100000, false);
    expect(huge.length).toBeLessThanOrEqual(1.0001);
    expect(huge.glow).toBeLessThanOrEqual(1.0001);
    expect(huge.trailOpacity).toBeLessThanOrEqual(1.0001);
  });

  it('nitro empuja por encima del mismo speed sin nitro', () => {
    const normal = thrustGlow(200, false);
    const nitro = thrustGlow(200, true);
    expect(nitro.length).toBeGreaterThan(normal.length);
    expect(nitro.glow).toBeGreaterThan(normal.glow);
  });

  it('clamp de velocidad negativa: no produce NaN ni valores < mínimo', () => {
    const g = thrustGlow(-100, false);
    expect(Number.isFinite(g.length)).toBe(true);
    expect(g.length).toBeGreaterThan(0);
    expect(g.glow).toBeGreaterThan(0);
  });
});
