import { describe, it, expect } from 'vitest';
import { thrusterGain, duckingGain } from './audio-math';

describe('thrusterGain', () => {
  it('en reposo (speed=0) da gain 0', () => {
    expect(thrusterGain(0, 1000)).toBe(0);
  });

  it('a speedRef exacto satura en 1', () => {
    expect(thrusterGain(1000, 1000)).toBeCloseTo(1, 10);
  });

  it('por encima de speedRef se acota en 1 (no sobrepasa)', () => {
    expect(thrusterGain(5000, 1000)).toBeCloseTo(1, 10);
  });

  it('curva raíz cuadrada: a un cuarto de speedRef da la mitad del gain', () => {
    expect(thrusterGain(250, 1000)).toBeCloseTo(0.5, 10);
  });

  it('speedRef <= 0 no produce división por cero ni NaN', () => {
    expect(thrusterGain(100, 0)).toBe(0);
    expect(Number.isFinite(thrusterGain(100, -5))).toBe(true);
  });
});

describe('duckingGain', () => {
  it('converge hacia duckLevel cuando inCockpit=true', () => {
    let g = 1;
    for (let i = 0; i < 300; i++) g = duckingGain(g, true, 0.2, 8, 1 / 60);
    expect(g).toBeCloseTo(0.2, 3);
  });

  it('converge hacia 1 cuando inCockpit=false', () => {
    let g = 0.2;
    for (let i = 0; i < 300; i++) g = duckingGain(g, false, 0.2, 8, 1 / 60);
    expect(g).toBeCloseTo(1, 3);
  });

  it('con delta=0 no cambia', () => {
    expect(duckingGain(0.5, true, 0.2, 8, 0)).toBeCloseTo(0.5, 10);
  });

  it('nunca sobrepasa el rango entre el valor actual y el target', () => {
    const g = duckingGain(1, true, 0.2, 8, 0.05);
    expect(g).toBeLessThanOrEqual(1);
    expect(g).toBeGreaterThanOrEqual(0.2);
  });
});
