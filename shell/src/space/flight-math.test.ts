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

import { lookRateFromCursor } from './flight-math';

describe('lookRateFromCursor', () => {
  const DZ = 0.1;
  const MAX = 2;

  it('cursor centrado → sin giro', () => {
    expect(lookRateFromCursor(0, 0, DZ, MAX)).toEqual({ yawRate: 0, pitchRate: 0 });
  });

  it('dentro de la zona muerta → sin giro', () => {
    expect(lookRateFromCursor(DZ, -DZ, DZ, MAX)).toEqual({ yawRate: 0, pitchRate: 0 });
    expect(lookRateFromCursor(0.05, 0.05, DZ, MAX)).toEqual({ yawRate: 0, pitchRate: 0 });
  });

  it('cursor a la derecha (dx>0) → gira a la derecha (yawRate < 0)', () => {
    expect(lookRateFromCursor(0.5, 0, DZ, MAX).yawRate).toBeLessThan(0);
  });

  it('cursor a la izquierda (dx<0) → yawRate > 0', () => {
    expect(lookRateFromCursor(-0.5, 0, DZ, MAX).yawRate).toBeGreaterThan(0);
  });

  it('cursor abajo (dy>0) → mira abajo (pitchRate < 0)', () => {
    expect(lookRateFromCursor(0, 0.5, DZ, MAX).pitchRate).toBeLessThan(0);
  });

  it('cursor arriba (dy<0) → pitchRate > 0', () => {
    expect(lookRateFromCursor(0, -0.5, DZ, MAX).pitchRate).toBeGreaterThan(0);
  });

  it('es antisimétrico en cada eje', () => {
    expect(lookRateFromCursor(0.6, 0, DZ, MAX).yawRate).toBeCloseTo(-lookRateFromCursor(-0.6, 0, DZ, MAX).yawRate, 10);
    expect(lookRateFromCursor(0, 0.6, DZ, MAX).pitchRate).toBeCloseTo(-lookRateFromCursor(0, -0.6, DZ, MAX).pitchRate, 10);
  });

  it('crece (en magnitud) monótonamente fuera de la zona muerta', () => {
    const a = Math.abs(lookRateFromCursor(0.3, 0, DZ, MAX).yawRate);
    const b = Math.abs(lookRateFromCursor(0.7, 0, DZ, MAX).yawRate);
    expect(b).toBeGreaterThan(a);
  });

  it('se satura a maxRate en el borde y no lo supera más allá', () => {
    const edge = Math.abs(lookRateFromCursor(1, 0, DZ, MAX).yawRate);
    const beyond = Math.abs(lookRateFromCursor(3, 0, DZ, MAX).yawRate);
    expect(edge).toBeCloseTo(MAX, 10);
    expect(beyond).toBeCloseTo(MAX, 10);
  });
});
