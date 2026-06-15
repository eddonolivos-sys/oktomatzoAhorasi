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
