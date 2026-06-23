import { describe, it, expect } from 'vitest';
import { sectorOf, colorForCategory, constellationPosition, buildStarSeeds, seededRng } from './layout';

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

describe('buildStarSeeds', () => {
  it('devuelve exactamente count semillas', () => {
    expect(buildStarSeeds(12, seededRng(1)).length).toBe(12);
    expect(buildStarSeeds(0, seededRng(1)).length).toBe(0);
  });

  it('todas las semillas en [0,1)', () => {
    const seeds = buildStarSeeds(64, seededRng(7));
    for (const s of seeds) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(1);
    }
  });

  it('determinista con la misma semilla (chunk recargado = idéntico)', () => {
    expect(Array.from(buildStarSeeds(16, seededRng(42)))).toEqual(
      Array.from(buildStarSeeds(16, seededRng(42))),
    );
  });

  it('secuencia distinta con semilla distinta', () => {
    expect(Array.from(buildStarSeeds(16, seededRng(1)))).not.toEqual(
      Array.from(buildStarSeeds(16, seededRng(2))),
    );
  });
});
