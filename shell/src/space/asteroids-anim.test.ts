import { describe, it, expect } from 'vitest';
import { assemblyFactor, HOLD_CENTER, HOLD_FRACTION } from './asteroids-anim';

const PERIOD = 40;

describe('assemblyFactor', () => {
  it('está acotado en [0,1] a lo largo de todo el ciclo', () => {
    for (let i = 0; i <= 400; i++) {
      const t = (i / 400) * PERIOD;
      const a = assemblyFactor(t, PERIOD);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  it('es determinista (misma entrada → misma salida)', () => {
    expect(assemblyFactor(13.37, PERIOD)).toBe(assemblyFactor(13.37, PERIOD));
  });

  it('es periódico (t y t+period coinciden)', () => {
    for (const t of [0, 5, 12.5, 31]) {
      expect(assemblyFactor(t, PERIOD)).toBeCloseTo(assemblyFactor(t + PERIOD, PERIOD), 6);
    }
  });

  it('arranca disperso (a≈0 al inicio del ciclo)', () => {
    expect(assemblyFactor(0, PERIOD)).toBe(0);
    expect(assemblyFactor(0.1 * PERIOD, PERIOD)).toBe(0);
  });

  it('alcanza la palabra ensamblada (a≈1) en el centro del hold', () => {
    expect(assemblyFactor(HOLD_CENTER * PERIOD, PERIOD)).toBeCloseTo(1, 6);
  });

  it('pasa la mayor parte del ciclo disperso (a<0.5 la mayoría del tiempo)', () => {
    let dispersed = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      if (assemblyFactor((i / N) * PERIOD, PERIOD) < 0.5) dispersed++;
    }
    expect(dispersed / N).toBeGreaterThan(0.5);
  });

  it('mantiene la palabra (a≈1) durante toda la fase de hold', () => {
    const holdStart = HOLD_CENTER - HOLD_FRACTION / 2;
    const holdEnd = HOLD_CENTER + HOLD_FRACTION / 2;
    for (let f = holdStart + 0.001; f < holdEnd - 0.001; f += 0.01) {
      expect(assemblyFactor(f * PERIOD, PERIOD)).toBeCloseTo(1, 6);
    }
  });

  it('es continuo (sin saltos entre muestras adyacentes)', () => {
    let prev = assemblyFactor(0, PERIOD);
    const step = PERIOD / 2000;
    for (let t = step; t <= PERIOD; t += step) {
      const cur = assemblyFactor(t, PERIOD);
      expect(Math.abs(cur - prev)).toBeLessThan(0.05);
      prev = cur;
    }
  });

  it('crece de forma monótona durante la convergencia y decrece en la dispersión', () => {
    // Convergencia: justo después de scatter sube hacia 1.
    const cA = assemblyFactor(0.46 * PERIOD, PERIOD);
    const cB = assemblyFactor(0.55 * PERIOD, PERIOD);
    expect(cB).toBeGreaterThanOrEqual(cA);
    // Dispersión: tras el hold baja hacia 0.
    const dA = assemblyFactor(0.84 * PERIOD, PERIOD);
    const dB = assemblyFactor(0.97 * PERIOD, PERIOD);
    expect(dB).toBeLessThanOrEqual(dA);
  });

  it('maneja t negativo por periodicidad', () => {
    expect(assemblyFactor(-PERIOD + HOLD_CENTER * PERIOD, PERIOD)).toBeCloseTo(1, 6);
    expect(assemblyFactor(-0.5 * PERIOD, PERIOD)).toBeGreaterThanOrEqual(0);
  });

  it('devuelve 0 ante un periodo no válido', () => {
    expect(assemblyFactor(10, 0)).toBe(0);
    expect(assemblyFactor(10, -5)).toBe(0);
    expect(assemblyFactor(Number.NaN, PERIOD)).toBe(0);
  });
});
