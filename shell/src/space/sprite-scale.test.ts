import { describe, it, expect } from 'vitest';
import { markerScaleForDistance } from './sprite-scale';

describe('markerScaleForDistance', () => {
  const fov = Math.PI / 3; // 60°

  it('never shrinks below baseScale at short distance', () => {
    const scale = markerScaleForDistance(200, 500, fov, 0.02);
    expect(scale).toBe(200);
  });

  it('grows past baseScale once the angular size would fall below the floor', () => {
    const scale = markerScaleForDistance(200, 100000, fov, 0.02);
    expect(scale).toBeGreaterThan(200);
  });

  it('scales linearly with distance once past the floor', () => {
    const a = markerScaleForDistance(1, 100000, fov, 0.02);
    const b = markerScaleForDistance(1, 200000, fov, 0.02);
    expect(b / a).toBeCloseTo(2, 5);
  });

  it('matches the closed-form visible-height computation', () => {
    const distance = 100000;
    const minScreenFraction = 0.02;
    const visibleHeight = 2 * distance * Math.tan(fov / 2);
    const expected = visibleHeight * minScreenFraction;
    expect(markerScaleForDistance(1, distance, fov, minScreenFraction)).toBeCloseTo(expected, 5);
  });

  it('at distance 0 returns baseScale (no division by zero / negative)', () => {
    expect(markerScaleForDistance(50, 0, fov, 0.02)).toBe(50);
  });
});
