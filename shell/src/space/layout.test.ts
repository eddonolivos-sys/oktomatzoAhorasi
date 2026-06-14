import { describe, it, expect } from 'vitest';
import { sectorOf, colorForCategory, constellationPosition } from './layout';

describe('sectorOf', () => {
  it('mapea origen a 0:0', () => {
    expect(sectorOf(0, 0)).toEqual({ sx: 0, sz: 0 });
  });
  it('mapea negativos con floor', () => {
    expect(sectorOf(-10, -60)).toEqual({ sx: -1, sz: -2 });
  });
  it('respeta el tamaño', () => {
    expect(sectorOf(120, 0, 50)).toEqual({ sx: 2, sz: 0 });
  });
});

describe('layout de constelaciones', () => {
  it('color por categoría conocida', () => {
    expect(colorForCategory('Juegos')).toBe(0xd43a1a);
    expect(colorForCategory('Analítica')).toBe(0xd4a84b);
  });
  it('color determinista para categoría desconocida', () => {
    expect(colorForCategory('Inexistente')).toBe(colorForCategory('Inexistente'));
  });
  it('posiciones se alejan en -Z y alternan el lado en X', () => {
    const a = constellationPosition(0);
    const b = constellationPosition(1);
    expect(a.z).toBeGreaterThan(b.z);
    expect(Math.sign(a.x)).not.toBe(Math.sign(b.x));
  });
});
