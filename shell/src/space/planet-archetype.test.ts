import { describe, it, expect } from 'vitest';
import { planetArchetype, ARCHETYPE_COUNT } from './planet-archetype';

describe('planetArchetype', () => {
  it('es determinista: misma semilla → mismo arquetipo', () => {
    for (const seed of [1, 7, 42, 1337, 99999, 2654435761]) {
      expect(planetArchetype(seed)).toBe(planetArchetype(seed));
    }
  });

  it('siempre devuelve un índice entero dentro de rango [0, ARCHETYPE_COUNT)', () => {
    for (let seed = 0; seed < 500; seed++) {
      const a = planetArchetype(seed);
      expect(Number.isInteger(a)).toBe(true);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(ARCHETYPE_COUNT);
    }
  });

  it('hay al menos 6 arquetipos distintos', () => {
    expect(ARCHETYPE_COUNT).toBeGreaterThanOrEqual(6);
  });

  it('semillas distintas se reparten entre arquetipos (no todos iguales)', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) seen.add(planetArchetype(seed));
    // Esperamos que se cubran todos (o casi todos) los arquetipos.
    expect(seen.size).toBeGreaterThanOrEqual(ARCHETYPE_COUNT);
  });

  it('tolera semillas negativas y cero sin salir de rango', () => {
    for (const seed of [0, -1, -42, -999999]) {
      const a = planetArchetype(seed);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(ARCHETYPE_COUNT);
    }
  });
});
