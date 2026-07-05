import { describe, it, expect } from 'vitest';
import { sub, add, scale, cross, dot, length, normalize } from './vec3-math';

describe('vec3-math (helpers puros compartidos por orbit-frame/orbit-camera)', () => {
  it('sub resta componente a componente', () => {
    expect(sub({ x: 5, y: 3, z: 1 }, { x: 1, y: 1, z: 1 })).toEqual({ x: 4, y: 2, z: 0 });
  });

  it('add suma componente a componente', () => {
    expect(add({ x: 1, y: 2, z: 3 }, { x: 10, y: 20, z: 30 })).toEqual({ x: 11, y: 22, z: 33 });
  });

  it('scale multiplica cada componente por k', () => {
    expect(scale({ x: 1, y: -2, z: 3 }, 2)).toEqual({ x: 2, y: -4, z: 6 });
  });

  it('dot es el producto escalar', () => {
    expect(dot({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })).toBe(32);
  });

  it('cross es perpendicular a ambos operandos', () => {
    const a = { x: 1, y: 0, z: 0 };
    const b = { x: 0, y: 1, z: 0 };
    const c = cross(a, b);
    expect(c).toEqual({ x: 0, y: 0, z: 1 });
    expect(dot(c, a)).toBeCloseTo(0, 10);
    expect(dot(c, b)).toBeCloseTo(0, 10);
  });

  it('length es la norma euclídea', () => {
    expect(length({ x: 3, y: 4, z: 0 })).toBeCloseTo(5, 10);
  });

  it('normalize produce un vector unitario en la misma dirección', () => {
    const n = normalize({ x: 3, y: 4, z: 0 });
    expect(length(n)).toBeCloseTo(1, 10);
    expect(n.x).toBeCloseTo(0.6, 10);
    expect(n.y).toBeCloseTo(0.8, 10);
  });

  it('normalize de un vector ~0 no produce NaN (degenerado → vector nulo)', () => {
    const n = normalize({ x: 0, y: 0, z: 0 });
    expect(n).toEqual({ x: 0, y: 0, z: 0 });
    expect(Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z)).toBe(true);
  });
});
