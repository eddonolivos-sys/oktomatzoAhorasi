import { describe, it, expect } from 'vitest';
import { startingSlotPosition } from './race-grid';

describe('startingSlotPosition', () => {
  const waypoints = [
    { x: 100, y: 50, z: 0 },
    { x: 0, y: 80, z: 100 },
  ];
  const w0 = waypoints[0]!;

  it('slotIndex=0 returns waypoints[0] exactly', () => {
    const pos = startingSlotPosition(waypoints, 0, 60);
    expect(pos).toEqual({ x: 100, y: 50, z: 0 });
  });

  it('slotIndex=1 and slotIndex=-1 are equidistant on opposite sides', () => {
    const plus = startingSlotPosition(waypoints, 1, 60);
    const minus = startingSlotPosition(waypoints, -1, 60);
    const distPlus = Math.hypot(plus.x - w0.x, plus.z - w0.z);
    const distMinus = Math.hypot(minus.x - w0.x, minus.z - w0.z);
    expect(distPlus).toBeCloseTo(60, 5);
    expect(distMinus).toBeCloseTo(60, 5);
    expect(plus.x).toBeCloseTo(-minus.x + 2 * w0.x, 5);
    expect(plus.z).toBeCloseTo(-minus.z + 2 * w0.z, 5);
  });

  it('keeps the y of waypoints[0] (flat grid)', () => {
    const pos = startingSlotPosition(waypoints, 2, 60);
    expect(pos.y).toBe(50);
  });

  it('with fewer than 2 waypoints returns waypoints[0] unchanged', () => {
    const pos = startingSlotPosition([{ x: 5, y: 6, z: 7 }], 3, 60);
    expect(pos).toEqual({ x: 5, y: 6, z: 7 });
  });

  it('with an empty list returns the origin without throwing', () => {
    expect(() => startingSlotPosition([], 0, 60)).not.toThrow();
    expect(startingSlotPosition([], 0, 60)).toEqual({ x: 0, y: 0, z: 0 });
  });
});
