import { describe, it, expect } from 'vitest';
import { parallaxOffset } from './parallax';

describe('parallaxOffset', () => {
  it('factor 0 deja la capa fija en el origen', () => {
    expect(parallaxOffset({ x: 1000, y: -500, z: 3000 }, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('factor 1 pega la capa al jugador (sin parallax)', () => {
    expect(parallaxOffset({ x: 1000, y: -500, z: 3000 }, 1)).toEqual({ x: 1000, y: -500, z: 3000 });
  });

  it('factor intermedio escala linealmente cada eje', () => {
    expect(parallaxOffset({ x: 200, y: 100, z: -400 }, 0.25)).toEqual({ x: 50, y: 25, z: -100 });
  });

  it('clampa el factor por debajo de 0 a 0', () => {
    expect(parallaxOffset({ x: 800, y: 0, z: 0 }, -2)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('clampa el factor por encima de 1 a 1', () => {
    expect(parallaxOffset({ x: 800, y: 0, z: 0 }, 5)).toEqual({ x: 800, y: 0, z: 0 });
  });

  it('es lineal: duplicar la posicion duplica el offset', () => {
    const a = parallaxOffset({ x: 100, y: 50, z: 25 }, 0.4);
    const b = parallaxOffset({ x: 200, y: 100, z: 50 }, 0.4);
    expect(b.x).toBeCloseTo(a.x * 2, 6);
    expect(b.y).toBeCloseTo(a.y * 2, 6);
    expect(b.z).toBeCloseTo(a.z * 2, 6);
  });
});
