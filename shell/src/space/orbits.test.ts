import { describe, it, expect } from 'vitest';
import { planetLayout, orbitPosition } from './orbits';

describe('planetLayout', () => {
  it('es determinista para el mismo índice/total', () => {
    expect(planetLayout(2, 6)).toEqual(planetLayout(2, 6));
  });

  it('reparte los radios entre ~1200 y ~6000 u, crecientes por índice', () => {
    const total = 6;
    const a = planetLayout(0, total);
    const b = planetLayout(total - 1, total);
    expect(a.radius).toBeGreaterThanOrEqual(1200);
    expect(b.radius).toBeLessThanOrEqual(6000);
    expect(b.radius).toBeGreaterThan(a.radius);
  });

  it('inclina las órbitas y varía la inclinación entre planetas (usa la 3a dimensión)', () => {
    const incs = Array.from({ length: 6 }, (_, i) => planetLayout(i, 6).inclination);
    // Al menos una inclinación claramente no nula.
    expect(incs.some((v) => Math.abs(v) > 0.05)).toBe(true);
    // No todas iguales: hay variación real entre planetas.
    expect(new Set(incs.map((v) => v.toFixed(4))).size).toBeGreaterThan(1);
    // Acotadas a un rango razonable (|inc| <= ~35°).
    expect(incs.every((v) => Math.abs(v) <= 0.62)).toBe(true);
  });

  it('da fases distintas y velocidades positivas y lentas', () => {
    const a = planetLayout(0, 6);
    const b = planetLayout(1, 6);
    expect(a.phase).not.toBe(b.phase);
    expect(a.speed).toBeGreaterThan(0);
    expect(a.speed).toBeLessThan(0.2);
  });
});

describe('orbitPosition', () => {
  it('en t=0 con fase 0 y sin inclinación queda sobre +X', () => {
    const p = orbitPosition(1000, 0, 0, 0.05, 0);
    expect(p.x).toBeCloseTo(1000, 6);
    expect(p.y).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });

  it('mantiene el radio horizontal constante a lo largo del tiempo', () => {
    const r = 1500;
    const at = (t: number) => orbitPosition(r, 0, 0.3, 0.04, t);
    const p0 = at(0);
    const p1 = at(12.5);
    const horiz = (p: { x: number; z: number }) => Math.hypot(p.x, p.z);
    expect(horiz(p1)).toBeCloseTo(horiz(p0), 4);
  });

  it('con inclinación no nula introduce componente Y al avanzar', () => {
    const p = orbitPosition(1000, 0.5, 0, 0.05, 5);
    expect(Math.abs(p.y)).toBeGreaterThan(0.0001);
  });

  it('avanza con el tiempo según la velocidad (la posición cambia)', () => {
    const a = orbitPosition(1000, 0.2, 0, 0.05, 0);
    const b = orbitPosition(1000, 0.2, 0, 0.05, 3);
    expect(a.x === b.x && a.z === b.z).toBe(false);
  });
});
