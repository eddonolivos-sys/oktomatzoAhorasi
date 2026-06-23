import { describe, it, expect } from 'vitest';
import { bankFromYawRate } from './flight-math';

describe('bankFromYawRate', () => {
  it('sin giro → sin alabeo', () => {
    expect(bankFromYawRate(0, 6, 0.6)).toBe(0);
  });

  it('girar a la izquierda (yawRate > 0) inclina al lado contrario del giro de yaw', () => {
    // Convención: targetRoll = -yawRate * kRoll. yawRate>0 → roll negativo.
    expect(bankFromYawRate(0.1, 6, 0.6)).toBeLessThan(0);
  });

  it('girar a la derecha (yawRate < 0) → roll positivo', () => {
    expect(bankFromYawRate(-0.1, 6, 0.6)).toBeGreaterThan(0);
  });

  it('es antisimétrico respecto al signo de yawRate', () => {
    expect(bankFromYawRate(0.2, 6, 0.6)).toBeCloseTo(-bankFromYawRate(-0.2, 6, 0.6), 10);
  });

  it('crece (en magnitud) monótonamente con |yawRate| antes del clamp', () => {
    const a = Math.abs(bankFromYawRate(0.02, 6, 5));
    const b = Math.abs(bankFromYawRate(0.05, 6, 5));
    expect(b).toBeGreaterThan(a);
  });

  it('hace clamp al máximo positivo', () => {
    // yawRate muy negativo, k grande → tiende a +∞, se limita a +maxRoll.
    expect(bankFromYawRate(-100, 6, 0.6)).toBe(0.6);
  });

  it('hace clamp al máximo negativo', () => {
    expect(bankFromYawRate(100, 6, 0.6)).toBe(-0.6);
  });
});

import { approachBrakeFactor } from './flight-math';

describe('approachBrakeFactor', () => {
  const R = 1000;
  const MIN = 0.2;

  it('vale 1 en el borde de la esfera de influencia', () => {
    expect(approachBrakeFactor(R, R, MIN)).toBeCloseTo(1, 10);
  });

  it('vale 1 más allá del borde (sin frenar lejos)', () => {
    expect(approachBrakeFactor(R * 2, R, MIN)).toBe(1);
    expect(approachBrakeFactor(R + 1, R, MIN)).toBe(1);
  });

  it('vale minFactor en el núcleo (distancia 0)', () => {
    expect(approachBrakeFactor(0, R, MIN)).toBeCloseTo(MIN, 10);
  });

  it('es lineal: en distance = R/2 vale minFactor + (1 - minFactor) * 0.5', () => {
    expect(approachBrakeFactor(R / 2, R, MIN)).toBeCloseTo(MIN + (1 - MIN) * 0.5, 10);
  });

  it('es monótona creciente del núcleo al borde', () => {
    const a = approachBrakeFactor(100, R, MIN);
    const b = approachBrakeFactor(500, R, MIN);
    const c = approachBrakeFactor(900, R, MIN);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('es continua en el borde (no salta al pasar de fuera a dentro)', () => {
    const inside = approachBrakeFactor(R - 0.001, R, MIN);
    const outside = approachBrakeFactor(R + 0.001, R, MIN);
    expect(Math.abs(inside - outside)).toBeLessThan(0.01);
  });

  it('nunca baja de minFactor', () => {
    expect(approachBrakeFactor(0, R, MIN)).toBeGreaterThanOrEqual(MIN);
    expect(approachBrakeFactor(-50, R, MIN)).toBeGreaterThanOrEqual(MIN);
  });

  it('radio de influencia <= 0 no frena (devuelve 1)', () => {
    expect(approachBrakeFactor(0, 0, MIN)).toBe(1);
  });
});

import { limitAngularStep } from './flight-math';

describe('limitAngularStep', () => {
  it('dentro del límite → devuelve target exacto (preserva 1:1)', () => {
    // |target-current| = 0.01 <= maxRate*delta = 30*0.016 = 0.48
    expect(limitAngularStep(1.0, 1.01, 30, 0.016)).toBe(1.01);
  });

  it('salto positivo grande → recorta a current + maxRate*delta', () => {
    expect(limitAngularStep(0, 2, 30, 0.016)).toBeCloseTo(0.48, 10);
  });

  it('salto negativo grande → recorta a current - maxRate*delta (antisimetría)', () => {
    expect(limitAngularStep(0, -2, 30, 0.016)).toBeCloseTo(-0.48, 10);
  });

  it('maxRate = Infinity → devuelve target (interruptor sin efecto)', () => {
    expect(limitAngularStep(0, 12345, Infinity, 0.016)).toBe(12345);
  });

  it('idempotente al converger (current === target)', () => {
    expect(limitAngularStep(0.7, 0.7, 30, 0.016)).toBe(0.7);
  });
});
