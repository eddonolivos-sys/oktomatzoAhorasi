import { describe, it, expect } from 'vitest';
import { planetLayout, orbitPosition } from './orbits';
import { planetWorldCenter } from './orbits';

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

describe('planetLayout con escala', () => {
  it('escala el radio linealmente (×scale)', () => {
    for (const i of [0, 2, 5]) {
      const base = planetLayout(i, 6, 1).radius;
      const scaled = planetLayout(i, 6, 5).radius;
      expect(scaled).toBeCloseTo(base * 5, 6);
    }
  });

  it('preserva la proporción entre radios consecutivos al escalar', () => {
    const ratioAt = (scale: number) =>
      planetLayout(3, 6, scale).radius / planetLayout(1, 6, scale).radius;
    expect(ratioAt(5)).toBeCloseTo(ratioAt(1), 10);
  });

  it('no cambia la velocidad angular con la escala (mismo ritmo orbital)', () => {
    expect(planetLayout(2, 6, 5).speed).toBe(planetLayout(2, 6, 1).speed);
  });

  it('scale por defecto = 1 (retrocompatible)', () => {
    expect(planetLayout(2, 6)).toEqual(planetLayout(2, 6, 1));
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

describe('planetWorldCenter (S1 — arregla Bug C: planetas que desaparecen)', () => {
  it('suma la posición del grupo (mundo) y la posición local del planeta', () => {
    expect(planetWorldCenter({ x: 100, y: 0, z: -50 }, { x: 10, y: 5, z: 0 })).toEqual({
      x: 110,
      y: 5,
      z: -50,
    });
  });

  it('invariante de rebase: mover el grupo en -delta desplaza el worldCenter exactamente en -delta', () => {
    const localPos = { x: 20, y: 3, z: -8 };
    const before = planetWorldCenter({ x: 0, y: 0, z: 0 }, localPos);
    const delta = { x: 100, y: 0, z: 50 };
    const groupAfterRebase = { x: -delta.x, y: -delta.y, z: -delta.z };
    const after = planetWorldCenter(groupAfterRebase, localPos);
    expect(after).toEqual({ x: before.x - delta.x, y: before.y - delta.y, z: before.z - delta.z });
  });

  it('con grupo en el origen, el worldCenter es igual a la posición local', () => {
    expect(planetWorldCenter({ x: 0, y: 0, z: 0 }, { x: 7, y: -3, z: 42 })).toEqual({ x: 7, y: -3, z: 42 });
  });
});

import { captureState } from './orbits';

describe('captureState (S2 — recalibra la captura, antes excesiva)', () => {
  const FACTORS = { influenceFactor: 3, approachHintFactor: 6 };
  const planetRadius = 100;

  it('dentro del radio de captura (influenceFactor) → capture', () => {
    expect(captureState(250, planetRadius, FACTORS)).toBe('capture');
    expect(captureState(300, planetRadius, FACTORS)).toBe('capture'); // borde inclusivo
  });

  it('entre captura y aviso → hint', () => {
    expect(captureState(301, planetRadius, FACTORS)).toBe('hint');
    expect(captureState(600, planetRadius, FACTORS)).toBe('hint'); // borde inclusivo
  });

  it('más allá del radio de aviso → far', () => {
    expect(captureState(601, planetRadius, FACTORS)).toBe('far');
    expect(captureState(10000, planetRadius, FACTORS)).toBe('far');
  });

  it('distancia 0 (nave en el centro) → capture', () => {
    expect(captureState(0, planetRadius, FACTORS)).toBe('capture');
  });
});
